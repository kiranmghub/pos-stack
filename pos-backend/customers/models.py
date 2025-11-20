# pos-backend/customers/models.py

# from django.db import models
# from django.db import models
# from common.models import TimeStampedModel


# class Customer(TimeStampedModel):
#     tenant = models.ForeignKey("tenants.Tenant", on_delete=models.CASCADE)
#     name = models.CharField(max_length=160)
#     phone = models.CharField(max_length=24, blank=True)
#     email = models.EmailField(blank=True)
#     loyalty_id = models.CharField(max_length=64, blank=True)
#     consent_flags = models.JSONField(default=dict)

#     def __str__(self):
#         return self.name or self.email or f"Customer #{self.id}"

# pos-backend/customers/models.py

from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone

from tenants.models import Tenant  # existing tenant model
from django.contrib.auth import get_user_model

User = get_user_model()


class Customer(models.Model):
    """
    Tenant-scoped customer profile.
    Loyalty-specific numbers live in the loyalty app (LoyaltyAccount).
    """

    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name="customers",
    )

    # Identity
    external_id = models.CharField(
        max_length=64,
        blank=True,
        null=True,
        help_text="Optional external/customer number for integrations.",
    )
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100, blank=True, null=True)

    email = models.EmailField(blank=True, null=True)
    phone_number = models.CharField(
        max_length=32,
        blank=True,
        null=True,
        help_text="E.164 or local format. Unique per tenant when provided.",
    )

    # Address (home / billing)
    address_line1 = models.CharField(max_length=255, blank=True, null=True)
    address_line2 = models.CharField(max_length=255, blank=True, null=True)
    city = models.CharField(max_length=100, blank=True, null=True)
    state_province = models.CharField(max_length=100, blank=True, null=True)
    postal_code = models.CharField(max_length=32, blank=True, null=True)
    country = models.CharField(
        max_length=2, blank=True, null=True, help_text="ISO 3166-1 alpha-2 code"
    )

    # Preferences / consent
    marketing_opt_in = models.BooleanField(default=False)
    sms_opt_in = models.BooleanField(default=False)
    is_loyalty_member = models.BooleanField(
        default=False,
        help_text="If true, customer participates in the tenant's loyalty program.",
    )

    date_of_birth = models.DateField(blank=True, null=True)
    gender = models.CharField(max_length=32, blank=True, null=True)

    # Stats (maintained only by backend business logic)
    total_spend = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal("0.00")
    )
    total_returns = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal("0.00")
    )
    net_spend = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal("0.00")
    )
    visits_count = models.IntegerField(default=0)
    last_purchase_date = models.DateTimeField(blank=True, null=True)

    # Extensibility
    custom_attributes = models.JSONField(
        blank=True,
        null=True,
        help_text="Arbitrary key/value pairs for tenant-specific data.",
    )

    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="created_customers",
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [
            ("tenant", "email"),
            ("tenant", "phone_number"),
        ]
        indexes = [
            models.Index(fields=["tenant", "last_name", "first_name"]),
            models.Index(fields=["tenant", "phone_number"]),
            models.Index(fields=["tenant", "email"]),
        ]
        ordering = ["-last_purchase_date", "-id"]

    def __str__(self) -> str:
        return f"{self.full_name} ({self.tenant_id})"

    @property
    def full_name(self) -> str:
        if self.last_name:
            return f"{self.first_name} {self.last_name}"
        return self.first_name

    def recalc_net_spend(self) -> None:
        self.net_spend = (self.total_spend or Decimal("0")) - (
            self.total_returns or Decimal("0")
        )
