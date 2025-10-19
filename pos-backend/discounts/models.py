# pos-backend/discounts/models.py
from django.db import models
from common.models import TimeStampedModel
from stores.models import Store
from catalog.models import TaxCategory, Product, Variant
from decimal import Decimal, ROUND_HALF_UP


class DiscountScope(models.TextChoices):
    GLOBAL = "GLOBAL", "Global"
    STORE  = "STORE",  "Store-specific"

class DiscountBasis(models.TextChoices):
    PERCENT = "PCT", "Percent"
    FLAT    = "FLAT", "Flat amount"

class ApplyScope(models.TextChoices):
    LINE    = "LINE", "Per line"
    RECEIPT = "RECEIPT", "Per receipt"

class DiscountTarget(models.TextChoices):
    ALL        = "ALL", "All items"
    CATEGORY   = "CATEGORY", "Tax categories"
    PRODUCT    = "PRODUCT", "Specific products"
    VARIANT    = "VARIANT", "Specific variants"

class DiscountRule(TimeStampedModel):
    tenant      = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE, db_index=True)
    name        = models.CharField(max_length=80)
    code        = models.SlugField()
    is_active   = models.BooleanField(default=True, db_index=True)
    description = models.TextField(blank=True, default="")

    scope       = models.CharField(max_length=10, choices=DiscountScope.choices, default=DiscountScope.GLOBAL, db_index=True)
    store       = models.ForeignKey(Store, null=True, blank=True, on_delete=models.CASCADE)

    basis       = models.CharField(max_length=8, choices=DiscountBasis.choices, default=DiscountBasis.PERCENT)
    rate        = models.DecimalField(max_digits=6, decimal_places=4, null=True, blank=True)   # 10% => 0.10
    amount      = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    apply_scope = models.CharField(max_length=10, choices=ApplyScope.choices, default=ApplyScope.LINE)
    target      = models.CharField(max_length=10, choices=DiscountTarget.choices, default=DiscountTarget.ALL)

    # target sets (leave empty if target=ALL)
    categories  = models.ManyToManyField(TaxCategory, blank=True, related_name="discount_rules")
    products    = models.ManyToManyField(Product,     blank=True, related_name="discount_rules")
    variants    = models.ManyToManyField(Variant,     blank=True, related_name="discount_rules")

    # Stacking & priority
    stackable   = models.BooleanField(default=True)   # if False, stop after applying this rule
    priority    = models.PositiveIntegerField(default=100, db_index=True)

    # time window
    start_at    = models.DateTimeField(null=True, blank=True)
    end_at      = models.DateTimeField(null=True, blank=True)

    @staticmethod
    def _norm_pct(value: Decimal) -> Decimal:
        """Accepts 0.2 or 20 to mean 20%. Returns normalized Decimal in [0,1]."""
        if value is None:
            return None
        v = Decimal(value)
        if v > 1:
            v = v / Decimal("100")
        if v < 0:
            v = Decimal("0")
        # quantize to 6 decimal places to avoid float noise
        return v.quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)


    class Meta:
        unique_together = ("tenant", "code")
        indexes = [models.Index(fields=["tenant", "is_active", "scope", "priority"])]
        ordering = ["priority", "id"]

    def __str__(self):
        return f"{self.tenant}:{self.code}"
    
    def clean(self):
        super().clean()
        # Only normalize when basis is percent
        if str(self.basis).upper() != "PCT" and self.rate is not None:
            self.rate = type(self)._norm_pct(self.rate)

    def save(self, *args, **kwargs):
        # Ensure normalization/validation runs for all save paths (admin, API, scripts, fixtures)
        self.full_clean()
        return super().save(*args, **kwargs)


class Coupon(TimeStampedModel):
    tenant    = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE, db_index=True)
    code      = models.CharField(max_length=64, db_index=True, unique=True)
    name      = models.CharField(max_length=120, blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)

    # bind to a rule (line or receipt); you can extend to many-to-many later if needed
    rule      = models.ForeignKey(DiscountRule, on_delete=models.CASCADE)

    # constraints
    min_subtotal = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    max_uses     = models.PositiveIntegerField(null=True, blank=True)
    used_count   = models.PositiveIntegerField(default=0, db_index=True)

    start_at    = models.DateTimeField(null=True, blank=True)
    end_at      = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["code", "id"]


    def __str__(self):
        return f"{self.tenant}:{self.code}"
    
    
