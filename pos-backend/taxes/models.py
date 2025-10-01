# taxes/models.py
from django.db import models
from common.models import TimeStampedModel
from catalog.models import TaxCategory  # existing
from stores.models import Store         # existing

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

    class Meta:
        unique_together = ("tenant", "code")
        indexes = [
            models.Index(fields=["tenant", "is_active", "scope", "priority"]),
        ]

    def __str__(self):
        return f"{self.tenant}:{self.code} ({self.name})"
