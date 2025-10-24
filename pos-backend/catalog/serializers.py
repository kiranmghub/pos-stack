# pos-backend/catalog/serializers.py
from rest_framework import serializers
from .models import Product, Variant, TaxCategory


class TaxCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxCategory; fields = "__all__"


# class VariantSerializer(serializers.ModelSerializer):
#     class Meta:
#         model = Variant; fields = "__all__"

class VariantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Variant
        fields = [
            "id", "name", "sku", "barcode", "price", "cost",
            "on_hand", "active", "image_file",  # adjust image field name
        ]
        read_only_fields = ["id"]


class ProductSerializer(serializers.ModelSerializer):
    variants = VariantSerializer(many=True, read_only=True, source="variant_set")
    class Meta:
        model = Product; fields = ["id","tenant","name","category","attributes","variants"]


class ProductListSerializer(serializers.ModelSerializer):
    price_min = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    price_max = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    on_hand_sum = serializers.IntegerField(read_only=True)
    variant_count = serializers.IntegerField(read_only=True)
    cover_image = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id", "name", "code", "category", "active",
            "price_min", "price_max", "on_hand_sum", "variant_count",
            "cover_image",
        ]

    def get_cover_image(self, obj):
        # Prefer product image; otherwise first variant image
        if getattr(obj, "image_file", None):
            return getattr(obj.image_file, "url", None)
        first_variant = getattr(obj, "first_variant", None)
        if first_variant and getattr(first_variant, "image_file", None):
            return getattr(first_variant.image_file, "url", None)
        return None

class ProductDetailSerializer(serializers.ModelSerializer):
    variants = VariantSerializer(many=True, read_only=True)
    price_min = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    price_max = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    on_hand_sum = serializers.IntegerField(read_only=True)
    variant_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Product
        fields = [
            "id", "name", "code", "description", "category", "active",
            "price_min", "price_max", "on_hand_sum", "variant_count",
            "image_file",  # adjust, if you store multiple images use a nested serializer instead
            "variants",
        ]
        read_only_fields = ["id"]
