# webhooks/events.py
"""
Webhook event definitions and payload builders.
"""
from decimal import Decimal
from django.utils import timezone


def build_stock_changed_event(tenant, store, variant, old_on_hand, new_on_hand, ref_type, ref_id, user=None):
    """
    Build payload for inventory.stock_changed event.
    """
    return {
        "event": "inventory.stock_changed",
        "timestamp": timezone.now().isoformat(),
        "tenant_id": tenant.id,
        "tenant_code": tenant.code,
        "data": {
            "store_id": store.id,
            "store_code": store.code,
            "store_name": store.name,
            "variant_id": variant.id,
            "sku": variant.sku,
            "product_name": variant.product.name if variant.product else variant.name,
            "old_on_hand": int(float(old_on_hand)),
            "new_on_hand": int(float(new_on_hand)),
            "delta": int(float(new_on_hand - old_on_hand)),
            "ref_type": ref_type,
            "ref_id": ref_id,
            "user_id": user.id if user else None,
            "user_username": user.username if user else None,
        }
    }


def build_transfer_sent_event(tenant, transfer, user=None):
    """
    Build payload for inventory.transfer_sent event.
    """
    lines = []
    for line in transfer.lines.all():
        lines.append({
            "variant_id": line.variant_id,
            "sku": line.variant.sku,
            "qty": line.qty,
            "qty_sent": line.qty_sent,
        })
    
    return {
        "event": "inventory.transfer_sent",
        "timestamp": timezone.now().isoformat(),
        "tenant_id": tenant.id,
        "tenant_code": tenant.code,
        "data": {
            "transfer_id": transfer.id,
            "from_store_id": transfer.from_store_id,
            "from_store_code": transfer.from_store.code,
            "to_store_id": transfer.to_store_id,
            "to_store_code": transfer.to_store.code,
            "status": transfer.status,
            "lines": lines,
            "user_id": user.id if user else None,
            "user_username": user.username if user else None,
        }
    }


def build_transfer_received_event(tenant, transfer, user=None):
    """
    Build payload for inventory.transfer_received event.
    """
    lines = []
    for line in transfer.lines.all():
        lines.append({
            "variant_id": line.variant_id,
            "sku": line.variant.sku,
            "qty": line.qty,
            "qty_received": line.qty_received,
            "qty_remaining": line.qty_remaining,
        })
    
    return {
        "event": "inventory.transfer_received",
        "timestamp": timezone.now().isoformat(),
        "tenant_id": tenant.id,
        "tenant_code": tenant.code,
        "data": {
            "transfer_id": transfer.id,
            "from_store_id": transfer.from_store_id,
            "from_store_code": transfer.from_store.code,
            "to_store_id": transfer.to_store_id,
            "to_store_code": transfer.to_store.code,
            "status": transfer.status,
            "lines": lines,
            "user_id": user.id if user else None,
            "user_username": user.username if user else None,
        }
    }


def build_count_finalized_event(tenant, count_session, user=None):
    """
    Build payload for inventory.count_finalized event.
    """
    lines = []
    for line in count_session.lines.all():
        lines.append({
            "variant_id": line.variant_id,
            "sku": line.variant.sku,
            "expected_qty": line.expected_qty,
            "counted_qty": line.counted_qty,
            "variance": (line.counted_qty or 0) - (line.expected_qty or 0),
        })
    
    return {
        "event": "inventory.count_finalized",
        "timestamp": timezone.now().isoformat(),
        "tenant_id": tenant.id,
        "tenant_code": tenant.code,
        "data": {
            "count_session_id": count_session.id,
            "store_id": count_session.store_id,
            "store_code": count_session.store.code,
            "scope": count_session.scope,
            "zone_name": count_session.zone_name,
            "lines": lines,
            "user_id": user.id if user else None,
            "user_username": user.username if user else None,
        }
    }


def build_purchase_order_received_event(tenant, purchase_order, user=None):
    """
    Build payload for purchase_order.received event.
    """
    lines = []
    for line in purchase_order.lines.all():
        lines.append({
            "variant_id": line.variant_id,
            "sku": line.variant.sku,
            "qty_ordered": line.qty_ordered,
            "qty_received": line.qty_received,
            "qty_remaining": line.qty_remaining,
            "unit_cost": str(line.unit_cost),
        })
    
    return {
        "event": "purchase_order.received",
        "timestamp": timezone.now().isoformat(),
        "tenant_id": tenant.id,
        "tenant_code": tenant.code,
        "data": {
            "purchase_order_id": purchase_order.id,
            "po_number": purchase_order.po_number,
            "store_id": purchase_order.store_id,
            "store_code": purchase_order.store.code,
            "vendor_id": purchase_order.vendor_id,
            "vendor_name": purchase_order.vendor.name,
            "status": purchase_order.status,
            "received_at": purchase_order.received_at.isoformat() if purchase_order.received_at else None,
            "lines": lines,
            "user_id": user.id if user else None,
            "user_username": user.username if user else None,
        }
    }

