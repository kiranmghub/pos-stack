# webhooks/tasks.py
"""
Celery tasks for async webhook delivery.
"""
from celery import shared_task
from .services import _deliver_webhook
from .models import WebhookDelivery


@shared_task(bind=True, max_retries=3)
def deliver_webhook_task(self, delivery_id: int):
    """
    Celery task to deliver a webhook asynchronously.
    """
    try:
        delivery = WebhookDelivery.objects.get(id=delivery_id)
        _deliver_webhook(delivery)
    except WebhookDelivery.DoesNotExist:
        # Delivery already processed or deleted
        pass
    except Exception as exc:
        # Retry on unexpected errors
        raise self.retry(exc=exc, countdown=60)

