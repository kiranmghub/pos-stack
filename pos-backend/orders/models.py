# pos-backend/orders/models.py

from django.db import models
from django.utils import timezone
from tenants.models import Tenant
from stores.models import Store, Register
from catalog.models import Variant
from django.contrib.auth.models import User
from decimal import Decimal
from customers.models import Customer



class Sale(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("completed", "Completed"),
        ("void", "Void"),
    ]

    tenant = models.ForeignKey(Tenant, on_delete=models.PROTECT, related_name="sales")
    store = models.ForeignKey(Store, on_delete=models.PROTECT, related_name="sales")
    register = models.ForeignKey(Register, on_delete=models.PROTECT, related_name="sales")
    cashier = models.ForeignKey(User, on_delete=models.PROTECT, related_name="sales")
    customer = models.ForeignKey(
        Customer,
        null=True,
        blank=True,
        related_name="sales",
        on_delete=models.SET_NULL,
        help_text="Optional customer associated with this sale.",
    )

    total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")

    # receipt snapshot
    receipt_no = models.CharField(max_length=32, blank=True, null=True, db_index=True)
    receipt_data = models.JSONField(blank=True, null=True)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Sale #{self.id} - {self.store} - {self.total}"

    def assign_receipt_no(self):
        if self.receipt_no:
            return self.receipt_no
        code = (self.tenant.code or "TENANT").upper()
        self.receipt_no = f"{code}-{self.id:06d}"
        return self.receipt_no


class SaleLine(models.Model):
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="lines")
    variant = models.ForeignKey(Variant, on_delete=models.PROTECT, related_name="saleline")
    qty = models.IntegerField()
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tax = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    line_total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    created_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return f"SaleLine {self.sale_id} - {self.variant} x {self.qty}"


class SalePayment(models.Model):
    CASH = "CASH"
    CARD = "CARD"
    OTHER = "OTHER"
    TYPE_CHOICES = [(CASH, "Cash"), (CARD, "Card"), (OTHER, "Other")]

    # IMPORTANT: unique reverse name to avoid clashing with payments.Payment.sale (which uses 'payments')
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="pos_payments")

    type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    amount = models.DecimalField(max_digits=10, decimal_places=2)             # applied to this sale
    received = models.DecimalField(max_digits=10, decimal_places=2, default=0)  # cash given (for cash)
    change = models.DecimalField(max_digits=10, decimal_places=2, default=0)    # cash returned
    txn_ref = models.CharField(max_length=64, blank=True, null=True)
    meta = models.JSONField(blank=True, null=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.type} ${self.amount} for Sale #{self.sale_id}"


class SaleReceipt(models.Model):
    sale = models.OneToOneField("orders.Sale", related_name="receipt", on_delete=models.CASCADE)
    number = models.CharField(max_length=32, unique=True)  # e.g. "RCP-20250909-000123"
    qr_png_data_url = models.TextField(blank=True, null=True)  # "data:image/png;base64,...."
    created_at = models.DateTimeField(auto_now_add=True)



class Return(models.Model):
    STATUS_CHOICES = [
        ("draft", "Draft"),
        ("finalized", "Finalized"),
        ("void", "Void"),
    ]

    tenant = models.ForeignKey(Tenant, on_delete=models.PROTECT, related_name="returns")
    store = models.ForeignKey(Store, on_delete=models.PROTECT, related_name="returns")
    sale = models.ForeignKey("orders.Sale", on_delete=models.PROTECT, related_name="returns")
    processed_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name="processed_returns")
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="draft")

    return_no = models.CharField(max_length=32, blank=True, null=True, db_index=True)
    reason_code = models.CharField(max_length=32, blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    refund_total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"Return #{self.id} for Sale #{self.sale_id}"

    def assign_return_no(self):
        if self.return_no:
            return self.return_no
        code = (self.tenant.code or "TENANT").upper()
        self.return_no = f"{code}-RET-{self.id:06d}"
        return self.return_no


class ReturnItem(models.Model):
    CONDITION_CHOICES = [
        ("RESALEABLE", "Resaleable"),
        ("DAMAGED", "Damaged"),
        ("OPEN_BOX", "Open box"),
    ]

    return_ref = models.ForeignKey(Return, on_delete=models.CASCADE, related_name="items")
    sale_line = models.ForeignKey(SaleLine, on_delete=models.PROTECT, related_name="return_items")
    qty_returned = models.PositiveIntegerField()
    restock = models.BooleanField(default=True)
    condition = models.CharField(max_length=16, choices=CONDITION_CHOICES, default="RESALEABLE")

    refund_subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    refund_tax = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    refund_total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    created_at = models.DateTimeField(default=timezone.now)
    reason_code = models.CharField(max_length=64, blank=True, null=True)
    notes = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"ReturnItem sale_line={self.sale_line_id} x{self.qty_returned}"


class Refund(models.Model):
    CASH = "CASH"
    CARD = "CARD"
    STORE_CREDIT = "STORE_CREDIT"
    OTHER = "OTHER"
    METHOD_CHOICES = [(CASH, "Cash"), (CARD, "Card"), (STORE_CREDIT, "Store credit"), (OTHER, "Other")]

    return_ref = models.ForeignKey(Return, on_delete=models.CASCADE, related_name="refunds")
    method = models.CharField(max_length=16, choices=METHOD_CHOICES)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    external_ref = models.CharField(max_length=64, blank=True, null=True)
    created_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return f"{self.method} ${self.amount} for Return #{self.return_ref_id}"

    @staticmethod
    def compute_line_refund(ln: "SaleLine", qty: int) -> dict:
        """
        Pro-rate line values by quantity to compute refundable amounts.
        All math is done in Decimal, using the sale line as the single source of truth.
        """
        qty = int(qty or 0)
        if qty <= 0:
            return {"subtotal": Decimal("0.00"), "tax": Decimal("0.00"), "total": Decimal("0.00")}

        # ensure all components are Decimals
        line_total = ln.line_total or Decimal("0.00")
        discount = ln.discount or Decimal("0.00")
        tax = ln.tax or Decimal("0.00")
        fee = ln.fee or Decimal("0.00")

        # denominator: how many units were sold on this line
        sold_qty = int(ln.qty or 0)
        if sold_qty <= 0:
            # defensive: if a bad line exists, treat as non-refundable
            return {"subtotal": Decimal("0.00"), "tax": Decimal("0.00"), "total": Decimal("0.00")}

        sold_qty_dec = Decimal(sold_qty)
        # pre-tax, pre-fee, post-discount subtotal for the whole line
        net_pre_tax_whole = line_total + discount - tax - fee
        subtotal_per_unit = net_pre_tax_whole / sold_qty_dec
        tax_per_unit = tax / sold_qty_dec
        total_per_unit = subtotal_per_unit + tax_per_unit  # fees are not refunded

        qty_dec = Decimal(qty)
        return {
            "subtotal": (subtotal_per_unit * qty_dec).quantize(Decimal("0.01")),
            "tax": (tax_per_unit * qty_dec).quantize(Decimal("0.01")),
            "total": (total_per_unit * qty_dec).quantize(Decimal("0.01")),
        }


class AuditLog(models.Model):
    SEVERITY_CHOICES = [
        ("info", "Info"),
        ("warning", "Warning"),
        ("critical", "Critical"),
    ]

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="audit_logs")
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, null=True, blank=True, related_name="audit_logs")
    store = models.ForeignKey(Store, on_delete=models.CASCADE, null=True, blank=True, related_name="audit_logs")
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="audit_logs")
    action = models.CharField(max_length=64)
    severity = models.CharField(max_length=16, choices=SEVERITY_CHOICES, default="info")
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.action} @ {self.created_at}"

    @classmethod
    def record(cls, *, tenant, action, user=None, sale=None, store=None, severity="info", metadata=None):
        if sale and not store:
            store = sale.store
        cls.objects.create(
            tenant=tenant,
            action=action,
            user=user,
            sale=sale,
            store=store,
            severity=severity,
            metadata=metadata or {},
        )
