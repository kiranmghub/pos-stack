# pos-backend/discounts/serializers.py
from rest_framework import serializers
from .models import DiscountRule, Coupon
from catalog.models import TaxCategory, Product, Variant
from decimal import Decimal, ROUND_HALF_UP


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
    
        def validate(self, attrs):
            """
            Normalize percent 'rate' so 20 -> 0.20, clamp negatives to 0.
            Also allow partial updates by falling back to instance values.
            """
            basis = str(attrs.get("basis", getattr(self.instance, "basis", ""))).upper()
            rate  = attrs.get("rate", getattr(self.instance, "rate", None))

            if basis == "PCT" and rate is not None:
                r = Decimal(rate)
                if r > 1:
                    r = r / Decimal("100")
                if r < 0:
                    r = Decimal("0")
                # light quantize to avoid float noise
                attrs["rate"] = r.quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)

            return attrs


class CouponSerializer(serializers.ModelSerializer):
    rule = DiscountRuleSerializer(read_only=True)
    class Meta:
        model = Coupon
        fields = (
            "id","code","is_active","rule",
            "min_subtotal","max_uses","used_count",
            "start_at","end_at",
        )
