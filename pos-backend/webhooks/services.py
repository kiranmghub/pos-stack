# webhooks/services.py
"""
Webhook delivery service with retry logic and signing.
"""
import json
from datetime import timedelta
from django.utils import timezone

try:
    import requests
except ImportError:
    requests = None

from .models import WebhookSubscription, WebhookDelivery


def publish_webhook_event(tenant, event_type: str, payload: dict):
    """
    Publish a webhook event to all active subscriptions for the tenant.
    
    Args:
        tenant: Tenant instance
        event_type: Event type (e.g., 'inventory.stock_changed')
        payload: Event payload dictionary
    
    Returns:
        Number of webhooks queued for delivery
    """
    # Find active subscriptions for this tenant and event type
    subscriptions = WebhookSubscription.objects.filter(
        tenant=tenant,
        is_active=True,
        event_types__contains=[event_type]
    )
    
    queued_count = 0
    for subscription in subscriptions:
        try:
            # Create delivery record
            payload_json = json.dumps(payload, sort_keys=True)
            signature = subscription.generate_signature(payload_json)
            
            delivery = WebhookDelivery.objects.create(
                subscription=subscription,
                event_type=event_type,
                payload=payload,
                signature=signature,
                status="PENDING",
                max_retries=subscription.max_retries,
            )
            
            # Queue for delivery (async via Celery if available, otherwise sync)
            deliver_webhook_async(delivery.id)
            queued_count += 1
        except Exception as e:
            # Log error but don't fail the main operation
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to queue webhook for subscription {subscription.id}: {e}")
    
    return queued_count


def deliver_webhook_async(delivery_id: int):
    """
    Queue webhook delivery asynchronously.
    Falls back to synchronous delivery if Celery is not available.
    """
    try:
        from webhooks.tasks import deliver_webhook_task
        # Use Celery if available
        deliver_webhook_task.delay(delivery_id)
    except ImportError:
        # Fallback to synchronous delivery
        deliver_webhook_sync(delivery_id)


def deliver_webhook_sync(delivery_id: int):
    """
    Deliver webhook synchronously (fallback if Celery not available).
    """
    try:
        delivery = WebhookDelivery.objects.get(id=delivery_id)
        _deliver_webhook(delivery)
    except WebhookDelivery.DoesNotExist:
        pass


def _deliver_webhook(delivery: WebhookDelivery):
    """
    Internal function to deliver a webhook with retry logic.
    """
    subscription = delivery.subscription
    
    # Prepare payload
    payload_json = json.dumps(delivery.payload, sort_keys=True)
    
    # Prepare headers
    headers = {
        "Content-Type": "application/json",
        "X-Webhook-Event": delivery.event_type,
        "X-Webhook-Signature": f"sha256={delivery.signature}",
        "X-Webhook-Delivery-Id": str(delivery.id),
        "User-Agent": "POS-Stack-Webhooks/1.0",
    }
    
    # Make request
    if requests is None:
        delivery.status = "FAILED"
        delivery.error_message = "requests library not installed"
        delivery.save()
        return
    
    try:
        response = requests.post(
            subscription.url,
            data=payload_json,
            headers=headers,
            timeout=10,  # 10 second timeout
        )
        
        delivery.attempt_count += 1
        delivery.response_status_code = response.status_code
        delivery.response_body = response.text[:1000]  # Limit response body size
        
        # Check if successful (2xx status codes)
        if 200 <= response.status_code < 300:
            delivery.status = "SUCCESS"
            delivery.delivered_at = timezone.now()
            delivery.next_retry_at = None
            delivery.error_message = ""
            
            # Update subscription stats
            subscription.last_success_at = timezone.now()
            subscription.last_triggered_at = timezone.now()
            subscription.failure_count = 0
            subscription.save(update_fields=["last_success_at", "last_triggered_at", "failure_count"])
        else:
            # Non-2xx response - treat as failure
            delivery.error_message = f"HTTP {response.status_code}: {response.text[:500]}"
            _handle_webhook_failure(delivery, subscription)
        
    except Exception as e:
        # Network/timeout/other errors
        delivery.attempt_count += 1
        # Check if it's a requests exception
        if requests and isinstance(e, requests.exceptions.RequestException):
            delivery.error_message = str(e)[:500]
        else:
            delivery.error_message = f"Unexpected error: {str(e)}"[:500]
        _handle_webhook_failure(delivery, subscription)
    
    finally:
        delivery.save()


def _handle_webhook_failure(delivery: WebhookDelivery, subscription: WebhookSubscription):
    """
    Handle webhook delivery failure with retry logic.
    """
    if delivery.attempt_count < delivery.max_retries:
        # Calculate exponential backoff
        backoff_seconds = subscription.retry_backoff_seconds * (2 ** (delivery.attempt_count - 1))
        delivery.next_retry_at = timezone.now() + timedelta(seconds=backoff_seconds)
        delivery.status = "RETRYING"
        
        # Schedule retry (async if Celery available)
        try:
            from webhooks.tasks import deliver_webhook_task
            deliver_webhook_task.apply_async(
                args=[delivery.id],
                countdown=backoff_seconds
            )
        except ImportError:
            # Fallback: mark for manual retry
            pass
    else:
        # Max retries exceeded
        delivery.status = "FAILED"
        delivery.next_retry_at = None
        
        # Update subscription stats
        subscription.last_failure_at = timezone.now()
        subscription.last_triggered_at = timezone.now()
        subscription.failure_count += 1
        subscription.save(update_fields=["last_failure_at", "last_triggered_at", "failure_count"])


def retry_failed_webhooks():
    """
    Retry webhooks that are due for retry.
    Called by a scheduled task or management command.
    """
    from django.db.models import F
    now = timezone.now()
    pending_deliveries = WebhookDelivery.objects.filter(
        status="RETRYING",
        next_retry_at__lte=now,
        attempt_count__lt=F("max_retries")
    )
    
    for delivery in pending_deliveries:
        deliver_webhook_async(delivery.id)

