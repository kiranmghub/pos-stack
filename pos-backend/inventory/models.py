# pos-backend/inventory/models.py
from django.db import models

# Create your models here.
from django.db import models
from common.models import TimeStampedModel
from django.conf import settings
from django.utils import timezone
from django.db.models import Q


class InventoryItem(TimeStampedModel):
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE)
    store = models.ForeignKey("stores.Store", on_delete=models.CASCADE)
    variant = models.ForeignKey("catalog.Variant", on_delete=models.CASCADE)
    on_hand = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    reserved = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    class Meta: unique_together = ("store","variant")

    def __str__(self):
        return f"{self.store} / {self.variant} – on_hand={self.on_hand}"


class StockLedgerEntry(TimeStampedModel):
    store = models.ForeignKey("stores.Store", on_delete=models.CASCADE)
    variant = models.ForeignKey("catalog.Variant", on_delete=models.CASCADE)
    delta = models.DecimalField(max_digits=12, decimal_places=3)
    reason = models.CharField(max_length=32) # sale/return/receive/adjust/transfer
    ref_type = models.CharField(max_length=32, blank=True)
    ref_id = models.CharField(max_length=64, blank=True)

    def __str__(self):
        return f"{self.created_at:%Y-%m-%d %H:%M} {self.store} {self.variant} {self.delta} ({self.reason})"

# --- APPEND BELOW EXISTING CONTENT ------------------------------------------


class AdjustmentReason(models.Model):
    """
    Per-tenant catalog of reasons (Shrink, Damage, Count, etc).
    Keeping them editable allows reporting to stay clean.
    """
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE, db_index=True)
    code = models.CharField(max_length=40)  # e.g. SHRINK, DAMAGE, COUNT
    name = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = (("tenant", "code"),)
        indexes = [models.Index(fields=["tenant", "is_active"])]

    def __str__(self):
        return f"{self.tenant_id}:{self.code}"


class InventoryAdjustment(models.Model):
    """
    Header for a multi-line adjustment session (posted at once).
    """
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE, db_index=True)
    store = models.ForeignKey("stores.Store", on_delete=models.PROTECT, db_index=True)
    reason = models.ForeignKey("inventory.AdjustmentReason", on_delete=models.PROTECT)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)

    class Meta:
        indexes = [models.Index(fields=["tenant", "store", "created_at"])]

    def __str__(self):
        return f"Adj#{self.id} {self.reason.code} @ store {self.store_id}"


class InventoryAdjustmentLine(models.Model):
    """
    Individual line: which variant, and by how much (+/-).
    """
    adjustment = models.ForeignKey(
        "inventory.InventoryAdjustment", on_delete=models.CASCADE, related_name="lines"
    )
    variant = models.ForeignKey("catalog.Variant", on_delete=models.PROTECT, db_index=True)
    delta = models.IntegerField()  # positive or negative

    def __str__(self):
        return f"AdjLine#{self.id} v{self.variant_id} Δ{self.delta}"


class StockLedger(models.Model):
    """
    Immutable movement log for audit: every change in on_hand.
    """
    REF_TYPES = [
        ("ADJUSTMENT", "Adjustment"),
        ("SALE", "POS Sale"),
        ("RETURN", "Return"),
        ("TRANSFER", "Transfer"),  # Legacy - use TRANSFER_OUT/TRANSFER_IN for new entries
        ("TRANSFER_OUT", "Transfer Out"),
        ("TRANSFER_IN", "Transfer In"),
        ("RECEIPT", "Receipt"),
        ("COUNT", "Count"),  # Legacy - use COUNT_RECONCILE for new entries
        ("COUNT_RECONCILE", "Count Reconcile"),
        ("PURCHASE_ORDER_RECEIPT", "Purchase Order Receipt"),
        ("WASTE", "Waste"),
        ("RESERVATION", "Reservation"),
        ("RESERVATION_COMMIT", "Reservation Commit"),
        ("RESERVATION_RELEASE", "Reservation Release"),
        ("BREAKAGE", "Breakage"),  # For ICDC invoice breakage tracking
        ("SHORTAGE", "Shortage"),  # For ICDC invoice shortage tracking
        ("ICDC_RECEIPT", "ICDC Invoice Receipt"),  # For ICDC invoice receipts
        ("ICDC_REVERSAL", "ICDC Invoice Reversal"),  # For ICDC invoice reversals
    ]
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE, db_index=True)
    store = models.ForeignKey("stores.Store", on_delete=models.PROTECT, db_index=True)
    variant = models.ForeignKey("catalog.Variant", on_delete=models.PROTECT, db_index=True)

    qty_delta = models.IntegerField()  # signed
    balance_after = models.IntegerField(null=True, blank=True)

    ref_type = models.CharField(max_length=30, choices=REF_TYPES)
    ref_id = models.IntegerField(null=True, blank=True)
    note = models.TextField(blank=True)

    created_at = models.DateTimeField(default=timezone.now)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)

    class Meta:
        indexes = [
            models.Index(fields=["tenant", "store", "created_at"]),
            models.Index(fields=["tenant", "variant", "created_at"]),
        ]

    def __str__(self):
        return f"Ledger v{self.variant_id} {self.qty_delta} ({self.ref_type}#{self.ref_id})"


# --- Transfers --------------------------------------------------------------
class InventoryTransfer(models.Model):
    STATUS_CHOICES = [
        ("DRAFT", "Draft"),
        ("SENT", "Sent"),  # Legacy - use IN_TRANSIT for new entries
        ("IN_TRANSIT", "In Transit"),
        ("PARTIAL_RECEIVED", "Partial Received"),
        ("RECEIVED", "Received"),
        ("CANCELLED", "Cancelled"),
    ]
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE, db_index=True)
    from_store = models.ForeignKey("stores.Store", on_delete=models.PROTECT, related_name="transfers_out")
    to_store = models.ForeignKey("stores.Store", on_delete=models.PROTECT, related_name="transfers_in")
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="DRAFT", db_index=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["tenant", "status", "created_at"])]


class InventoryTransferLine(models.Model):
    transfer = models.ForeignKey(InventoryTransfer, on_delete=models.CASCADE, related_name="lines")
    variant = models.ForeignKey("catalog.Variant", on_delete=models.PROTECT)
    qty = models.IntegerField()
    qty_sent = models.IntegerField(null=True, blank=True, help_text="Quantity actually sent (defaults to qty if not set)")
    qty_received = models.IntegerField(null=True, blank=True, default=0, help_text="Quantity received so far")

    class Meta:
        constraints = [
            models.CheckConstraint(check=~Q(qty=0), name="transfer_line_qty_nonzero"),
        ]
    
    @property
    def qty_remaining(self):
        """Calculate remaining quantity to receive"""
        sent = self.qty_sent if self.qty_sent is not None else self.qty
        received = self.qty_received or 0
        return max(0, sent - received)
