# inventory/models_counts.py
from django.db import models
from django.conf import settings


class CountSession(models.Model):
    STATUS_CHOICES = [
        ("DRAFT", "Draft"),
        ("IN_PROGRESS", "In Progress"),
        ("FINALIZED", "Finalized"),
    ]
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE, db_index=True)
    store = models.ForeignKey("stores.Store", on_delete=models.CASCADE, db_index=True)
    code = models.CharField(max_length=40, blank=True, db_index=True)  # optional human code
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="DRAFT", db_index=True)
    note = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="count_sessions_created")
    started_at = models.DateTimeField(null=True, blank=True)
    finalized_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=["tenant", "store", "status"])]

    def __str__(self):
        return f"CountSession #{self.id} ({self.status})"


class CountLine(models.Model):
    session = models.ForeignKey(CountSession, on_delete=models.CASCADE, related_name="lines")
    variant = models.ForeignKey("catalog.Variant", on_delete=models.CASCADE)
    # expected is snapshot (optional)
    expected_qty = models.IntegerField(null=True, blank=True)
    counted_qty = models.IntegerField(default=0)
    method = models.CharField(max_length=12, default="SCAN", blank=True)  # SCAN/KEYED
    location = models.CharField(max_length=64, blank=True)  # optional bin/location
    last_scanned_barcode = models.CharField(max_length=64, blank=True)

    class Meta:
        unique_together = [("session", "variant")]

    def __str__(self):
        return f"CountLine s{self.session_id} v{self.variant_id} = {self.counted_qty}"
