# inventory/audit.py
"""
Audit logging for inventory operations.
Extends the AuditLog model from orders app.
"""
from orders.models import AuditLog


def log_inventory_adjustment(tenant, user, store, variant, delta, reason_code, note=None):
    """Log inventory adjustment"""
    AuditLog.record(
        tenant=tenant,
        user=user,
        store=store,
        action="INVENTORY_ADJUSTMENT",
        severity="info",
        metadata={
            "variant_id": variant.id,
            "sku": variant.sku,
            "delta": int(delta),
            "reason_code": reason_code,
            "note": note or "",
        }
    )


def log_transfer_action(tenant, user, transfer, action, metadata=None):
    """Log transfer action (send, receive, cancel)"""
    AuditLog.record(
        tenant=tenant,
        user=user,
        store=transfer.from_store,
        action=f"TRANSFER_{action.upper()}",
        severity="info",
        metadata={
            "transfer_id": transfer.id,
            "from_store_id": transfer.from_store_id,
            "to_store_id": transfer.to_store_id,
            "status": transfer.status,
            **(metadata or {}),
        }
    )


def log_count_session_action(tenant, user, count_session, action, metadata=None):
    """Log count session action (create, finalize, cancel)"""
    AuditLog.record(
        tenant=tenant,
        user=user,
        store=count_session.store,
        action=f"COUNT_SESSION_{action.upper()}",
        severity="info",
        metadata={
            "count_session_id": count_session.id,
            "scope": count_session.scope,
            "zone_name": count_session.zone_name or "",
            "status": count_session.status,
            **(metadata or {}),
        }
    )


def log_purchase_order_action(tenant, user, purchase_order, action, metadata=None):
    """Log purchase order action (create, submit, receive, cancel)"""
    AuditLog.record(
        tenant=tenant,
        user=user,
        store=purchase_order.store,
        action=f"PURCHASE_ORDER_{action.upper()}",
        severity="info",
        metadata={
            "purchase_order_id": purchase_order.id,
            "po_number": purchase_order.po_number or "",
            "vendor_id": purchase_order.vendor_id,
            "status": purchase_order.status,
            **(metadata or {}),
        }
    )


def log_reservation_action(tenant, user, reservation, action, metadata=None):
    """Log reservation action (create, commit, release)"""
    AuditLog.record(
        tenant=tenant,
        user=user,
        store=reservation.store,
        action=f"RESERVATION_{action.upper()}",
        severity="info",
        metadata={
            "reservation_id": reservation.id,
            "variant_id": reservation.variant_id,
            "quantity": reservation.quantity,
            "status": reservation.status,
            "channel": reservation.channel or "",
            **(metadata or {}),
        }
    )


def log_export_action(tenant, user, export_type, record_count, metadata=None):
    """Log export action"""
    AuditLog.record(
        tenant=tenant,
        user=user,
        action="DATA_EXPORT",
        severity="info",
        metadata={
            "export_type": export_type,
            "record_count": record_count,
            **(metadata or {}),
        }
    )

