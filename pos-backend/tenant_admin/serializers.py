# pos-backend/tenant_admin/serializers.py
from rest_framework import serializers
from discounts.models import DiscountRule, Coupon
from taxes.models import TaxRule, TaxBasis, TaxScope, ApplyScope
# Lazy import fix — declare at module level
from catalog.models import Product, Variant

from decimal import Decimal
from rest_framework import serializers

from tenants.models import TenantUser
from django.contrib.auth import get_user_model
from stores.models import Store, Register
from catalog.models import TaxCategory
from taxes.models import TaxRule
from discounts.models import DiscountRule, Coupon

User = get_user_model()

# ---------- LITE HELPERS ----------
class UserLiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "email", "first_name", "last_name", "is_active")

class StoreLiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Store
        fields = ("id", "code", "name", "is_active")

class TaxCategoryLiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxCategory
        fields = ("id", "code", "name", "rate")

# ---------- CORE ENTITIES ----------
class TenantUserSerializer(serializers.ModelSerializer):
    user = UserLiteSerializer(read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(),
                                                 source="user", write_only=True)
    stores = serializers.PrimaryKeyRelatedField(queryset=Store.objects.all(),
                                                many=True, required=False)

    class Meta:
        model = TenantUser
        fields = ("id", "tenant", "user", "user_id", "role", "is_active", "stores")
        read_only_fields = ("tenant",)

class StoreSerializer(serializers.ModelSerializer):
    class Meta:
        model = Store
        fields = (
            "id", "tenant", "code", "name", "timezone",
            "street", "city", "state", "postal_code", "country",
            "is_active", "address_meta", "created_at", "updated_at"
        )
        read_only_fields = ("tenant", "created_at", "updated_at")

class RegisterSerializer(serializers.ModelSerializer):
    class Meta:
        model = Register
        fields = ("id", "store", "name", "code", "hardware_profile", "is_active", "created_at", "updated_at")
        read_only_fields = ("created_at", "updated_at")

class TaxCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxCategory
        fields = ("id", "tenant", "code", "name", "rate", "created_at", "updated_at")
        read_only_fields = ("tenant", "created_at", "updated_at")

# ---------- RULES (TAX / DISCOUNTS) ----------
class TaxRuleSerializer(serializers.ModelSerializer):
    categories = TaxCategoryLiteSerializer(many=True, read_only=True)
    category_ids = serializers.PrimaryKeyRelatedField(
        queryset=TaxCategory.objects.all(), many=True, write_only=True, source="categories"
    )
    store_id = serializers.PrimaryKeyRelatedField(
        queryset=Store.objects.all(), required=False, allow_null=True, source="store"
    )

    class Meta:
        model = TaxRule
        fields = (
            "id", "tenant", "code", "name", "is_active",
            "scope", "store_id",
            "basis", "rate", "amount",
            "apply_scope", "priority",
            "start_at", "end_at",
            "categories", "category_ids",
            "created_at", "updated_at",
        )
        read_only_fields = ("tenant", "created_at", "updated_at")

    # normalize percent: allow "8.25" to become 0.0825
    def validate(self, attrs):
        basis = str(attrs.get("basis", getattr(self.instance, "basis", ""))).upper()
        rate  = attrs.get("rate", getattr(self.instance, "rate", None))
        if basis == "PCT" and rate is not None:
            r = Decimal(rate)
            if r > 1: attrs["rate"] = r / Decimal("100")
            if r < 0: attrs["rate"] = Decimal("0")
        return attrs

class DiscountRuleSerializer(serializers.ModelSerializer):
    categories = TaxCategoryLiteSerializer(many=True, read_only=True)
    category_ids = serializers.PrimaryKeyRelatedField(
        queryset=TaxCategory.objects.all(), many=True, write_only=True, source="categories"
    )
    product_ids = serializers.PrimaryKeyRelatedField(
        many=True, required=False, allow_null=True,
        queryset=Product.objects.all(), 
        source="products", write_only=True
    )
    variant_ids = serializers.PrimaryKeyRelatedField(
        many=True, required=False, allow_null=True,
        queryset=Variant.objects.all(),
        source="variants", write_only=True
    )
    store_id = serializers.PrimaryKeyRelatedField(
        queryset=Store.objects.all(), required=False, allow_null=True, source="store"
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # lazy import to avoid circulars
        from catalog.models import Product, Variant
        self.fields["product_ids"].queryset = Product.objects.all()
        self.fields["variant_ids"].queryset = Variant.objects.all()

    class Meta:
        model = DiscountRule
        fields = (
            "id", "tenant", "code", "name", "is_active",
            "scope", "store_id",
            "basis", "rate", "amount",
            "apply_scope", "target",
            "stackable", "priority",
            "start_at", "end_at",
            "categories", "category_ids",
            "product_ids", "variant_ids",
            "created_at", "updated_at",
        )
        read_only_fields = ("tenant", "created_at", "updated_at")

    def validate(self, attrs):
        basis = str(attrs.get("basis", getattr(self.instance, "basis", ""))).upper()
        rate  = attrs.get("rate", getattr(self.instance, "rate", None))
        if basis == "PCT" and rate is not None:
            r = Decimal(rate)
            if r > 1: attrs["rate"] = r / Decimal("100")
            if r < 0: attrs["rate"] = Decimal("0")
        return attrs

class CouponSerializer(serializers.ModelSerializer):
    rule = DiscountRuleSerializer(read_only=True)
    rule_id = serializers.PrimaryKeyRelatedField(queryset=DiscountRule.objects.all(),
                                                 source="rule", write_only=True)

    remaining_uses = serializers.SerializerMethodField()

    class Meta:
        model = Coupon
        fields = (
            "id", "tenant", "code", "name", "is_active",
            "rule", "rule_id",
            "min_subtotal", "max_uses", "used_count",
            "start_at", "end_at",
            "remaining_uses",
            "created_at", "updated_at",
        )
        read_only_fields = ("tenant", "created_at", "updated_at")

    def get_remaining_uses(self, obj):
        if obj.max_uses is None: return None
        return max(0, int(obj.max_uses) - int(obj.used_count or 0))
