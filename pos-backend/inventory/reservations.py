# inventory/reservations.py
"""
Reservation service for managing stock reservations across multiple channels.
Reservations hold stock without affecting on_hand until committed.
"""
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from .models import InventoryItem, StockLedger
from .models_reservations import Reservation
from stores.models import Store
from catalog.models import Variant


class ReservationError(Exception):
    """Base exception for reservation operations"""
    pass


class InsufficientStockError(ReservationError):
    """Raised when trying to reserve more stock than available"""
    pass


def reserve_stock(
    tenant,
    store_id,
    variant_id,
    qty,
    ref_type,
    ref_id=None,
    channel="POS",
    user=None,
    note="",
    expires_at=None,
):
    """
    Reserve stock for a specific variant at a store.
    
    Args:
        tenant: Tenant instance
        store_id: Store ID
        variant_id: Variant ID
        qty: Quantity to reserve (must be > 0)
        ref_type: Reference type (e.g., "POS_CART", "WEB_ORDER")
        ref_id: Optional reference ID
        channel: Channel identifier (default: "POS")
        user: User creating the reservation
        note: Optional note
        expires_at: Optional expiration datetime
    
    Returns:
        Reservation instance
    
    Raises:
        InsufficientStockError: If stock is insufficient and backorders not allowed
        ValidationError: If parameters are invalid
    """
    if qty <= 0:
        raise ValidationError("Reservation quantity must be greater than 0")
    
    # Validate store belongs to tenant
    try:
        store = Store.objects.get(id=store_id, tenant=tenant)
    except Store.DoesNotExist:
        raise ValidationError(f"Store {store_id} not found or does not belong to tenant")
    
    # Validate variant belongs to tenant
    try:
        variant = Variant.objects.get(id=variant_id, product__tenant=tenant, is_active=True)
    except Variant.DoesNotExist:
        raise ValidationError(f"Variant {variant_id} not found or does not belong to tenant")
    
    with transaction.atomic():
        # Lock inventory item
        item, _ = InventoryItem.objects.select_for_update().get_or_create(
            tenant=tenant,
            store=store,
            variant=variant,
            defaults={"on_hand": Decimal("0"), "reserved": Decimal("0")},
        )
        
        # Check available stock
        available = Decimal(str(item.on_hand)) - Decimal(str(item.reserved))
        allow_backorders = getattr(tenant, "allow_backorders", False)
        
        if not allow_backorders and qty > available:
            raise InsufficientStockError(
                f"Insufficient stock: requested {qty}, available {available} "
                f"(on_hand={item.on_hand}, reserved={item.reserved})"
            )
        
        # Create reservation
        reservation = Reservation.objects.create(
            tenant=tenant,
            store=store,
            variant=variant,
            quantity=qty,
            ref_type=ref_type,
            ref_id=ref_id,
            channel=channel,
            note=note,
            expires_at=expires_at,
            created_by=user,
            status="ACTIVE",
        )
        
        # Update reserved quantity
        item.reserved = Decimal(str(item.reserved)) + Decimal(str(qty))
        item.save(update_fields=["reserved"])
        
        return reservation


def release_reservation(reservation_id, tenant=None, user=None):
    """
    Release a reservation, decrementing the reserved quantity.
    
    Args:
        reservation_id: Reservation ID
        tenant: Optional tenant for validation
        user: User releasing the reservation
    
    Returns:
        Reservation instance (with status=RELEASED)
    
    Raises:
        Reservation.DoesNotExist: If reservation not found
        ValidationError: If reservation doesn't belong to tenant or is not active
    """
    with transaction.atomic():
        reservation = Reservation.objects.select_for_update().get(id=reservation_id)
        
        if tenant and reservation.tenant_id != tenant.id:
            raise ValidationError("Reservation does not belong to tenant")
        
        if reservation.status != "ACTIVE":
            raise ValidationError(f"Cannot release reservation with status {reservation.status}")
        
        # Lock inventory item
        item = InventoryItem.objects.select_for_update().get(
            tenant=reservation.tenant,
            store=reservation.store,
            variant=reservation.variant,
        )
        
        # Decrement reserved quantity
        current_reserved = Decimal(str(item.reserved))
        release_qty = Decimal(str(reservation.quantity))
        item.reserved = max(Decimal("0"), current_reserved - release_qty)
        item.save(update_fields=["reserved"])
        
        # Update reservation status
        reservation.status = "RELEASED"
        reservation.released_at = timezone.now()
        reservation.save(update_fields=["status", "released_at"])
        
        # Write ledger entry
        StockLedger.objects.create(
            tenant=reservation.tenant,
            store=reservation.store,
            variant=reservation.variant,
            qty_delta=0,  # No change to on_hand, only reserved
            balance_after=int(float(item.on_hand)),
            ref_type="RESERVATION_RELEASE",
            ref_id=reservation.id,
            note=f"Released reservation: {reservation.ref_type} #{reservation.ref_id or reservation.id} ({reservation.channel})",
            created_by=user or reservation.created_by,
        )
        
        return reservation


def commit_reservation(reservation_id, tenant=None, user=None):
    """
    Commit a reservation, converting it to actual inventory movement.
    Decrements reserved and on_hand, creates ledger entry.
    
    Args:
        reservation_id: Reservation ID
        tenant: Optional tenant for validation
        user: User committing the reservation
    
    Returns:
        Reservation instance (with status=COMMITTED)
        InventoryItem instance (updated)
    
    Raises:
        Reservation.DoesNotExist: If reservation not found
        ValidationError: If reservation doesn't belong to tenant or is not active
    """
    with transaction.atomic():
        reservation = Reservation.objects.select_for_update().get(id=reservation_id)
        
        if tenant and reservation.tenant_id != tenant.id:
            raise ValidationError("Reservation does not belong to tenant")
        
        if reservation.status != "ACTIVE":
            raise ValidationError(f"Cannot commit reservation with status {reservation.status}")
        
        # Lock inventory item
        item = InventoryItem.objects.select_for_update().get(
            tenant=reservation.tenant,
            store=reservation.store,
            variant=reservation.variant,
        )
        
        # Decrement both reserved and on_hand
        current_reserved = Decimal(str(item.reserved))
        current_on_hand = Decimal(str(item.on_hand))
        commit_qty = Decimal(str(reservation.quantity))
        
        # Update reserved
        item.reserved = max(Decimal("0"), current_reserved - commit_qty)
        
        # Update on_hand (can go negative if backorders allowed)
        item.on_hand = current_on_hand - commit_qty
        item.save(update_fields=["reserved", "on_hand"])
        item.refresh_from_db(fields=["on_hand", "reserved"])
        
        # Update reservation status
        reservation.status = "COMMITTED"
        reservation.committed_at = timezone.now()
        reservation.save(update_fields=["status", "committed_at"])
        
        # Write ledger entry
        StockLedger.objects.create(
            tenant=reservation.tenant,
            store=reservation.store,
            variant=reservation.variant,
            qty_delta=-int(commit_qty),  # Negative delta (sale/fulfillment)
            balance_after=int(float(item.on_hand)),
            ref_type="RESERVATION_COMMIT",
            ref_id=reservation.id,
            note=f"Committed reservation: {reservation.ref_type} #{reservation.ref_id or reservation.id} ({reservation.channel})",
            created_by=user or reservation.created_by,
        )
        
        return reservation, item

