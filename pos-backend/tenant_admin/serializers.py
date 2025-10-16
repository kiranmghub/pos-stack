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

from django.contrib.auth import get_user_model
from django.db import transaction
from common.roles import TenantRole
from django.db import IntegrityError, transaction



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
    # existing nested read
    user = UserLiteSerializer(read_only=True)
    # existing: supply an existing user
    user_id = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(),
                                                 source="user", write_only=True, required=False)
    # NEW: inline user creation/update fields
    username = serializers.CharField(write_only=True, required=False, allow_blank=False)
    email = serializers.EmailField(write_only=True, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, required=False, allow_blank=False, style={"input_type":"password"})
    stores = serializers.PrimaryKeyRelatedField(queryset=Store.objects.all(), many=True, required=False)
    store_objects = StoreLiteSerializer(many=True, read_only=True, source="stores")


    class Meta:
        model = TenantUser
        fields = ("id", "tenant", "user", "user_id",
                  "username", "email", "password",
                  "role", "is_active", "stores", "store_objects")
        read_only_fields = ("tenant",)

    def validate(self, attrs):
        # For create, either user_id OR (username + password) must be present
        creating = self.instance is None
        if creating:
            if not attrs.get("user") and not attrs.get("username"):
                raise serializers.ValidationError("Provide either user_id or username/password.")
            if attrs.get("username") and not attrs.get("password"):
                raise serializers.ValidationError("Password is required when creating a new user.")
        return attrs

    @transaction.atomic
    def create(self, validated):
        tenant = self.context["request"].tenant
        # If user supplied, just bind membership
        user = validated.pop("user", None)
        username = validated.pop("username", None)
        email = validated.pop("email", "")
        password = validated.pop("password", None)
        stores = validated.pop("stores", [])
        if user is None:
            # create a new auth user
            user = User.objects.create(username=username, email=email)
            if password:
                user.set_password(password)
                user.save(update_fields=["password"])
        tu = TenantUser.objects.create(tenant=tenant, user=user, **validated)
        if stores:
            tu.stores.set(stores)
        return tu

    @transaction.atomic
    def update(self, instance, validated):
        # Optional password change (if provided)
        password = validated.pop("password", None)
        username = validated.pop("username", None)
        email = validated.pop("email", None)
        stores = validated.pop("stores", None)


        # --- SAFETY RAILS ---
        request = self.context.get("request")
        tenant = getattr(request, "tenant", None)

        # 1) prevent self-deactivation
        if "is_active" in validated and validated["is_active"] is False:
            if request and instance.user_id == getattr(request.user, "id", None):
                raise serializers.ValidationError("You cannot deactivate your own account.")

        # 2) prevent removing the last active owner
        # a) Demotion away from OWNER
        if "role" in validated:
            new_role = validated["role"]
            if str(instance.role).lower() == str(TenantRole.OWNER).lower() and str(new_role).lower() != str(TenantRole.OWNER).lower():
                # if demoting the only active owner
                if tenant and not TenantUser.objects.filter(
                    tenant=tenant, role=TenantRole.OWNER, is_active=True
                ).exclude(pk=instance.pk).exists():
                    raise serializers.ValidationError("Cannot change role: this is the last active Owner for this tenant.")

        # b) Deactivation of an OWNER
        if "is_active" in validated and validated["is_active"] is False:
            if str(instance.role).lower() == str(TenantRole.OWNER).lower():
                if tenant and not TenantUser.objects.filter(
                    tenant=tenant, role=TenantRole.OWNER, is_active=True
                ).exclude(pk=instance.pk).exists():
                    raise serializers.ValidationError("Cannot deactivate the last active Owner for this tenant.")
        # --- END SAFETY RAILS ---

        # Update basic fields on membership
        for k in ("role", "is_active"):
            if k in validated:
                setattr(instance, k, validated[k])
        instance.save(update_fields=["role", "is_active"])

        # Update stores if provided
        if stores is not None:
            instance.stores.set(stores)

        # Update user core fields if provided
        user = instance.user
        changed = False
        if username:
            user.username = username; changed = True
        if email is not None:
            user.email = email; changed = True
        if password:
            user.set_password(password); changed = True
        if changed:
            user.save()
        return instance


class StoreSerializer(serializers.ModelSerializer):
    class Meta:
        model = Store
        fields = (
            "id", "tenant", "code", "name", "timezone",
            "street", "city", "state", "postal_code", "country",
            "is_active", "address_meta", "created_at", "updated_at"
        )
        read_only_fields = ("tenant", "created_at", "updated_at")

    # ---- Validation that runs before hitting the DB ----
    def validate_code(self, value: str):
        request = self.context.get("request")
        tenant = getattr(request, "tenant", None) if request else None
        if tenant is None:
            return value

        qs = Store.objects.filter(tenant=tenant, code=value)
        # On update, exclude the current instance
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)

        if qs.exists():
            raise serializers.ValidationError(f'Store Code "{value}" is already in use for this tenant.')
        return value

    # ---- Create with tenant injection + IntegrityError -> ValidationError ----
    def create(self, validated_data):
        request = self.context.get("request")
        tenant = getattr(request, "tenant", None) if request else None
        if tenant is not None:
            validated_data["tenant"] = tenant

        try:
            with transaction.atomic():
                return super().create(validated_data)
        except IntegrityError:
            # Fallback if a race condition slipped through validate_code
            # 👇 include the attempted code in the fallback message too
            code = validated_data.get("code", "")
            raise serializers.ValidationError({"code": [f'Store Code "{code}" is already in use for this tenant.']})

    # ---- Update with race-safe fallback as well ----
    def update(self, instance, validated_data):
        try:
            with transaction.atomic():
                return super().update(instance, validated_data)
        except IntegrityError:
            code = validated_data.get("code", getattr(instance, "code", ""))
            raise serializers.ValidationError({"code": [f'Store Code "{code}" is already in use for this tenant.']})
        

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
