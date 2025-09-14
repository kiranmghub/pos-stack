from django.db import models

# Create your models here.

from django.db import models
from common.models import TimeStampedModel


class PriceList(TimeStampedModel):
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE)
    name = models.CharField(max_length=100)
    currency = models.CharField(max_length=3, default="USD")

    def __str__(self):
        return f"{self.name} ({self.currency})"


class PriceListItem(TimeStampedModel):
    pricelist = models.ForeignKey(PriceList, on_delete=models.CASCADE)
    variant = models.ForeignKey("catalog.Variant", on_delete=models.CASCADE)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    start_at = models.DateTimeField(null=True, blank=True)
    end_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.pricelist} → {self.variant} @ {self.price}"