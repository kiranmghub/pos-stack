# inventory/models_reservations.py
from django.db import models
from django.conf import settings
from common.models import TimeStampedModel


class Reservation(TimeStampedModel):
    """
    Tracks active stock reservations for multi-channel inventory management.
    Reservations hold stock without affecting on_hand until committed.
    """
    STATUS_CHOICES = [
        ("ACTIVE", "Active"),
        ("COMMITTED", "Committed"),
        ("RELEASED", "Released"),
        ("EXPIRED", "Expired"),
    ]
    
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE, db_index=True)
    store = models.ForeignKey("stores.Store", on_delete=models.PROTECT, db_index=True)
    variant = models.ForeignKey("catalog.Variant", on_delete=models.PROTECT, db_index=True)
    quantity = models.IntegerField(help_text="Reserved quantity")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="ACTIVE", db_index=True)
    
    # Reference information
    ref_type = models.CharField(max_length=50, help_text="Type of reservation (e.g., POS_CART, WEB_ORDER, MARKETPLACE)")
    ref_id = models.IntegerField(null=True, blank=True, help_text="Reference ID (e.g., cart_id, order_id)")
    channel = models.CharField(max_length=50, default="POS", help_text="Channel identifier (POS, WEB, MARKETPLACE, etc.)")
    
    # Metadata
    note = models.TextField(blank=True, help_text="Optional note about the reservation")
    expires_at = models.DateTimeField(null=True, blank=True, help_text="Optional expiration time for the reservation")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    committed_at = models.DateTimeField(null=True, blank=True)
    released_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        indexes = [
            models.Index(fields=["tenant", "store", "status"]),
            models.Index(fields=["tenant", "variant", "status"]),
            models.Index(fields=["ref_type", "ref_id"]),
            models.Index(fields=["status", "expires_at"]),
        ]
    
    def __str__(self):
        return f"Reservation #{self.id} - {self.variant.sku} x{self.quantity} ({self.status})"

