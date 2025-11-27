from rest_framework import serializers
from .models import PlanPrice, Subscription


class PlanPriceSerializer(serializers.ModelSerializer):
    plan_name = serializers.CharField(source="plan.name", read_only=True)
    plan_code = serializers.CharField(source="plan.code", read_only=True)
    description = serializers.CharField(source="plan.description", read_only=True)

    class Meta:
        model = PlanPrice
        fields = [
            "id",
            "plan_name",
            "plan_code",
            "description",
            "currency",
            "amount",
            "billing_period",
            "country_code",
            "version",
        ]


class SubscriptionSerializer(serializers.ModelSerializer):
    plan_code = serializers.CharField(source="plan.code", read_only=True)
    plan_name = serializers.CharField(source="plan.name", read_only=True)

    class Meta:
        model = Subscription
        fields = [
            "id",
            "tenant",
            "plan_code",
            "plan_name",
            "currency",
            "amount",
            "status",
            "trial_end_at",
            "current_period_start",
            "current_period_end",
            "is_auto_renew",
            "price_version",
        ]
