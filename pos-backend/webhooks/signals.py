# webhooks/signals.py
"""
Django signals to publish webhook events.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver

from inventory.models import StockLedger, InventoryItem
from inventory.models_counts import CountSession
from inventory.models import InventoryTransfer
from purchasing.models import PurchaseOrder
from webhooks.services import publish_webhook_event
from webhooks.events import (
    build_stock_changed_event,
    build_transfer_sent_event,
    build_transfer_received_event,
    build_count_finalized_event,
    build_purchase_order_received_event,
)


@receiver(post_save, sender=StockLedger)
def on_stock_ledger_created(sender, instance: StockLedger, created, **kwargs):
    """
    Publish inventory.stock_changed event when stock ledger entry is created.
    Only for certain ref_types that represent actual stock changes.
    """
    if not created:
        return
    
    # Only publish for ref_types that represent stock changes
    stock_change_ref_types = [
        "SALE", "RETURN", "ADJUSTMENT", "TRANSFER_OUT", "TRANSFER_IN",
        "COUNT_RECONCILE", "PURCHASE_ORDER_RECEIPT", "WASTE",
        "RESERVATION_COMMIT", "RESERVATION_RELEASE"
    ]
    
    if instance.ref_type not in stock_change_ref_types:
        return
    
    # Get old on_hand (balance_after - qty_delta)
    old_on_hand = instance.balance_after - instance.qty_delta
    new_on_hand = instance.balance_after
    
    # Only publish if there's an actual change
    if old_on_hand == new_on_hand:
        return
    
    try:
        from webhooks.services import publish_webhook_event
        from webhooks.events import build_stock_changed_event
        
        payload = build_stock_changed_event(
            tenant=instance.tenant,
            store=instance.store,
            variant=instance.variant,
            old_on_hand=old_on_hand,
            new_on_hand=new_on_hand,
            ref_type=instance.ref_type,
            ref_id=instance.ref_id,
            user=instance.created_by,
        )
        publish_webhook_event(instance.tenant, "inventory.stock_changed", payload)
    except Exception as e:
        # Don't fail the main operation if webhook fails
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to publish stock_changed webhook: {e}")


@receiver(post_save, sender=InventoryTransfer)
def on_transfer_status_changed(sender, instance: InventoryTransfer, created, **kwargs):
    """
    Publish transfer events when transfer status changes.
    """
    if created:
        return
    
    # Check if status changed to IN_TRANSIT (sent) or RECEIVED/PARTIAL_RECEIVED (received)
    # Get previous status from database
    try:
        prev = InventoryTransfer.objects.get(id=instance.id)
        prev_status = prev.status
    except InventoryTransfer.DoesNotExist:
        prev_status = None
    
    # If status hasn't changed, skip
    if instance.status == prev_status:
        return
    
    # Publish transfer_sent event
    if instance.status == "IN_TRANSIT" and prev_status != "IN_TRANSIT":
        try:
            from webhooks.services import publish_webhook_event
            from webhooks.events import build_transfer_sent_event
            
            payload = build_transfer_sent_event(
                tenant=instance.tenant,
                transfer=instance,
                user=getattr(instance, '_current_user', None),
            )
            publish_webhook_event(instance.tenant, "inventory.transfer_sent", payload)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to publish transfer_sent webhook: {e}")
    
    # Publish transfer_received event
    if instance.status in ["RECEIVED", "PARTIAL_RECEIVED"] and prev_status not in ["RECEIVED", "PARTIAL_RECEIVED"]:
        try:
            from webhooks.services import publish_webhook_event
            from webhooks.events import build_transfer_received_event
            
            payload = build_transfer_received_event(
                tenant=instance.tenant,
                transfer=instance,
                user=getattr(instance, '_current_user', None),
            )
            publish_webhook_event(instance.tenant, "inventory.transfer_received", payload)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to publish transfer_received webhook: {e}")


@receiver(post_save, sender=CountSession)
def on_count_session_finalized(sender, instance: CountSession, created, **kwargs):
    """
    Publish inventory.count_finalized event when count session is finalized.
    """
    if created:
        return
    
    # Check if status changed to FINALIZED
    try:
        prev = CountSession.objects.get(id=instance.id)
        prev_status = prev.status
    except CountSession.DoesNotExist:
        prev_status = None
    
    if instance.status == "FINALIZED" and prev_status != "FINALIZED":
        try:
            from webhooks.services import publish_webhook_event
            from webhooks.events import build_count_finalized_event
            
            payload = build_count_finalized_event(
                tenant=instance.tenant,
                count_session=instance,
                user=instance.created_by,
            )
            publish_webhook_event(instance.tenant, "inventory.count_finalized", payload)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to publish count_finalized webhook: {e}")


@receiver(post_save, sender=PurchaseOrder)
def on_purchase_order_received(sender, instance: PurchaseOrder, created, **kwargs):
    """
    Publish purchase_order.received event when PO is received.
    """
    if created:
        return
    
    # Check if status changed to RECEIVED or PARTIAL_RECEIVED
    try:
        prev = PurchaseOrder.objects.get(id=instance.id)
        prev_status = prev.status
    except PurchaseOrder.DoesNotExist:
        prev_status = None
    
    # If status hasn't changed, skip
    if instance.status == prev_status:
        return
    
    if instance.status in ["RECEIVED", "PARTIAL_RECEIVED"] and prev_status not in ["RECEIVED", "PARTIAL_RECEIVED"]:
        try:
            from webhooks.services import publish_webhook_event
            from webhooks.events import build_purchase_order_received_event
            
            payload = build_purchase_order_received_event(
                tenant=instance.tenant,
                purchase_order=instance,
                user=getattr(instance, '_current_user', None),
            )
            publish_webhook_event(instance.tenant, "purchase_order.received", payload)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to publish purchase_order.received webhook: {e}")

