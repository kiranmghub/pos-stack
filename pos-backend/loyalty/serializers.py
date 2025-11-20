# pos-backend/loyalty/serializers.py

from rest_framework import serializers

from .models import LoyaltyProgram, LoyaltyAccount, LoyaltyTransaction


class LoyaltyProgramSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoyaltyProgram
        fields = [
            "tenant",
            "is_active",
            "earn_rate",
            "redeem_rate",
            "tiers",
            "updated_at",
        ]
        read_only_fields = ["tenant", "updated_at"]


class LoyaltyAccountSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.full_name", read_only=True)

    class Meta:
        model = LoyaltyAccount
        fields = [
            "id",
            "tenant",
            "customer",
            "customer_name",
            "points_balance",
            "tier",
            "updated_at",
        ]
        read_only_fields = ["tenant", "updated_at"]
