# taxes/models.py
from django.db import models
from common.models import TimeStampedModel
from catalog.models import TaxCategory  # existing
from stores.models import Store         # existing
from decimal import Decimal, ROUND_HALF_UP

class TaxScope(models.TextChoices):
    GLOBAL = "GLOBAL", "Global (all stores)"
    STORE  = "STORE", "Store-specific"

class TaxBasis(models.TextChoices):
    PERCENT = "PCT", "Percent of line"
    FLAT    = "FLAT", "Flat fee"

class ApplyScope(models.TextChoices):
    LINE    = "LINE", "Per line item"
    RECEIPT = "RECEIPT", "Once per receipt"

class TaxRule(TimeStampedModel):
    tenant      = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE, db_index=True)
    name        = models.CharField(max_length=80)
    code        = models.SlugField()
    is_active   = models.BooleanField(default=True, db_index=True)

    scope       = models.CharField(max_length=10, choices=TaxScope.choices, default=TaxScope.GLOBAL, db_index=True)
    store       = models.ForeignKey(Store, null=True, blank=True, on_delete=models.CASCADE)  # required when scope=STORE

    basis       = models.CharField(max_length=8, choices=TaxBasis.choices, default=TaxBasis.PERCENT)
    rate        = models.DecimalField(max_digits=6, decimal_places=4, null=True, blank=True)  # used when basis=PCT (e.g., 0.0825)
    amount      = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True) # used when basis=FLAT (e.g., 2.00)

    apply_scope = models.CharField(max_length=10, choices=ApplyScope.choices, default=ApplyScope.LINE)

    # If no categories selected -> applies to ALL taxable items
    categories  = models.ManyToManyField(TaxCategory, blank=True, related_name="rules")

    # Evaluation order (lower runs first). Useful if you ever add compounding rules.
    priority    = models.PositiveIntegerField(default=100, db_index=True)

    # Windows (optional)
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
        indexes = [
            models.Index(fields=["tenant", "is_active", "scope", "priority"]),
        ]

    def __str__(self):
        return f"{self.tenant}:{self.code} ({self.name})"
    
    def clean(self):
        super().clean()
        # Only normalize when basis is percent
        if str(self.basis).upper() != "PCT" and self.rate is not None:
            self.rate = type(self)._norm_pct(self.rate)

    def save(self, *args, **kwargs):
        # Ensure normalization/validation runs for all save paths (admin, API, scripts, fixtures)
        self.full_clean()
        return super().save(*args, **kwargs)
