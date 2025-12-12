# pos-backend/tenant_admin/serializers.py
from rest_framework import serializers
from discounts.models import DiscountRule, Coupon
from taxes.models import TaxRule, TaxBasis, TaxScope, ApplyScope
# Lazy import fix — declare at module level
from catalog.models import Product, Variant

from decimal import Decimal
from rest_framework import serializers

from tenants.models import TenantUser, TenantDoc
from django.contrib.auth import get_user_model
from stores.models import Store, Register
from catalog.models import TaxCategory
from taxes.models import TaxRule
from discounts.models import DiscountRule, Coupon

from django.contrib.auth import get_user_model
from django.db import transaction
from common.roles import TenantRole
from django.db import IntegrityError, transaction
from decimal import Decimal, ROUND_HALF_UP
# from catalog.serializers import VariantSerializer
# from catalog.serializers import ProductSerializer




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

class ProductLiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ("id", "name")

class VariantLiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Variant
        fields = ("id", "sku", "name") 


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
        if not tenant:
            raise serializers.ValidationError("Tenant not found")
        
        tenant_name = getattr(tenant, "name", None) or getattr(tenant, "code", None) or "this tenant"
        
        # If user supplied, just bind membership
        user = validated.pop("user", None)
        username = validated.pop("username", None)
        email = validated.pop("email", "")
        password = validated.pop("password", None)
        stores = validated.pop("stores", [])
        
        if user is None:
            # Check if user already exists globally
            existing_user = User.objects.filter(username=username).first()
            
            # If user exists, check if they're already linked to this tenant
            if existing_user:
                existing_tu = TenantUser.objects.filter(tenant=tenant, user=existing_user).first()
                if existing_tu:
                    raise serializers.ValidationError(
                        {"username": [f"The user '{username}' already exists for {tenant_name}. Please choose a different username."]}
                    )
                # User exists but not linked to this tenant - we can link them
                user = existing_user
            else:
                # Create a new auth user
                try:
                    user = User.objects.create(username=username, email=email)
                except IntegrityError as e:
                    error_msg = str(e).lower()
                    if "username" in error_msg or "auth_user_username_key" in error_msg:
                        raise serializers.ValidationError(
                            {"username": [f"The user '{username}' already exists for {tenant_name}. Please choose a different username."]}
                        )
                    elif "email" in error_msg:
                        raise serializers.ValidationError(
                            {"email": [f"Email '{email}' is already in use. Please use a different email."]}
                        )
                    else:
                        raise serializers.ValidationError(
                            {"username": [f"A user with this information already exists for {tenant_name}. Please check username and email."]}
                        )
            
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
            "id", "tenant", "code", "name", "timezone", "region",
            "street", "city", "state", "postal_code", "country",
            "is_active", "is_primary", "address_meta",
            "phone_number", "mobile_number", "fax_number", "email", "contact_person",
            "landmark", "description", "metadata",
            "geo_lat", "geo_lng",
            "opening_time", "closing_time",
            "tax_id",
            "created_at", "updated_at"
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
        fields = ("id", "tenant", "store", "name", "code", "hardware_profile", "is_active", "created_at", "updated_at")
        read_only_fields = ("tenant", "created_at", "updated_at")

    def validate_code(self, value: str):
        request = self.context.get("request")
        tenant = getattr(request, "tenant", None)
        if not tenant:
            return value
        qs = Register.objects.filter(tenant=tenant, code=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(f'Code "{value}" is already in use for this tenant.')
        return value

    def create(self, validated):
        request = self.context.get("request")
        tenant = getattr(request, "tenant", None)
        if tenant:
            validated["tenant"] = tenant
        # safety: ensure tenant matches store.tenant
        if validated.get("store") and tenant and validated["store"].tenant_id != tenant.id:
            raise serializers.ValidationError({"store": "Store does not belong to your tenant."})
        try:
            with transaction.atomic():
                return super().create(validated)
        except IntegrityError:
            code = validated.get("code", "")
            raise serializers.ValidationError({"code": [f'Code "{code}" is already in use for this tenant.']})

    def update(self, instance, validated):
        # safety: block cross-tenant store swaps
        request = self.context.get("request")
        tenant = getattr(request, "tenant", None)
        if validated.get("store") and tenant and validated["store"].tenant_id != tenant.id:
            raise serializers.ValidationError({"store": "Store does not belong to your tenant."})
        try:
            with transaction.atomic():
                return super().update(instance, validated)
        except IntegrityError:
            code = validated.get("code", instance.code)
            raise serializers.ValidationError({"code": [f'Code "{code}" is already in use for this tenant.']})

class TaxCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxCategory
        fields = ("id", "tenant", "code", "name", "rate", "description", "created_at", "updated_at")
        read_only_fields = ("tenant", "created_at", "updated_at")

        def validate(self, attrs):
            """
            Normalize percent so 8.25 -> 0.0825, 20 -> 0.20, clamp negatives to 0.
            Supports partial updates by falling back to instance values.
            Mirrors taxes app normalization.  :contentReference[oaicite:5]{index=5}
            """
            rate = attrs.get("rate", getattr(self.instance, "rate", None))
            if rate is not None:
                r = Decimal(rate)
                if r > 1:
                    r = r / Decimal("100")
                if r < 0:
                    r = Decimal("0")
                attrs["rate"] = r.quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
            return attrs

# ---------- RULES (TAX / DISCOUNTS) ----------
class TaxRuleSerializer(serializers.ModelSerializer):
    categories = TaxCategoryLiteSerializer(many=True, read_only=True)
    category_ids = serializers.PrimaryKeyRelatedField(
        queryset=TaxCategory.objects.all(), many=True, required=False, write_only=True, source="categories"
    )
    store = serializers.PrimaryKeyRelatedField(
        queryset=Store.objects.all(), required=False, allow_null=True
    )
    # READ-ONLY conveniences for the frontend list/table
    store_name = serializers.SerializerMethodField(read_only=True)
    category_names = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = TaxRule
        fields = (
            "id", "tenant", "code", "name", "is_active",
            "scope", "store", "store_name",
            "basis", "rate", "amount",
            "apply_scope", "priority",
            "start_at", "end_at",
            "description",
            "categories", "category_ids", "category_names",
            "created_at", "updated_at",
        )
        read_only_fields = ("tenant", "created_at", "updated_at")

    def get_store_name(self, obj):
        s = getattr(obj, "store", None)
        if not s:
            return None
        # prefer "Name (CODE)" which matches your Admin UX
        code = getattr(s, "code", None)
        name = getattr(s, "name", None)
        if name and code:
            return f"{name} ({code})"
        return name or code

    def get_category_names(self, obj):
        # Return a simple list of display names; keep it compact for tables
        try:
            return [f"{c.name} ({c.code})" if c.code else c.name for c in obj.categories.all()]
        except Exception:
            return []

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
    has_coupon = serializers.BooleanField(read_only=True)
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
    store = serializers.PrimaryKeyRelatedField(
        queryset=Store.objects.all(), required=False, allow_null=True
    )
    store_name = serializers.SerializerMethodField(read_only=True)

    # NEW: friendly names for table display
    category_names = serializers.SerializerMethodField(read_only=True)
    product_names = serializers.SerializerMethodField(read_only=True)
    variant_names = serializers.SerializerMethodField(read_only=True)

    products = ProductLiteSerializer(many=True, read_only=True)
    variants = VariantLiteSerializer(many=True, read_only=True)


    def get_store_name(self, obj):
        s = getattr(obj, "store", None)
        if not s:
            return None
        code = getattr(s, "code", None)
        name = getattr(s, "name", None)
        if name and code:
            return f"{name} ({code})"
        return name or code
    
    def get_category_names(self, obj):
       try:
           return [f"{c.name} ({c.code})" if c.code else c.name for c in obj.categories.all()]
       except Exception:
           return []

    def get_product_names(self, obj):
        try:
            return [p.name for p in obj.products.all()]
        except Exception:
            return []

    def get_variant_names(self, obj):
        try:
            return [v.sku for v in obj.variants.all()]
        except Exception:
            return []


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
            "scope", "store", "store_name",
            "basis", "rate", "amount",
            "apply_scope", "target",
            "stackable", "priority",
            "start_at", "end_at",
            "description",
            "categories", "category_ids",
            "product_ids", "variant_ids",
            "category_names", "product_names", "variant_names",
            "products", "variants",
            "has_coupon",
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
            "description",
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


# ---------- DOCUMENTS ----------
from tenants.models import TenantDoc
from purchasing.models import PurchaseOrder

class TenantDocSerializer(serializers.ModelSerializer):
    """
    Serializer for TenantDoc model with computed fields for file URLs and related Purchase Orders.
    """
    uploaded_by = UserLiteSerializer(read_only=True)
    subject_user = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()
    file_name = serializers.SerializerMethodField()
    file_size = serializers.SerializerMethodField()
    file_type = serializers.SerializerMethodField()
    related_pos = serializers.SerializerMethodField()
    
    class Meta:
        model = TenantDoc
        fields = (
            "id",
            "label",
            "doc_type",
            "description",
            "file_url",
            "file_name",
            "file_size",
            "file_type",
            "uploaded_by",
            "subject_user",
            "metadata",
            "related_pos",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "created_at",
            "updated_at",
        )
    
    def get_subject_user(self, obj):
        """Return subject user info if available."""
        if obj.subject_user:
            return {
                "id": obj.subject_user.id,
                "username": obj.subject_user.user.username if obj.subject_user.user else None,
            }
        return None
    
    def get_file_url(self, obj):
        """
        Return proxied download URL (not direct file URL).
        Frontend should use this URL to download files through authenticated endpoint.
        """
        request = self.context.get("request")
        if not request or not obj.id:
            return None
        # Return proxied download endpoint URL (with trailing slash)
        return request.build_absolute_uri(f"/api/v1/tenant_admin/documents/{obj.id}/file/")
    
    def get_file_name(self, obj):
        """Extract filename from file path."""
        if not obj.file or not obj.file.name:
            return None
        # Extract just the filename from the path
        return obj.file.name.split("/")[-1]
    
    def get_file_size(self, obj):
        """Get file size in bytes."""
        try:
            if obj.file and hasattr(obj.file, "size"):
                return obj.file.size
        except (OSError, ValueError):
            pass
        return None
    
    def get_file_type(self, obj):
        """Get file MIME type or infer from extension."""
        try:
            if obj.file and hasattr(obj.file, "content_type") and obj.file.content_type:
                return obj.file.content_type
            # Fallback: infer from extension
            if obj.file and obj.file.name:
                ext = obj.file.name.split(".")[-1].lower()
                mime_map = {
                    "pdf": "application/pdf",
                    "jpg": "image/jpeg",
                    "jpeg": "image/jpeg",
                    "png": "image/png",
                    "gif": "image/gif",
                }
                return mime_map.get(ext, "application/octet-stream")
        except (OSError, ValueError, AttributeError):
            pass
        return None
    
    def get_related_pos(self, obj):
        """
        Get related Purchase Orders via direct FK relationship (primary) 
        and metadata lookup (fallback for legacy data).
        Returns array of related PO objects.
        """
        related_pos = []
        tenant = obj.tenant
        
        # Strategy 1: Direct FK relationship (most reliable)
        # PurchaseOrder.invoice_document FK points to TenantDoc
        for po in obj.purchase_orders.all().only("id", "po_number", "status"):
            related_pos.append({
                "id": po.id,
                "po_number": po.po_number or f"PO-{po.id}",
                "status": po.status,
                "link_type": "direct",  # Linked via invoice_document FK
            })
        
        # Strategy 2: Metadata lookup (fallback for legacy documents without FK)
        if not related_pos:
            metadata = obj.metadata or {}
            vendor_invoice_number = metadata.get("vendor_invoice_number", "").strip()
            
            if vendor_invoice_number:
                try:
                    pos = PurchaseOrder.objects.filter(
                        tenant=tenant,
                        vendor_invoice_number=vendor_invoice_number
                    ).only("id", "po_number", "status")
                    
                    for po in pos:
                        related_pos.append({
                            "id": po.id,
                            "po_number": po.po_number or f"PO-{po.id}",
                            "status": po.status,
                            "link_type": "metadata",  # Found via metadata lookup
                        })
                except Exception:
                    # Silently fail on lookup errors
                    pass
        
        return related_pos if related_pos else None


class TenantDocUploadSerializer(serializers.Serializer):
    """Serializer for document upload (multipart/form-data)."""
    label = serializers.CharField(max_length=160, required=True)
    doc_type = serializers.CharField(max_length=80, required=False, allow_blank=True)
    description = serializers.CharField(required=False, allow_blank=True)
    metadata = serializers.JSONField(required=False, default=dict)
    file = serializers.FileField(required=True)
    
    def validate_file(self, value):
        """Validate file size and type."""
        # Size validation (10MB max)
        MAX_SIZE = 10 * 1024 * 1024  # 10MB
        if value.size > MAX_SIZE:
            raise serializers.ValidationError(
                f"File size exceeds maximum of {MAX_SIZE / (1024*1024):.0f}MB"
            )
        
        # MIME type validation
        ALLOWED_MIME_TYPES = [
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
            "image/tiff",
            "image/bmp",
        ]
        
        # Check content type
        content_type = value.content_type or ""
        file_extension = (value.name or "").split(".")[-1].lower()
        
        # Extension whitelist
        ALLOWED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "gif", "webp", "tiff", "tif", "bmp"]
        
        is_valid = False
        if content_type in ALLOWED_MIME_TYPES:
            is_valid = True
        elif file_extension in ALLOWED_EXTENSIONS:
            is_valid = True
        
        if not is_valid:
            raise serializers.ValidationError(
                "Invalid file type. Allowed: PDF, JPEG, PNG, GIF, WebP, TIFF, BMP"
            )
        
        return value
