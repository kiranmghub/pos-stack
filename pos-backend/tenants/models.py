
from django.conf import settings
from django.db import models
from common.models import TimeStampedModel          # if you have it; else use models.Model
from common.roles import TenantRole


class Tenant(TimeStampedModel):
    """
    Company / brand. Other tables FK to this (via 'tenant').
    """
    name = models.CharField(max_length=120)
    code = models.SlugField(unique=True)
    currency_code = models.CharField(max_length=3, default="USD")
    currency_symbol = models.CharField(max_length=4, blank=True, null=True)
    currency_precision = models.PositiveSmallIntegerField(default=2)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class TenantUser(models.Model):
    """
    Membership binding a Django user to a Tenant, with a role.
    Optional store scoping inside that tenant.
    """
    tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tenant_memberships")
    role = models.CharField(max_length=20, choices=TenantRole.choices, default=TenantRole.MANAGER)
    is_active = models.BooleanField(default=True)
    # optional store scoping: if empty => all stores in tenant
    stores = models.ManyToManyField("stores.Store", blank=True, related_name="scoped_users")

    class Meta:
        unique_together = ("tenant", "user")
        ordering = ["id"]  # stable default for pagination

    def __str__(self):
        return f"{self.user} @ {self.tenant} ({self.role})"
