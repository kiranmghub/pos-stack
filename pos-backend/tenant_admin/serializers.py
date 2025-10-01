# tenant_admin/serializers.py
from rest_framework import serializers
from discounts.models import DiscountRule, Coupon
from taxes.models import TaxRule, TaxBasis, TaxScope, ApplyScope

class DiscountRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = DiscountRule
        fields = "__all__"

class CouponSerializer(serializers.ModelSerializer):
    class Meta:
        model = Coupon
        fields = "__all__"

class TaxRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxRule
        fields = "__all__"


class TaxRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxRule
        fields = (
            "id", "name", "code", "is_active",
            "scope", "store",
            "basis", "rate", "amount",
            "apply_scope", "categories", "priority",
            "start_at", "end_at",
        )
