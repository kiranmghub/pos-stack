# taxes/serializers.py
from rest_framework import serializers
from .models import TaxRule, TaxBasis, TaxScope, ApplyScope
from catalog.models import TaxCategory

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
