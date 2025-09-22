
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

    def __str__(self):
        return f"{self.user} @ {self.tenant} ({self.role})"
