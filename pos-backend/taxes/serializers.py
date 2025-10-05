# taxes/serializers.py
from rest_framework import serializers
from .models import TaxRule, TaxBasis, TaxScope, ApplyScope
from catalog.models import TaxCategory
from decimal import Decimal, ROUND_HALF_UP


class TaxCategoryLiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxCategory
        fields = ("id", "name", "code")

class TaxRuleSerializer(serializers.ModelSerializer):
    categories = TaxCategoryLiteSerializer(many=True, read_only=True)
    store_id = serializers.IntegerField(source="store.id", read_only=True)

    class Meta:
        model = TaxRule
        fields = (
            "id", "name", "code", "is_active",
            "scope", "store_id",
            "basis", "rate", "amount",
            "apply_scope", "categories", "priority",
            "start_at", "end_at",
        )

        def validate(self, attrs):
            """
            Normalize percent 'rate' so 8.25 -> 0.0825, 20 -> 0.20, clamp negatives to 0.
            Supports partial updates by falling back to instance values.
            """
            basis = str(attrs.get("basis", getattr(self.instance, "basis", ""))).upper()
            rate  = attrs.get("rate", getattr(self.instance, "rate", None))

            if basis == "PCT" and rate is not None:
                r = Decimal(rate)
                if r > 1:
                    r = r / Decimal("100")
                if r < 0:
                    r = Decimal("0")
                attrs["rate"] = r.quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)

            return attrs

