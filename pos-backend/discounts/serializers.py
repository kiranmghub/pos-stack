# discounts/serializers.py
from rest_framework import serializers
from .models import DiscountRule, Coupon
from catalog.models import TaxCategory, Product, Variant

class TaxCategoryLiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxCategory
        fields = ("id", "name", "code")

class DiscountRuleSerializer(serializers.ModelSerializer):
    categories = TaxCategoryLiteSerializer(many=True, read_only=True)
    product_ids = serializers.PrimaryKeyRelatedField(source="products", many=True, read_only=True)
    variant_ids = serializers.PrimaryKeyRelatedField(source="variants", many=True, read_only=True)
    store_id = serializers.IntegerField(source="store.id", read_only=True)

    class Meta:
        model = DiscountRule
        fields = (
            "id", "name", "code", "is_active",
            "scope", "store_id",
            "basis", "rate", "amount",
            "apply_scope", "target", "categories",
            "product_ids", "variant_ids",
            "stackable", "priority",
            "start_at", "end_at",
        )

class CouponSerializer(serializers.ModelSerializer):
    rule = DiscountRuleSerializer(read_only=True)
    class Meta:
        model = Coupon
        fields = (
            "id","code","is_active","rule",
            "min_subtotal","max_uses","used_count",
            "start_at","end_at",
        )
