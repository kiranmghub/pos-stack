# stores/models.py
from django.db import models

# Create your models here.
from common.models import TimeStampedModel


# class Store(TimeStampedModel):
#     tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE)
#     name = models.CharField(max_length=120)
#     code = models.SlugField()
#     timezone = models.CharField(max_length=64, default="America/Chicago")
#     address = models.JSONField(default=dict)
#
#     class Meta:
#         unique_together = ("tenant", "code")
#
#     def __str__(self):
#         return f"{self.tenant.code}:{self.code}"

class Store(TimeStampedModel):
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE)
    name = models.CharField(max_length=120)
    code = models.SlugField()
    timezone = models.CharField(max_length=64, default="America/Chicago")

    # normalized, queryable fields
    street = models.CharField(max_length=200)
    city = models.CharField(max_length=100, db_index=True)       # ← group/filter
    state = models.CharField(max_length=100, db_index=True)
    postal_code = models.CharField(max_length=20, db_index=True)
    country = models.CharField(max_length=50, default="USA", db_index=True)
    is_active = models.BooleanField(default=True)
    # optional extras you won’t query often
    address_meta = models.JSONField(default=dict, blank=True)

    class Meta:
        unique_together = ("tenant", "code")
        ordering = ["code", "id"]

    def __str__(self):
        return f"{self.tenant.code}:{self.code}"



class Register(TimeStampedModel):
    store = models.ForeignKey(Store, on_delete=models.CASCADE)
    name = models.CharField(max_length=120, blank=True, default="")
    code = models.SlugField()
    hardware_profile = models.JSONField(default=dict)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ("store", "code")
        ordering = ["code", "id"]