from django.db import models
from django.utils import timezone
from tenants.models import Tenant
from discounts.models import Coupon
from django.conf import settings


class Plan(models.Model):
    code = models.CharField(max_length=50, unique=True)  # e.g. POS_BASIC
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    trial_days = models.PositiveIntegerField(default=14)

    max_stores = models.IntegerField(default=1)
    max_users = models.IntegerField(default=3)
    max_registers = models.IntegerField(default=3)

    features = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return self.code


class PlanPrice(models.Model):
    BILLING_MONTHLY = "monthly"
    BILLING_YEARLY = "yearly"

    BILLING_CHOICES = [
        (BILLING_MONTHLY, "Monthly"),
        (BILLING_YEARLY, "Yearly"),
    ]

    plan = models.ForeignKey(Plan, on_delete=models.CASCADE, related_name="prices")
    currency = models.CharField(max_length=3)  # ISO 4217
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    billing_period = models.CharField(max_length=10, choices=BILLING_CHOICES)

    country_code = models.CharField(max_length=2, blank=True)  # ISO alpha-2, blank = global
    version = models.IntegerField(default=1)
    valid_from = models.DateTimeField(default=timezone.now)
    valid_to = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [("plan", "currency", "billing_period", "country_code", "version")]
        ordering = ["plan", "currency", "billing_period", "-version"]
        indexes = [
            models.Index(fields=["plan", "currency", "billing_period"]),
            models.Index(fields=["country_code"]),
        ]

    def __str__(self):
        return f"{self.plan.code}-{self.currency}-{self.billing_period}-v{self.version}"


class Subscription(models.Model):
    STATUS_TRIALING = "trialing"
    STATUS_ACTIVE = "active"
    STATUS_CANCELED = "canceled"
    STATUS_PAST_DUE = "past_due"

    STATUS_CHOICES = [
        (STATUS_TRIALING, "Trialing"),
        (STATUS_ACTIVE, "Active"),
        (STATUS_CANCELED, "Canceled"),
        (STATUS_PAST_DUE, "Past due"),
    ]

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="subscriptions")
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT)
    currency = models.CharField(max_length=3)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES)

    trial_end_at = models.DateTimeField(null=True, blank=True)
    current_period_start = models.DateTimeField(default=timezone.now)
    current_period_end = models.DateTimeField()
    coupon = models.ForeignKey(Coupon, null=True, blank=True, on_delete=models.SET_NULL, related_name="subscriptions")

    is_auto_renew = models.BooleanField(default=True)
    price_version = models.IntegerField(default=1)

    external_provider = models.CharField(max_length=32, blank=True)
    external_subscription_id = models.CharField(max_length=128, blank=True)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "status"]),
        ]

    def __str__(self):
        return f"{self.tenant_id}-{self.plan.code}-{self.status}"


class SubscriptionAudit(models.Model):
    ACTION_CHOICES = [
        ("created", "Created"),
        ("status_changed", "Status changed"),
        ("amount_changed", "Amount changed"),
        ("auto_renew_changed", "Auto-renew changed"),
    ]

    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="subscription_audits")
    subscription = models.ForeignKey(Subscription, on_delete=models.CASCADE, related_name="audits")
    action = models.CharField(max_length=32, choices=ACTION_CHOICES)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="subscription_audits"
    )
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["subscription", "action"]),
            models.Index(fields=["tenant"]),
        ]

    def __str__(self):
        return f"{self.subscription_id}:{self.action}"
