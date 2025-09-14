from rest_framework import serializers
from .models import Product, Variant, TaxCategory


class TaxCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxCategory; fields = "__all__"


class VariantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Variant; fields = "__all__"


class ProductSerializer(serializers.ModelSerializer):
    variants = VariantSerializer(many=True, read_only=True, source="variant_set")
    class Meta:
        model = Product; fields = ["id","tenant","name","category","attributes","variants"]