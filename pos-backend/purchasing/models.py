# purchasing/models.py
from django.db import models
from django.conf import settings
from django.utils import timezone
from django.db.models import Q


class Vendor(models.Model):
    """
    Vendor/supplier information per tenant.
    """
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE, db_index=True)
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=50, blank=True, help_text="Vendor code/identifier")
    contact_name = models.CharField(max_length=200, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=50, blank=True)
    address = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    lead_time_days = models.PositiveIntegerField(null=True, blank=True, help_text="Average lead time in days for orders from this vendor")
    safety_stock_days = models.PositiveIntegerField(null=True, blank=True, help_text="Safety stock buffer in days (for reorder calculations)")
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("tenant", "code")]
        indexes = [models.Index(fields=["tenant", "is_active"])]

    def __str__(self):
        return f"{self.name} ({self.tenant.code})"


class PurchaseOrder(models.Model):
    """
    Purchase order header.
    """
    STATUS_CHOICES = [
        ("DRAFT", "Draft"),
        ("SUBMITTED", "Submitted"),
        ("PARTIAL_RECEIVED", "Partial Received"),
        ("RECEIVED", "Received"),
        ("CANCELLED", "Cancelled"),
    ]
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE, db_index=True)
    store = models.ForeignKey("stores.Store", on_delete=models.PROTECT, db_index=True)
    vendor = models.ForeignKey(Vendor, on_delete=models.PROTECT, related_name="purchase_orders")
    po_number = models.CharField(max_length=50, blank=True, db_index=True, help_text="Purchase order number")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="DRAFT", db_index=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    submitted_at = models.DateTimeField(null=True, blank=True, db_index=True, help_text="When the PO was submitted to the vendor")
    received_at = models.DateTimeField(null=True, blank=True, db_index=True, help_text="When the PO was fully or partially received")
    
    # External PO tracking fields
    is_external = models.BooleanField(
        default=False,
        db_index=True,
        help_text="True if PO was created outside the system (external receipt)"
    )
    external_po_number = models.CharField(
        max_length=100,
        blank=True,
        db_index=True,
        help_text="External PO number from vendor/tenant system"
    )
    vendor_invoice_number = models.CharField(
        max_length=100,
        blank=True,
        db_index=True,
        help_text="Vendor's invoice number (unique per tenant when provided)"
    )
    vendor_invoice_date = models.DateField(
        null=True,
        blank=True,
        help_text="Date on vendor invoice"
    )
    IMPORT_SOURCE_CHOICES = [
        ("CSV", "CSV Upload"),
        ("PDF", "PDF Upload"),
        ("IMAGE", "Image Upload"),
        ("MANUAL", "Manual Entry"),
    ]
    import_source = models.CharField(
        max_length=50,
        blank=True,
        choices=IMPORT_SOURCE_CHOICES,
        help_text="How this external PO was created"
    )
    invoice_document = models.ForeignKey(
        "tenants.TenantDoc",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="purchase_orders",
        help_text="Link to uploaded invoice document"
    )

    class Meta:
        indexes = [
            models.Index(fields=["tenant", "store", "status"]),
            models.Index(fields=["tenant", "status", "created_at"]),
            models.Index(fields=["tenant", "is_external"]),
            models.Index(fields=["tenant", "vendor_invoice_number"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "vendor_invoice_number"],
                condition=Q(vendor_invoice_number__gt=""),
                name="unique_vendor_invoice_per_tenant"
            )
        ]

    def __str__(self):
        return f"PO #{self.id} - {self.vendor.name} ({self.status})"

    def assign_po_number(self):
        """Generate PO number if not set"""
        if not self.po_number:
            code = (self.tenant.code or "TENANT").upper()
            self.po_number = f"{code}-PO-{self.id:06d}"
            self.save(update_fields=["po_number"])
        return self.po_number


class PurchaseOrderLine(models.Model):
    """
    Individual line item in a purchase order.
    """
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name="lines")
    variant = models.ForeignKey("catalog.Variant", on_delete=models.PROTECT)
    qty_ordered = models.IntegerField(help_text="Quantity ordered")
    qty_received = models.IntegerField(default=0, help_text="Quantity received so far")
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text="Cost per unit")
    notes = models.CharField(max_length=200, blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(check=~Q(qty_ordered=0), name="po_line_qty_ordered_nonzero"),
        ]

    @property
    def qty_remaining(self):
        """Calculate remaining quantity to receive"""
        return max(0, self.qty_ordered - self.qty_received)

    def __str__(self):
        return f"POLine #{self.id} - {self.variant.sku} x{self.qty_ordered}"

