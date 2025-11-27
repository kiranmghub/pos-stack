from django.apps import AppConfig
from django.db.models.signals import post_migrate


class SubscriptionsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "subscriptions"
    verbose_name = "Subscriptions"

    def ready(self):
        # Import signals for auditing
        from . import signals  # noqa: F401

        def seed_default_plan(sender, **kwargs):
            from subscriptions.models import Plan, PlanPrice
            from django.utils import timezone

            plan, _ = Plan.objects.update_or_create(
                code="POS_BASIC",
                defaults={
                    "name": "POS Basic",
                    "description": "Starter plan with trial",
                    "is_active": True,
                    "trial_days": 14,
                    "max_stores": 1,
                    "max_users": 3,
                    "max_registers": 3,
                    "features": {"analytics": "basic", "support": "email"},
                },
            )
            for currency, amount in [("USD", 29.00), ("INR", 999.00)]:
                PlanPrice.objects.update_or_create(
                    plan=plan,
                    currency=currency,
                    billing_period="monthly",
                    country_code="",
                    version=1,
                    defaults={
                        "amount": amount,
                        "valid_from": timezone.now(),
                        "valid_to": None,
                    },
                )

        post_migrate.connect(seed_default_plan, sender=self)
