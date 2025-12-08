# inventory/api_channels.py
"""
Multi-Channel Inventory API
Provides unified API for POS, web, marketplaces, etc. to query availability and perform reservations.
"""
from decimal import Decimal
from django.core.cache import cache
from django.db.models import Sum, Q, IntegerField
from django.db.models.functions import Coalesce, Cast
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework.throttling import UserRateThrottle, AnonRateThrottle

from tenants.models import Tenant
from stores.models import Store
from catalog.models import Variant
from .models import InventoryItem, StockLedger
from .models_reservations import Reservation
from .models import InventoryTransfer, InventoryTransferLine
from .reservations import (
    reserve_stock,
    release_reservation,
    commit_reservation,
    ReservationError,
    InsufficientStockError,
)


# Allowed channel values for security validation
ALLOWED_CHANNELS = ["POS", "WEB", "MARKETPLACE", "MOBILE", "API", "INTEGRATION"]


def _resolve_request_tenant(request):
    """Resolve tenant from request (reuse pattern from inventory/api.py)"""
    t = getattr(request, "tenant", None)
    if t:
        return t
    payload = getattr(request, "auth", None)
    if isinstance(payload, dict) and payload.get("tenant_id"):
        return get_object_or_404(Tenant, id=payload["tenant_id"])
    user = getattr(request, "user", None)
    if user is not None:
        if getattr(user, "tenant", None):
            return user.tenant
        if getattr(user, "active_tenant", None):
            return user.active_tenant
    return None


def _validate_channel(channel):
    """Validate channel parameter against whitelist for security"""
    if not channel:
        return "POS"  # Default channel
    channel_upper = channel.upper().strip()
    if channel_upper not in ALLOWED_CHANNELS:
        raise ValueError(f"Invalid channel '{channel}'. Allowed values: {', '.join(ALLOWED_CHANNELS)}")
    return channel_upper


def _rate_limit(key: str, limit: int, window_seconds: int) -> bool:
    """Returns True if over limit. Uses Django cache for rate limiting."""
    current = cache.get(key)
    if current is None:
        cache.set(key, 1, timeout=window_seconds)
        return False
    current = current + 1
    cache.set(key, current, timeout=window_seconds)
    return current > limit


class ChannelInventoryThrottle(UserRateThrottle):
    """
    Rate throttle for channel inventory APIs.
    Limits: 100 requests per minute per user/tenant
    """
    rate = '100/min'
    scope = 'channel_inventory'


class AvailabilityView(APIView):
    """
    GET /api/v1/inventory/availability?variant_id=&store_id=
    
    Returns real-time inventory availability for a variant at a store.
    Includes on_hand, reserved, available (on_hand - reserved), and in_transit quantities.
    
    Security:
    - Requires authentication
    - Tenant-scoped
    - Rate limited
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [ChannelInventoryThrottle]

    def get(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)

        variant_id = request.GET.get("variant_id")
        store_id = request.GET.get("store_id")

        if not variant_id:
            return Response({"error": "variant_id required"}, status=400)
        if not store_id:
            return Response({"error": "store_id required"}, status=400)

        try:
            variant_id = int(variant_id)
            store_id = int(store_id)
        except (ValueError, TypeError):
            return Response({"error": "variant_id and store_id must be integers"}, status=400)

        # Validate variant belongs to tenant
        try:
            variant = Variant.objects.get(id=variant_id, product__tenant=tenant, is_active=True)
        except Variant.DoesNotExist:
            return Response({"error": "Variant not found"}, status=404)

        # Validate store belongs to tenant
        try:
            store = Store.objects.get(id=store_id, tenant=tenant, is_active=True)
        except Store.DoesNotExist:
            return Response({"error": "Store not found"}, status=404)

        # Get inventory item
        try:
            item = InventoryItem.objects.get(tenant=tenant, store=store, variant=variant)
            on_hand = Decimal(str(item.on_hand or 0))
            reserved = Decimal(str(item.reserved or 0))
        except InventoryItem.DoesNotExist:
            on_hand = Decimal("0")
            reserved = Decimal("0")

        # Calculate available (on_hand - reserved)
        available = max(Decimal("0"), on_hand - reserved)

        # Calculate in_transit quantity (transfers being sent TO this store)
        in_transit_qty = (
            InventoryTransferLine.objects.filter(
                transfer__tenant=tenant,
                transfer__to_store=store,
                transfer__status__in=["IN_TRANSIT", "PARTIAL_RECEIVED"],
                variant=variant,
            )
            .aggregate(
                total=Sum(
                    Cast("qty_sent", IntegerField()) - Coalesce(Cast("qty_received", IntegerField()), 0),
                    output_field=IntegerField()
                )
            )["total"] or 0
        )

        return Response({
            "variant_id": variant_id,
            "store_id": store_id,
            "sku": variant.sku,
            "product_name": variant.product.name if variant.product else variant.name,
            "on_hand": int(float(on_hand)),
            "reserved": int(float(reserved)),
            "available": int(float(available)),
            "in_transit": int(in_transit_qty),
        }, status=200)


class ChannelReserveView(APIView):
    """
    POST /api/v1/inventory/reserve
    
    Reserve stock for a channel (POS, WEB, MARKETPLACE, etc.).
    This is a channel-aware wrapper around the reservation service.
    
    Body: {
      "store_id": 1,
      "variant_id": 123,
      "quantity": 5,
      "ref_type": "POS_CART",
      "ref_id": 456,
      "channel": "POS",  // Required, validated against whitelist
      "note": "Cart reservation",
      "expires_at": "2024-01-01T12:00:00Z"
    }
    
    Security:
    - Requires authentication
    - Tenant-scoped
    - Channel validation (whitelist)
    - Rate limited
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [ChannelInventoryThrottle]

    def post(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)

        payload = request.data or {}
        store_id = payload.get("store_id")
        variant_id = payload.get("variant_id")
        quantity = payload.get("quantity")
        ref_type = payload.get("ref_type")
        ref_id = payload.get("ref_id")
        channel = payload.get("channel")
        note = payload.get("note") or ""
        expires_at = payload.get("expires_at")

        # Validate required fields
        if not store_id:
            return Response({"error": "store_id required"}, status=400)
        if not variant_id:
            return Response({"error": "variant_id required"}, status=400)
        if not quantity:
            return Response({"error": "quantity required"}, status=400)
        if not ref_type:
            return Response({"error": "ref_type required"}, status=400)

        # Validate and normalize channel (security: whitelist validation)
        try:
            channel = _validate_channel(channel)
        except ValueError as e:
            return Response({"error": str(e)}, status=400)

        # Validate quantity
        try:
            quantity = int(quantity)
        except (ValueError, TypeError):
            return Response({"error": "quantity must be a positive integer"}, status=400)

        if quantity <= 0:
            return Response({"error": "quantity must be greater than 0"}, status=400)

        # Parse expires_at if provided
        if expires_at:
            try:
                from django.utils.dateparse import parse_datetime
                expires_at = parse_datetime(expires_at)
            except (ValueError, TypeError):
                return Response({"error": "Invalid expires_at format"}, status=400)

        # Rate limiting per tenant and channel
        rate_limit_key = f"reserve:{tenant.id}:{channel}"
        if _rate_limit(rate_limit_key, limit=50, window_seconds=60):  # 50 requests per minute per tenant/channel
            return Response(
                {"error": "Rate limit exceeded. Please try again later."},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )

        try:
            reservation = reserve_stock(
                tenant=tenant,
                store_id=store_id,
                variant_id=variant_id,
                qty=quantity,
                ref_type=ref_type,
                ref_id=ref_id,
                channel=channel,  # Validated channel
                user=request.user,
                note=note,
                expires_at=expires_at,
            )
            return Response({
                "id": reservation.id,
                "status": reservation.status,
                "quantity": reservation.quantity,
                "channel": reservation.channel,
            }, status=201)
        except InsufficientStockError as e:
            return Response({"error": str(e)}, status=400)
        except Exception as e:
            return Response({"error": str(e)}, status=400)


class ChannelReleaseView(APIView):
    """
    POST /api/v1/inventory/release
    
    Release a reservation. Channel-aware wrapper.
    
    Body: {
      "reservation_id": 123
    }
    
    Security:
    - Requires authentication
    - Tenant-scoped (validates reservation belongs to tenant)
    - Rate limited
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [ChannelInventoryThrottle]

    def post(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)

        payload = request.data or {}
        reservation_id = payload.get("reservation_id")

        if not reservation_id:
            return Response({"error": "reservation_id required"}, status=400)

        try:
            reservation_id = int(reservation_id)
        except (ValueError, TypeError):
            return Response({"error": "reservation_id must be an integer"}, status=400)

        # Rate limiting
        rate_limit_key = f"release:{tenant.id}"
        if _rate_limit(rate_limit_key, limit=100, window_seconds=60):
            return Response(
                {"error": "Rate limit exceeded. Please try again later."},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )

        try:
            reservation = release_reservation(
                reservation_id=reservation_id,
                tenant=tenant,  # Validates tenant ownership
                user=request.user,
            )
            return Response({
                "id": reservation.id,
                "status": reservation.status,
                "channel": reservation.channel,
            }, status=200)
        except Reservation.DoesNotExist:
            return Response({"error": "Reservation not found"}, status=404)
        except Exception as e:
            return Response({"error": str(e)}, status=400)


class ChannelCommitView(APIView):
    """
    POST /api/v1/inventory/commit
    
    Commit a reservation, converting it to actual inventory movement.
    Channel-aware wrapper.
    
    Body: {
      "reservation_id": 123
    }
    
    Security:
    - Requires authentication
    - Tenant-scoped (validates reservation belongs to tenant)
    - Rate limited
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [ChannelInventoryThrottle]

    def post(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)

        payload = request.data or {}
        reservation_id = payload.get("reservation_id")

        if not reservation_id:
            return Response({"error": "reservation_id required"}, status=400)

        try:
            reservation_id = int(reservation_id)
        except (ValueError, TypeError):
            return Response({"error": "reservation_id must be an integer"}, status=400)

        # Rate limiting
        rate_limit_key = f"commit:{tenant.id}"
        if _rate_limit(rate_limit_key, limit=100, window_seconds=60):
            return Response(
                {"error": "Rate limit exceeded. Please try again later."},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )

        try:
            reservation, item = commit_reservation(
                reservation_id=reservation_id,
                tenant=tenant,  # Validates tenant ownership
                user=request.user,
            )
            return Response({
                "id": reservation.id,
                "status": reservation.status,
                "channel": reservation.channel,
                "on_hand_after": int(float(item.on_hand)),
                "reserved_after": int(float(item.reserved)),
            }, status=200)
        except Reservation.DoesNotExist:
            return Response({"error": "Reservation not found"}, status=404)
        except Exception as e:
            return Response({"error": str(e)}, status=400)

