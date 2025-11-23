# pos-backend/loyalty/models.py

from decimal import Decimal

from django.db import models
from django.utils import timezone

from tenants.models import Tenant
from customers.models import Customer
from orders.models import Sale  # for linking earning to sale


class LoyaltyProgram(models.Model):
    """
    Per-tenant loyalty settings.
    """

    tenant = models.OneToOneField(
        Tenant,
        on_delete=models.CASCADE,
        related_name="loyalty_program",
    )
    is_active = models.BooleanField(default=False)
    earn_rate = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=Decimal("1.00"),
        help_text="Points earned per 1.00 of currency spent.",
    )
    redeem_rate = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        default=Decimal("100.00"),
        help_text="Points needed per 1.00 of currency redeemed (store credit).",
    )

    # Optional: tiers in JSON for now; can be a separate table later.
    tiers = models.JSONField(
        blank=True,
        null=True,
        help_text="Optional tier rules (e.g. thresholds for Silver/Gold/etc.)",
    )

    updated_at = models.DateTimeField(auto_now=True)


class LoyaltyAccount(models.Model):
    """
    Loyalty account per customer (per tenant).
    """

    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name="loyalty_accounts",
    )
    customer = models.OneToOneField(
        Customer,
        on_delete=models.CASCADE,
        related_name="loyalty_account",
    )
    points_balance = models.IntegerField(default=0)
    tier = models.CharField(max_length=32, blank=True, null=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("tenant", "customer")]
        indexes = [
            models.Index(fields=["tenant", "points_balance"]),
        ]


class LoyaltyTransaction(models.Model):
    """
    Immutable log of loyalty point changes.
    """

    EARN = "EARN"
    REDEEM = "REDEEM"
    ADJUST = "ADJUST"

    TYPE_CHOICES = [
        (EARN, "Earn"),
        (REDEEM, "Redeem"),
        (ADJUST, "Adjust"),
    ]

    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name="loyalty_transactions",
    )
    account = models.ForeignKey(
        LoyaltyAccount,
        on_delete=models.CASCADE,
        related_name="transactions",
    )
    sale = models.ForeignKey(
        Sale,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="loyalty_transactions",
    )

    type = models.CharField(max_length=16, choices=TYPE_CHOICES)
    points = models.IntegerField()
    balance_after = models.IntegerField()
    metadata = models.JSONField(blank=True, null=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["tenant", "type"]),
        ]
