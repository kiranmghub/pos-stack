from django.db import models

# Create your models here.
from django.db import models
from common.models import TimeStampedModel


class Customer(TimeStampedModel):
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE)
    name = models.CharField(max_length=160)
    phone = models.CharField(max_length=24, blank=True)
    email = models.EmailField(blank=True)
    loyalty_id = models.CharField(max_length=64, blank=True)
    consent_flags = models.JSONField(default=dict)

    def __str__(self):
        return self.name or self.email or f"Customer #{self.id}"