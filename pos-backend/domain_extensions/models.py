# domain_extensions/models.py
from django.db import models
from django.conf import settings
from django.utils import timezone
from django.db.models import Q
from common.models import TimeStampedModel
from decimal import Decimal


class ICDCInvoice(TimeStampedModel):
    """
    ICDC (Invoice-cum-Delivery Challan) invoice from Telangana Government
    Prohibition & Excise Department for liquor stores.
    """
    STATUS_CHOICES = [
        ("DRAFT", "Draft"),
        ("REVIEW", "Under Review"),
        ("RECEIVED", "Received"),
        ("REVERSED", "Reversed"),
        ("CANCELLED", "Cancelled"),
    ]

    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE, db_index=True)
    store = models.ForeignKey("stores.Store", on_delete=models.PROTECT, db_index=True)
    vendor = models.ForeignKey("purchasing.Vendor", on_delete=models.PROTECT, related_name="icdc_invoices")
    
    # ICDC-specific fields
    icdc_number = models.CharField(
        max_length=100,
        db_index=True,
        help_text="ICDC number from the invoice (unique per tenant)"
    )
    invoice_date = models.DateField(help_text="Invoice date from the PDF")
    
    # PDF file storage
    pdf_file = models.ForeignKey(
        "tenants.TenantDoc",
        on_delete=models.PROTECT,
        related_name="icdc_invoices",
        help_text="Link to uploaded PDF file"
    )
    
    # Purchase order link (created on submit)
    purchase_order = models.ForeignKey(
        "purchasing.PurchaseOrder",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="icdc_invoice",
        help_text="Linked purchase order created when invoice is submitted"
    )
    
    # Status workflow
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="DRAFT",
        db_index=True,
        help_text="Current status of the invoice"
    )
    
    # Data storage
    raw_extraction = models.JSONField(
        default=dict,
        blank=True,
        help_text="Complete raw data extracted from PDF (lossless)"
    )
    canonical_data = models.JSONField(
        default=dict,
        blank=True,
        help_text="User-edited/normalized data (editable canonical form)"
    )
    
    # Parsing metadata
    parsing_errors = models.JSONField(
        default=list,
        blank=True,
        help_text="List of parsing errors encountered"
    )
    calculation_discrepancies = models.JSONField(
        default=list,
        blank=True,
        help_text="List of calculation discrepancies found"
    )
    parsing_metadata = models.JSONField(
        default=dict,
        blank=True,
        help_text="Parser version, OCR confidence scores, parsing method, etc."
    )
    
    # Re-upload tracking
    is_reupload = models.BooleanField(
        default=False,
        help_text="True if this is a re-upload of a reversed/cancelled invoice"
    )
    
    # Audit fields
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="icdc_invoices_created"
    )
    received_at = models.DateTimeField(
        null=True,
        blank=True,
        db_index=True,
        help_text="When the invoice was received (status=RECEIVED)"
    )
    reversed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the invoice was reversed (status=REVERSED)"
    )
    reversed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="icdc_invoices_reversed"
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "icdc_number"]),
            models.Index(fields=["tenant", "status", "created_at"]),
            models.Index(fields=["tenant", "store", "status"]),
            models.Index(fields=["invoice_date"]),
            models.Index(fields=["received_at"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "icdc_number"],
                name="uniq_icdc_number_per_tenant"
            ),
        ]
        verbose_name = "ICDC Invoice"
        verbose_name_plural = "ICDC Invoices"

    def __str__(self):
        return f"ICDC {self.icdc_number} - {self.store.name} ({self.status})"


class ICDCInvoiceLine(TimeStampedModel):
    """
    Individual line item in an ICDC invoice.
    """
    invoice = models.ForeignKey(
        ICDCInvoice,
        on_delete=models.CASCADE,
        related_name="lines",
        db_index=True
    )
    
    # Line number from PDF
    line_number = models.IntegerField(help_text="Line number from the PDF table")
    
    # Product matching fields (from PDF)
    brand_number = models.CharField(
        max_length=50,
        help_text="Brand number from PDF (maps to Product.code, preserve leading zeros)"
    )
    brand_name = models.CharField(
        max_length=200,
        help_text="Brand name from PDF (maps to Product.name)"
    )
    product_type = models.CharField(
        max_length=50,
        help_text="Product type from PDF (Beer/IML, maps to Category)"
    )
    
    # Pack information
    pack_qty = models.IntegerField(help_text="Number of bottles per case/box")
    size_ml = models.IntegerField(help_text="Size in ml (extracted from Pack Qty/Size column)")
    
    # Quantities delivered
    cases_delivered = models.IntegerField(
        default=0,
        help_text="Number of cases/boxes delivered"
    )
    bottles_delivered = models.IntegerField(
        default=0,
        help_text="Number of loose bottles delivered (breakage/shortage/reverted)"
    )
    
    # Rates and totals
    unit_rate = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text="Case rate (unit rate from PDF, rounded)"
    )
    btl_rate = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text="Bottle rate (btl rate from PDF, used as Variant.cost)"
    )
    total = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Total from PDF (may have discrepancies)"
    )
    calculated_total = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="Calculated total based on our rules"
    )
    
    # Discrepancy tracking
    has_discrepancy = models.BooleanField(
        default=False,
        help_text="True if there's a calculation discrepancy"
    )
    discrepancy_reason = models.TextField(
        blank=True,
        help_text="Reason for the discrepancy"
    )
    
    # Additional data (pack_type, etc.)
    raw_data = models.JSONField(
        default=dict,
        blank=True,
        help_text="Additional raw data from PDF (pack_type, etc.)"
    )
    
    # Matched products/variants (nullable until matched)
    product = models.ForeignKey(
        "catalog.Product",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="icdc_invoice_lines",
        help_text="Matched product (null until matched)"
    )
    variant = models.ForeignKey(
        "catalog.Variant",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="icdc_invoice_lines",
        help_text="Matched variant (null until matched)"
    )

    class Meta:
        ordering = ["line_number"]
        indexes = [
            models.Index(fields=["invoice", "line_number"]),
            models.Index(fields=["invoice", "product"]),
            models.Index(fields=["invoice", "variant"]),
            models.Index(fields=["brand_number"]),
        ]
        verbose_name = "ICDC Invoice Line"
        verbose_name_plural = "ICDC Invoice Lines"

    def __str__(self):
        return f"Line {self.line_number}: {self.brand_name} ({self.cases_delivered} cases)"

