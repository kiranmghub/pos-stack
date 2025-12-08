# analytics/models.py
"""
Models for analytics and export tracking.
"""
from django.db import models
from django.utils import timezone


class ExportTracking(models.Model):
    """
    Tracks last exported ID for delta exports per tenant and export type.
    """
    EXPORT_TYPES = [
        ("ledger", "Stock Ledger"),
        ("transfers", "Transfers"),
        ("counts", "Count Sessions"),
        ("purchase_orders", "Purchase Orders"),
    ]
    
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE, db_index=True)
    export_type = models.CharField(max_length=50, choices=EXPORT_TYPES, db_index=True)
    last_exported_id = models.BigIntegerField(help_text="Last exported record ID")
    last_exported_at = models.DateTimeField(default=timezone.now, db_index=True)
    records_exported = models.PositiveIntegerField(default=0, help_text="Number of records in last export")
    
    class Meta:
        unique_together = [("tenant", "export_type")]
        indexes = [
            models.Index(fields=["tenant", "export_type"]),
        ]
    
    def __str__(self):
        return f"{self.tenant.code} - {self.export_type} - Last ID: {self.last_exported_id}"
