# webhooks/models.py
"""
Webhook subscription models for real-time notifications.
"""
import hmac
import hashlib
import json
from django.db import models
from django.conf import settings
from django.utils import timezone
from django.core.exceptions import ValidationError


class WebhookSubscription(models.Model):
    """
    Webhook subscription per tenant.
    Defines where to send webhook events and which events to subscribe to.
    """
    EVENT_TYPES = [
        ("inventory.stock_changed", "Stock Changed"),
        ("inventory.transfer_sent", "Transfer Sent"),
        ("inventory.transfer_received", "Transfer Received"),
        ("inventory.count_finalized", "Count Finalized"),
        ("purchase_order.received", "Purchase Order Received"),
    ]
    
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE, db_index=True)
    url = models.URLField(max_length=500, help_text="Webhook endpoint URL")
    event_types = models.JSONField(
        default=list,
        help_text="List of event types to subscribe to (e.g., ['inventory.stock_changed'])"
    )
    secret = models.CharField(
        max_length=128,
        help_text="Secret key for HMAC signature (auto-generated if not provided)"
    )
    is_active = models.BooleanField(default=True, db_index=True)
    description = models.CharField(max_length=200, blank=True, help_text="Optional description")
    
    # Retry configuration
    max_retries = models.PositiveIntegerField(default=3, help_text="Maximum number of retry attempts")
    retry_backoff_seconds = models.PositiveIntegerField(
        default=60,
        help_text="Initial backoff delay in seconds (exponential backoff)"
    )
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_triggered_at = models.DateTimeField(null=True, blank=True)
    last_success_at = models.DateTimeField(null=True, blank=True)
    last_failure_at = models.DateTimeField(null=True, blank=True)
    failure_count = models.PositiveIntegerField(default=0, help_text="Consecutive failure count")
    
    class Meta:
        indexes = [
            models.Index(fields=["tenant", "is_active"]),
            models.Index(fields=["tenant", "event_types"]),
        ]
    
    def __str__(self):
        return f"Webhook {self.id} - {self.tenant.code} - {self.url}"
    
    def clean(self):
        """Validate event_types"""
        if not isinstance(self.event_types, list):
            raise ValidationError("event_types must be a list")
        
        valid_events = [event[0] for event in self.EVENT_TYPES]
        for event_type in self.event_types:
            if event_type not in valid_events:
                raise ValidationError(f"Invalid event type: {event_type}")
    
    def save(self, *args, **kwargs):
        """Generate secret if not provided"""
        if not self.secret:
            import secrets
            self.secret = secrets.token_urlsafe(32)
        self.full_clean()
        super().save(*args, **kwargs)
    
    def generate_signature(self, payload: str) -> str:
        """Generate HMAC-SHA256 signature for payload"""
        return hmac.new(
            self.secret.encode('utf-8'),
            payload.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()


class WebhookDelivery(models.Model):
    """
    Tracks webhook delivery attempts and results.
    """
    STATUS_CHOICES = [
        ("PENDING", "Pending"),
        ("SUCCESS", "Success"),
        ("FAILED", "Failed"),
        ("RETRYING", "Retrying"),
    ]
    
    subscription = models.ForeignKey(
        WebhookSubscription,
        on_delete=models.CASCADE,
        related_name="deliveries"
    )
    event_type = models.CharField(max_length=100, db_index=True)
    payload = models.JSONField(help_text="Event payload")
    signature = models.CharField(max_length=128, help_text="HMAC signature")
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PENDING", db_index=True)
    attempt_count = models.PositiveIntegerField(default=0)
    max_retries = models.PositiveIntegerField(default=3)
    
    # Response tracking
    response_status_code = models.IntegerField(null=True, blank=True)
    response_body = models.TextField(blank=True)
    error_message = models.TextField(blank=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    next_retry_at = models.DateTimeField(null=True, blank=True, db_index=True)
    
    class Meta:
        indexes = [
            models.Index(fields=["subscription", "status", "created_at"]),
            models.Index(fields=["status", "next_retry_at"]),
        ]
        ordering = ["-created_at"]
    
    def __str__(self):
        return f"Delivery {self.id} - {self.event_type} - {self.status}"
