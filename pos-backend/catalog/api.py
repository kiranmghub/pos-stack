# pos-backend/catalog/api.py
from decimal import Decimal
from django.db.models import Sum, Count, F, Value, IntegerField, DecimalField, CharField
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from rest_framework.generics import ListCreateAPIView, RetrieveUpdateDestroyAPIView, RetrieveUpdateAPIView
from rest_framework import permissions, status, serializers, parsers
from django.db import transaction
from django.db.models import Q

from tenants.models import Tenant
from tenants.models import TenantUser
from stores.models import Store
from catalog.models import Product, Variant, TaxCategory
from inventory.models import InventoryItem
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
import os
from django.conf import settings
from django.core.files.storage import default_storage, FileSystemStorage

from django.db.models import Sum, Min, Max, Count, OuterRef, Subquery
from django.db.models.functions import Coalesce
from rest_framework import viewsets, mixins, filters
from rest_framework.decorators import action
from rest_framework.response import Response

import re
from django.core.files.base import ContentFile


from .models import Product, Variant  # adjust imports
from .serializers import (
    ProductListSerializer,
    ProductDetailSerializer,
    VariantSerializer,
)
import json
from decimal import Decimal
from django.db.models import DecimalField
from django.db.models import ProtectedError

import random
import re
from django.db import transaction

from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated


# helper: base36
def _b36(n: int) -> str:
    chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    s = ""
    if n == 0: return "0"
    while n:
        n, r = divmod(n, 36)
        s = chars[r] + s
    return s

def _slug_code(s: str, max_len: int) -> str:
    s = (s or "").upper()
    s = re.sub(r"[^A-Z0-9]+", "-", s).strip("-")
    return s[:max_len] if len(s) > max_len else s

def _rand_suffix(n: int = 3) -> str:
    return _b36(random.getrandbits(20))[:n]

MAX_CODE_LEN = 12




# Build absolute URL when we only have a relative path (/media/...)
def _abs(request, url: str) -> str:
    if not url:
        return ""
    return request.build_absolute_uri(url) if url.startswith("/") else url


# --- small helper copied (kept local to avoid cross-app import hell)
def _resolve_request_tenant(request):
    t = getattr(request, "tenant", None)
    if t:
        return t
    payload = getattr(request, "auth", None)
    if isinstance(payload, dict) and payload.get("tenant_id"):
        return get_object_or_404(Tenant, id=payload["tenant_id"])
    user = getattr(request, "user", None)
    if user is not None:
        if getattr(user, "tenant", None):
            return user.tenant
        if getattr(user, "active_tenant", None):
            return user.active_tenant
    return None


# ----------------- Serializers -----------------


# Accepts either a JSON object/dict OR a JSON string; blank -> {}
class LenientJSONField(serializers.JSONField):
    def to_internal_value(self, data):
        import json as _json
        if data is None:
            return {}
        if isinstance(data, (dict, list)):
            return data
        # Strings from multipart/FormData etc.
        s = str(data).strip()
        if s in ("", "null", "undefined"):
            return {}
        try:
            return _json.loads(s)
        except Exception:
            raise serializers.ValidationError("Invalid JSON in attributes.")



class ProductListSerializer(serializers.ModelSerializer):
    # Map is_active -> active to keep frontend unchanged
    active = serializers.BooleanField(source="is_active", read_only=True)
    price_min = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    price_max = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    on_hand_sum = serializers.IntegerField(read_only=True)
    variant_count = serializers.IntegerField(read_only=True)
    cover_image = serializers.SerializerMethodField()


    def get_cover_image(self, obj):
        """
        Prefer product.image_file; else product.image_url; else None.
        Return an absolute URL when request is available.
        """
        request = self.context.get("request")

        # 1) image_file first
        try:
            if obj.image_file and obj.image_file.url:
                url = obj.image_file.url
                return request.build_absolute_uri(url) if request else url
        except Exception:
            pass

        # 2) image_url second (may already be absolute)
        if (obj.image_url or "").strip():
            url = obj.image_url
            return request.build_absolute_uri(url) if (request and url.startswith("/")) else url

        # 3) nothing
        return None
    
    class Meta:
        model = Product
        fields = [
            "id", "name", "code", "category", "active",
            "price_min", "price_max", "on_hand_sum", "variant_count",
            "cover_image",
        ]


class ProductWriteSerializer(serializers.ModelSerializer):
    # write-side mapping/validation only
    active = serializers.BooleanField(source="is_active", required=False)
    attributes = LenientJSONField(required=False, default=dict)
    tax_category = serializers.PrimaryKeyRelatedField(
        queryset=TaxCategory.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = Product
        fields = ("name", "code", "category", "description", "active", "tax_category", "attributes")

    def validate(self, attrs):
       tenant = self.context.get("tenant")
       name = (attrs.get("name") or getattr(self.instance, "name", "") or "").strip()
       code = (attrs.get("code") or getattr(self.instance, "code", "") or "").strip()

    #    if not code:
    #        raise serializers.ValidationError({"code": "Code is required."})

       # CI-unique product code within tenant
       if tenant and code:
           qs = Product.objects.filter(tenant=tenant).extra(
               where=["LOWER(code) = LOWER(%s)"], params=[code]
           )
           if self.instance:
               qs = qs.exclude(pk=self.instance.pk)
           if qs.exists():
               raise serializers.ValidationError({"code": "This code already exists within your tenant."})

       # (Optional) CI-unique product name within tenant (matches your model if enabled)
       if tenant and name:
           qs_name = Product.objects.filter(tenant=tenant).extra(
               where=["LOWER(name) = LOWER(%s)"], params=[name]
           )
           if self.instance:
               qs_name = qs_name.exclude(pk=self.instance.pk)
           if qs_name.exists():
               raise serializers.ValidationError({"name": "A product with this name already exists in your tenant."})

       return attrs

    def create(self, validated_data):
        tenant = self.context.get("tenant")
        if not tenant:
            raise serializers.ValidationError({"detail": "Tenant required"})
        
        # Server-side default code on create (Hybrid: slug + short suffix)
        code = (validated_data.get("code") or "").strip().upper()
        if not code:
            # leave room for "-XXX"
            base_len = max(1, MAX_CODE_LEN - 4)
            base = _slug_code(validated_data.get("name") or "PROD", base_len) or "PROD"
            for _ in range(25):
                candidate = f"{base}-{_rand_suffix(3)}"
                if not Product.objects.filter(tenant=tenant, code__iexact=candidate).exists():
                    validated_data["code"] = candidate
                    break
            else:
                raise serializers.ValidationError({"code": "Could not allocate unique product code."})
            
        # Always create/return the object (whether code was generated or provided)    
        return Product.objects.create(tenant=tenant, **validated_data)

    def update(self, instance, validated_data):
        # simple mass-assign
        for k, v in validated_data.items():
            setattr(instance, k, v)
        instance.save()
        return instance

class VariantWriteSerializer(serializers.ModelSerializer):
    # Map frontend 'active' -> model 'is_active' (optional on create)
    active = serializers.BooleanField(source="is_active", required=False)
    tax_category = serializers.PrimaryKeyRelatedField(
        queryset=TaxCategory.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = Variant
        fields = (
            "product",      # required FK
            "name",
            "sku",
            "barcode",
            "price",
            "cost",
            "margin_percentage",
            "uom",
            "tax_category",
            "active",
            "image_url",    # file handled by /api/catalog/variants/:id/image later
        )

    def validate_product(self, product):
        tenant = self.context.get("tenant")
        if tenant and getattr(product, "tenant_id", None) != tenant.id:
            raise serializers.ValidationError("Product does not belong to the current tenant.")
        return product

    def validate(self, attrs):
        tenant = self.context.get("tenant")
        product = attrs.get("product") or getattr(self.instance, "product", None)
        sku = (attrs.get("sku") or getattr(self.instance, "sku", None) or "").strip()
        if not sku and not product:
            return attrs

        # 1) product-level duplicate (SKU)
        if product and sku:
            qs = Variant.objects.filter(product=product, sku__iexact=sku)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({
                    "sku": "This SKU already exists for this product."
                })

        # 2) tenant-level duplicate (SKU)
        if tenant and sku:
            qs_tenant = Variant.objects.filter(product__tenant=tenant, sku__iexact=sku)
            if self.instance:
                qs_tenant = qs_tenant.exclude(pk=self.instance.pk)
            if qs_tenant.exists():
                conflict = qs_tenant.select_related("product").first()
                prod = getattr(conflict, "product", None)
                prod_name = getattr(prod, "name", "another product")
                prod_code = getattr(prod, "code", "")
                display = f'{prod_name} ({prod_code})' if prod_code else prod_name
                raise serializers.ValidationError({
                    "sku": f"This SKU is already used by {display} in your tenant."
                })

        # 3) product-level duplicate (Name, case-insensitive)
        name = (attrs.get("name") or getattr(self.instance, "name", None) or "").strip()
        if product and name:
            qs_name = Variant.objects.filter(product=product, name__iexact=name)
            if self.instance:
                qs_name = qs_name.exclude(pk=self.instance.pk)
            if qs_name.exists():
                raise serializers.ValidationError({
                    "name": "A variant with this name already exists for this product."
                })

        # 4) tenant-level duplicate (Barcode, case-insensitive, only if provided)
        barcode = (attrs.get("barcode") or getattr(self.instance, "barcode", None) or "").strip()
        if tenant and barcode:
            qs_bar = Variant.objects.filter(product__tenant=tenant, barcode__gt="", barcode__iexact=barcode)
            if self.instance:
                qs_bar = qs_bar.exclude(pk=self.instance.pk)
            if qs_bar.exists():
                raise serializers.ValidationError({
                    "barcode": "This barcode already exists within your tenant."
                })

        # 5) cost/margin/price reconciliation
        cost = attrs.get("cost")
        price = attrs.get("price")
        margin = attrs.get("margin_percentage")

        # fill from instance if not provided
        if cost is None and self.instance is not None:
            cost = getattr(self.instance, "cost", None)
        if price is None and self.instance is not None:
            price = getattr(self.instance, "price", None)

        # cost guard
        if cost is not None and Decimal(cost) < 0:
            raise serializers.ValidationError({"cost": "Cost cannot be negative."})

        def _quant(val, exp="0.01"):
            return Decimal(val).quantize(Decimal(exp))

        if margin is not None:
            m = Decimal(margin)
            if m < Decimal("-99") or m > Decimal("1000"):
                raise serializers.ValidationError({"margin_percentage": "Margin must be between -99% and 1000%."})
            if cost is None:
                raise serializers.ValidationError({"margin_percentage": "Cost is required to apply a margin."})
            computed_price = _quant(Decimal(cost) * (Decimal("1") + (m / Decimal("100"))))
            attrs["price"] = computed_price
            attrs["margin_percentage"] = m.quantize(Decimal("0.0001"))
        elif price is not None and cost not in (None, 0):
            # derive margin from price/cost when possible
            try:
                margin_calc = ((Decimal(price) - Decimal(cost)) / Decimal(cost)) * Decimal("100")
                attrs["margin_percentage"] = margin_calc.quantize(Decimal("0.0001"))
            except Exception:
                pass

        return attrs

    def create(self, validated_data):
        tenant = self.context.get("tenant")
        if not tenant:
            raise serializers.ValidationError({"detail": "Tenant required"})
        # return Variant.objects.create(tenant=tenant, **validated_data)
        product = validated_data.get("product")
        if not product:
            raise serializers.ValidationError({"product": "Product is required."})

            # --- SKU: Hybrid (product slug + short suffix) ---
        sku = (validated_data.get("sku") or "").strip().upper()
        if not sku:
            # source for base: product.code else product.name
            prod_slug = _slug_code((product.code or product.name or "VAR"), MAX_CODE_LEN)
            base_len = max(1, MAX_CODE_LEN - 4)
            left = (prod_slug[:base_len] or "VAR")
            # optional: 1-char hint from variant name if present
            v_hint = _slug_code(validated_data.get("name") or "", 2)[:1]
            left = (left[:max(1, base_len - len(v_hint))] + v_hint)[:base_len]
            for _ in range(25):
                candidate = f"{left}-{_rand_suffix(3)}"
                if not Variant.objects.filter(product__tenant=tenant, sku__iexact=candidate).exists():
                    validated_data["sku"] = candidate
                    break
            else:
                raise serializers.ValidationError({"sku": "Could not allocate unique SKU."})

        # --- Barcode: tenant-config toggle; only if missing ---
        barcode = (validated_data.get("barcode") or "").strip()
        if not barcode:
            btype = _tenant_barcode_type(tenant)
            for _ in range(50):
                candidate = _gen_ean13(tenant) if btype == "EAN13" else _gen_code128(tenant)
                if not Variant.objects.filter(product__tenant=tenant, barcode__iexact=candidate).exists():
                    validated_data["barcode"] = candidate
                    break
            else:
                raise serializers.ValidationError({"barcode": "Could not allocate unique barcode."})

        return Variant.objects.create(tenant=tenant, **validated_data)


class VariantMiniSerializer(serializers.ModelSerializer):
    # alias to match the frontend prop name
    active = serializers.BooleanField(source="is_active", read_only=True)
    tax_rate = serializers.SerializerMethodField()
    on_hand = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Variant
        fields = (
            "id",
            "name",
            "sku",
            "barcode",
            "price",
            "cost",
            "margin_percentage",
            "active",
            "tax_category",
            "tax_rate",
            "on_hand",
            "image_url",
            "created_at",
            "updated_at",
        )

    def get_tax_rate(self, obj):
        return str(getattr(obj.tax_category, "rate", 0) or 0)

    def get_on_hand(self, obj):
        """
        Keep types consistent: on_hand is integer for display.
        Use IntegerField outputs throughout to avoid Decimal/Integer mix errors.
        """
        ctx = self.context or {}
        store_id = ctx.get("store_id")
        tenant = ctx.get("tenant")

        qs = InventoryItem.objects.filter(variant=obj, tenant=tenant)
        if store_id:
            qs = qs.filter(store_id=store_id)

        total = qs.aggregate(
            n=Coalesce(
                Sum("on_hand", output_field=IntegerField()),
                Value(0, output_field=IntegerField()),
                output_field=IntegerField(),
            )
        )["n"]
        return int(total or 0)

    def get_image_url(self, obj):
        request = self.context.get("request")
        # 1) image_file first
        try:
            if obj.image_file and obj.image_file.url:
                return _abs(request, obj.image_file.url)
        except Exception:
            pass
        # 2) image_url second
        url = (obj.image_url or "").strip()
        return _abs(request, url)



class VariantPublicSerializer(serializers.ModelSerializer):
    active = serializers.BooleanField(source="is_active", read_only=True)
    on_hand = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Variant
        fields = ("id", "name", "sku", "barcode", "price", "cost", "margin_percentage", "on_hand", "active", "image_url", "product", "created_at", "updated_at")

    def get_on_hand(self, obj):
        # Sum inventory from InventoryItem via reverse accessor used elsewhere (inventoryitem)
        from inventory.models import InventoryItem  # local import to avoid cycles
        tenant = getattr(self.context.get("request"), "tenant", None) or self.context.get("tenant")
        qs = InventoryItem.objects.filter(variant=obj)
        if tenant:
            qs = qs.filter(tenant=tenant)
        # Make sure Sum(...) and the fallback Value(...) share the same DecimalField output,
        # and also set Coalesce(..., output_field=DecimalField) to avoid mixed-type errors.
        total = qs.aggregate(
            n=Coalesce(
                Sum("on_hand", output_field=DecimalField(max_digits=18, decimal_places=2)),
                Value(Decimal("0"), output_field=DecimalField(max_digits=18, decimal_places=2)),
                output_field=DecimalField(max_digits=18, decimal_places=2),
            )
        )["n"] or Decimal("0")

        return int(total)

    def get_image_url(self, obj):
        request = self.context.get("request")
        try:
            if obj.image_file and obj.image_file.url:
                return _abs(request, obj.image_file.url)
        except Exception:
            pass
        return _abs(request, (obj.image_url or "").strip())



class ProductDetailSerializer(serializers.ModelSerializer):
    # alias to match frontend
    active = serializers.BooleanField(source="is_active", read_only=True)

    # expose absolute URLs
    image_file = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()

    # include full variant objects (not IDs)
    # variants = VariantMiniSerializer(many=True, read_only=True)

    # include full variant objects (not IDs), ordered by vsort/vdirection
    variants = serializers.SerializerMethodField()

    # NEW: include price range + on-hand aggregates for drawer/header display
    price_min = serializers.SerializerMethodField()
    price_max = serializers.SerializerMethodField()
    on_hand_sum = serializers.SerializerMethodField()
    variant_count = serializers.SerializerMethodField()

    attributes = serializers.JSONField(read_only=True)
    tax_category = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Product
        fields = (
            "id",
            "name",
            "code",
            "category",
            "active",
            "description",
            "tax_category",
            "image_file",
            "image_url",
            "attributes",
            "created_at",
            "updated_at",
            # aggregates
            "price_min",
            "price_max",
            "on_hand_sum",
            "variant_count",
            "variants",
        )

    def get_variants(self, obj):
        """
        Server-side variant sorting for the product detail payload.
        Accepts ?vsort= name|price|on_hand|active  and ?vdirection= asc|desc.
        Always serializes through VariantMiniSerializer (no extra fields leaked).
        """
        request = self.context.get("request")
        vsort = (request.query_params.get("vsort") if request else None) or "name"
        vdir  = (request.query_params.get("vdirection") if request else None) or "asc"
        reverse = (vdir == "desc")

        # Start from the related manager (scoped to this product)
        qs = obj.variants.all()

        # For DB-sortable keys, order in the DB; for 'on_hand' we sort after serialization
        if vsort == "name":
            qs = qs.order_by(("-" if reverse else "") + "name", "id")
        elif vsort == "price":
            qs = qs.order_by(("-" if reverse else "") + "price", "id")
        elif vsort == "active":
            qs = qs.order_by(("-" if reverse else "") + "is_active", "id")
        # else: 'on_hand' → we’ll sort after serialization

        # Serialize through the existing safe serializer (no extra exposure)
        rows = VariantMiniSerializer(qs, many=True, context=self.context).data

        if vsort == "on_hand":
            # on_hand is computed; sort on the serialized numeric value
            rows.sort(key=lambda r: int(r.get("on_hand") or 0), reverse=reverse)

        return rows

    def get_image_file(self, obj):
        request = self.context.get("request")
        try:
            if obj.image_file and obj.image_file.url:
                return _abs(request, obj.image_file.url)
        except Exception:
            return ""
        return ""

    def get_image_url(self, obj):
        request = self.context.get("request")
        url = getattr(obj, "image_url", "") or ""
        return _abs(request, url)

    # --- aggregate helpers ---
    def _variant_qs(self, obj):
        return obj.variants.all()

    def get_price_min(self, obj):
        qs = self._variant_qs(obj)
        val = qs.aggregate(v=Coalesce(Min("price"), Value(0, output_field=DecimalField(max_digits=10, decimal_places=2))))["v"]
        return val or 0

    def get_price_max(self, obj):
        qs = self._variant_qs(obj)
        val = qs.aggregate(v=Coalesce(Max("price"), Value(0, output_field=DecimalField(max_digits=10, decimal_places=2))))["v"]
        return val or 0


    def get_on_hand_sum(self, obj):
        # tenant = self.context.get("title")  # typo? see below
        tenant = self.context.get("tenant")  # <-- this is the correct key you already set in get_serializer_context()
        # store_id = self.context.get("title")  # typo? see below
        store_id = self.context.get("store_id")  # <-- correct key

        qs = InventoryItem.objects.filter(variant__product=obj, tenant=tenant)
        if store_id:
            qs = qs.filter(store_id=store_id)

        total = qs.aggregate(
            v=Coalesce(
                Sum("on_hand", output_field=DecimalField(max_length=18, decimal_places=2)),
                Value(Decimal("0"), output_field=DecimalField(max_length=18, decimal_places=2)),
                output_field=DecimalField(max_length=18, decimal_places=2),
            )
        )["v"] or Decimal("0")

        return int(total)


    def get_variant_count(self, obj):
        return obj.variants.count()


    


class ProductCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ("name", "is_active", "category", "description")

    def create(self, validated_data):
        tenant = self.context["tenant"]
        return Product.objects.create(tenant=tenant, **validated_data)


class VariantUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Variant
        fields = ("sku", "barcode", "price", "tax_category", "is_active")


class TaxCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxCategory
        fields = ("id", "name", "rate")


# ----------------- Views -----------------

class CatalogProductListCreateView(ListCreateAPIView):
    """
    GET  /api/v1/catalog/products?query=&is_active=&page=&page_size=
    POST /api/v1/catalog/products   { name, is_active, category, description }
    """
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        tenant = _resolve_request_tenant(self.request)

        # Detect whether Product has a default_tax_rate column
        product_field_names = {f.name for f in Product._meta.get_fields() if hasattr(f, "name")}
        has_default_tax_rate = "default_tax_rate" in product_field_names

        qs = Product.objects.filter(tenant=tenant).annotate(
            variants_count=Count("variants")
        )

        store_id = self.request.GET.get("store_id")

        # ✅ add the same aggregates used by the router viewset
        qs = qs.annotate(
            price_min=Coalesce(
                Min("variants__price"),
                Value(0, output_field=DecimalField(max_digits=10, decimal_places=2)),
                output_field=DecimalField(max_digits=10, decimal_places=2),
            ),
            price_max=Coalesce(
                Max("variants__price"),
                Value(0, output_field=DecimalField(max_digits=10, decimal_places=2)),
                output_field=DecimalField(max_digits=10, decimal_places=2),
            ),
            # ✅ per-store on-hand if store_id present, else tenant-wide
            on_hand_sum=Coalesce(
                Sum(
                    "variants__inventoryitem__on_hand",
                    filter=Q(variants__inventoryitem__store_id=store_id) if store_id else Q(),
                    ),
                Value(0, output_field=IntegerField()),
                output_field=IntegerField(),
            ),
            variant_count=Count("variants", distinct=True),
        )

        # Always annotate default_tax_rate with a known output_field to avoid FieldError.
        if has_default_tax_rate:
            qs = qs.annotate(
                default_tax_rate=Coalesce(
                    F("default_tax_rate"),
                    Value(Decimal("0.0000"), output_field=DecimalField(max_digits=6, decimal_places=4)),
                    output_field=DecimalField(max_digits=6, decimal_places=4),
                )
            )
        else:
            # Field doesn't exist on this schema; expose as NULL with a declared output_field.
            qs = qs.annotate(
                default_tax_rate=Value(None, output_field=DecimalField(max_digits=6, decimal_places=4))
            )

        # qs = qs.order_by("name")
        # ✅ server-side sorting
        sort = (self.request.GET.get("sort") or "name").lower()
        direction = (self.request.GET.get("direction") or "asc").lower()
        # allow-listed mapping from public sort keys → concrete DB fields
        sort_map = {
            "name": "name",
            "price": "price_min",      # treat "price" as min price
            "price_min": "price_min",
            "price_max": "price_max",
            "on_hand": "on_hand_sum",
            "active": "is_active",
        }
        sort_field = sort_map.get(sort, "name")
        prefix = "" if direction != "desc" else "-"
        qs = qs.order_by(f"{prefix}{sort_field}", "id")

        q = (self.request.GET.get("query") or "").strip()
        if q:
            qs = qs.filter(name__icontains=q)

        is_active = self.request.GET.get("is_active")
        if is_active in ("true", "false", "1", "0"):
            qs = qs.filter(is_active=is_active in ("true", "1"))

        return qs

    def list(self, request, *args, **kwargs):
        page_size = int(request.GET.get("page_size") or 20)
        page = int(request.GET.get("page") or 1)
        qs = self.get_queryset()
        total = qs.count()
        start = (page - 1) * page_size
        items = qs[start:start + page_size]
        tenant = _resolve_request_tenant(request)
        data = ProductListSerializer(items, many=True, context={"request": request, "tenant": tenant}).data
        return Response({
            "count": total,
            "results": data,
            "currency": {
                "code": getattr(tenant, "resolved_currency", None) or getattr(tenant, "currency_code", "USD"),
                "symbol": getattr(tenant, "currency_symbol", None),
                "precision": getattr(tenant, "currency_precision", 2),
            },
        }, status=200)

    def create(self, request, *args, **kwargs):
        tenant = _resolve_request_tenant(request)
        payload = request.data or {}

        # Accept "" from frontend and store as None to avoid validation issues
        if payload.get("description", "") == "":
            payload = {**payload, "description": None}

        ser = ProductCreateSerializer(data=payload, context={"tenant": tenant})
        ser.is_valid(raise_exception=True)
        obj = ser.save()
        return Response({"id": obj.id}, status=201)


class CatalogProductDetailView(RetrieveUpdateDestroyAPIView):
    """
    GET    /api/v1/catalog/products/<id>
    PATCH  /api/v1/catalog/products/<id>   (name, category, is_active, description)
    DELETE /api/v1/catalog/products/<id>   (soft delete → is_active=False)
    """
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = "pk"

    def get_object(self):
        tenant = _resolve_request_tenant(self.request)
        return get_object_or_404(Product, pk=self.kwargs["pk"], tenant=tenant)

    def get(self, request, *args, **kwargs):
        store_id = request.GET.get("store_id")
        obj = self.get_object()
        ser = ProductDetailSerializer(
            obj,
            context={
                "request": request,
                "store_id": store_id,
                "tenant": _resolve_request_tenant(request),
            },
        )

        return Response(ser.data, status=200)

    def patch(self, request, *args, **kwargs):
        obj = self.get_object()
        allowed = {"name", "category", "is_active", "description"}
        data = {k: v for k, v in (request.data or {}).items() if k in allowed}
        # normalize blank description to None
        if "description" in data and (data["description"] == "" or data["description"] is None):
            data["description"] = None
        for k, v in data.items():
            setattr(obj, k, v)
        obj.save(update_fields=list(data.keys()))
        return Response({"ok": True})

    def delete(self, request, *args, **kwargs):
        obj = self.get_object()
        obj.is_active = False
        obj.save(update_fields=["is_active"])
        return Response(status=204)


class VariantDetailView(RetrieveUpdateAPIView):
    """
    PATCH /api/v1/catalog/variants/<id>   (sku, barcode, price, tax_category, is_active)
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = VariantUpdateSerializer
    lookup_field = "pk"

    def get_queryset(self):
        tenant = _resolve_request_tenant(self.request)
        return Variant.objects.filter(product__tenant=tenant)

    def patch(self, request, *args, **kwargs):
        variant = get_object_or_404(self.get_queryset(), pk=kwargs["pk"])
        ser = VariantUpdateSerializer(variant, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response({"ok": True})


class TaxCategoryListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response([], status=200)
        rows = (
            TaxCategory.objects
            .filter(tenant=tenant)
            .values("id", "name", "rate")
            .order_by("name")
        )
        data = [
            {"id": r["id"], "name": r["name"], "rate": str(r["rate"] or "0.00")}
            for r in rows
        ]
        return Response(data, status=200)


class CategoryListView(APIView):
    """
    If you have a dedicated Category model, switch to:
        from catalog.models import Category
        qs = Category.objects.filter(tenant=tenant).values("id","name").order_by("name")

    Otherwise (common in smaller schemas), we expose distinct categories
    from Product.category (a CharField) scoped to tenant.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response([], status=200)

        qs = (
            Product.objects
            .filter(tenant=tenant)
            .exclude(category__isnull=True)
            .exclude(category__exact="")
            .values_list("category", flat=True)
            .distinct()
            .order_by("category")
        )
        data = [{"id": idx + 1, "name": name} for idx, name in enumerate(qs)]
        return Response(data, status=200)


class ProductImageUploadView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser]

    def post(self, request, pk):
        tenant = _resolve_request_tenant(request)
        product = get_object_or_404(Product, pk=pk, tenant=tenant)
        file = request.FILES.get("file")
        if not file:
            return Response({"detail": "No file provided as 'file'."}, status=400)

        # Save to default storage (local dev or S3 prod)
        saved = product.image_file.save(file.name, file, save=True)
        # Build a URL that works on both FS and S3
        try:
            url = product.image_file.url
        except Exception:
            if isinstance(default_storage, FileSystemStorage):
                url = request.build_absolute_uri(settings.MEDIA_URL.rstrip("/") + "/" + saved.lstrip("/"))
            else:
                url = default_storage.url(saved)

        # Also keep image_url in sync (optional but convenient)
        if url and url != (product.image_url or ""):
            product.image_url = url
            product.save(update_fields=["image_url"])

        return Response({"image_url": url}, status=200)


class VariantImageUploadView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser]

    def post(self, request, pk):
        tenant = _resolve_request_tenant(request)
        variant = get_object_or_404(Variant, pk=pk, product__tenant=tenant)
        file = request.FILES.get("file")
        if not file:
            return Response({"detail": "No file provided as 'file'."}, status=400)

        # Save under media/tenants/<tenant_code>/variants/<ProductName>_<VariantName>.<ext>
        tenant_code = getattr(tenant, "code", None) or getattr(tenant, "slug", None) or f"t{tenant.id}"

        # sanitize product and variant names for filesystem
        product_name = re.sub(r"[^A-Za-z0-9_-]+", "_", variant.product.name.strip())[:50]
        variant_name = re.sub(r"[^A-Za-z0-9_-]+", "_", variant.name.strip())[:50]

        # get extension from the original file (fallback .jpg)
        ext = os.path.splitext(file.name)[1] or ".jpg"
        safe_name = f"{product_name}_{variant_name}{ext}"

        rel_path = f"tenants/{tenant_code}/variants/{safe_name}"

        saved = default_storage.save(rel_path, file)

        # persist on the model
        variant.image_file.name = saved
        variant.save(update_fields=["image_file"])

        # Build a URL that works on FS and S3
        try:
            url = variant.image_file.url
        except Exception:
            if isinstance(default_storage, FileSystemStorage):
                url = request.build_absolute_uri(
                    settings.MEDIA_URL.rstrip("/") + "/" + saved.lstrip("/")
                )
            else:
                url = default_storage.url(saved)

        if url and url != (variant.image_url or ""):
            variant.image_url = url
            variant.save(update_fields=["image_url"])


        return Response({"image_url": url}, status=200)
    


class ProductViewSet(viewsets.ModelViewSet):
    """
    GET /api/catalog/products/?search=&category=&active=
    GET /api/catalog/products/:id/
    """
    queryset = Product.objects.all().select_related()
    filter_backends = [filters.SearchFilter]
    search_fields = ["name", "code", "category", "variants__name", "variants__sku"]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser, parsers.JSONParser]  # allow files

    def get_queryset(self):
        qs = super().get_queryset().prefetch_related("variants")

        # price_min/max off Variant.price; on_hand_sum via InventoryItem through Variant
        qs = qs.annotate(
            price_min=Coalesce(
                Min("variants__price"),
                Value(0, output_field=DecimalField(max_digits=10, decimal_places=2)),
                output_field=DecimalField(max_digits=10, decimal_places=2),
            ),
            price_max=Coalesce(
                Max("variants__price"),
                Value(0, output_field=DecimalField(max_digits=10, decimal_places=2)),
                output_field=DecimalField(max_digits=10, decimal_places=2),
            ),
            on_hand_sum=Coalesce(
                Sum("variants__inventoryitem__on_hand"),
                Value(0, output_field=IntegerField()),
                output_field=IntegerField(),
            ),
            variant_count=Coalesce(Count("variants", distinct=True), Value(0, output_field=IntegerField())),
        )

        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category=category)

        active = self.request.query_params.get("active")
        if active in ("true", "false"):
            qs = qs.filter(is_active=(active == "true"))

        return qs

    def get_serializer_class(self):
        # Use the list serializer for list action so row aggregates are present
        if self.action == "list":
            return ProductListSerializer
        if self.action in ("create", "update", "partial_update"):
            return ProductWriteSerializer
        return ProductDetailSerializer


    
    def get_serializer_context(self):
        """
        Ensure tenant (and optional store_id) are available to nested serializers,
        so VariantMiniSerializer.get_on_hand can aggregate correctly.
        """
        ctx = super().get_serializer_context()
        tenant = _resolve_request_tenant(self.request)
        store_id = self.request.query_params.get("store_id")
        if tenant:
            ctx["tenant"] = tenant
        if store_id:
            ctx["store_id"] = store_id
        return ctx

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        """
        Create a product using ProductWriteSerializer (metadata only).
        Image uploads are handled separately via ProductImageUploadView.
        """
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        obj = ser.save()  # tenant injected via get_serializer_context()

        # Return detail payload for immediate UI consumption
        read_ser = ProductDetailSerializer(obj, context=self.get_serializer_context())
        return Response(read_ser.data, status=201)
    
    @transaction.atomic
    def partial_update(self, request, *args, **kwargs):
        """
        Update a product's metadata (no file handling here).
        Uses ProductWriteSerializer for validation and normalization.
        """
        obj = self.get_object()
        ser = self.get_serializer(obj, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        obj = ser.save()

        read_ser = ProductDetailSerializer(obj, context=self.get_serializer_context())
        return Response(read_ser.data)

    @action(detail=True, methods=["get"])
    def summary(self, request, pk=None):
        obj = self.get_queryset().get(pk=pk)
        return Response({
            "id": obj.pk,
            "price_min": obj.price_min,
            "price_max": obj.price_max,
            "on_hand_sum": obj.on_hand_sum,
            "variant_count": obj.variant_count,
        })
    
    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            msg = ("This product cannot be deleted because it or its variants are "
                   "referenced by existing sales/inventory records. Try deactivating it instead.")
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)


class VariantViewSet(
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.ListModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """
    GET /api/catalog/variants?product=<id>&search=
    POST/PATCH supported (multipart accepted in settings if needed)
    """
    filter_backends = [filters.SearchFilter]
    search_fields = ["name", "sku", "barcode"]

    def get_queryset(self):
        qs = Variant.objects.select_related("product")
        product_id = self.request.query_params.get("product")
        if product_id:
            qs = qs.filter(product_id=product_id)
        # (optional) also scope by tenant defensively
        tenant = _resolve_request_tenant(self.request)
        if tenant:
            qs = qs.filter(product__tenant=tenant)
        return qs

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return VariantWriteSerializer
        return VariantPublicSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        tenant = _resolve_request_tenant(self.request)
        if tenant:
            ctx["tenant"] = tenant
        return ctx

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        obj = ser.save()  # tenant injected via context
        # Return the public/read shape (with computed fields) for immediate UI use
        read_ser = VariantPublicSerializer(obj, context=self.get_serializer_context())
        return Response(read_ser.data, status=201)
    
    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError as e:
            msg = "This variant cannot be deleted because it is linked to existing sales or inventory records. Try deactivating it instead."
            return Response({"detail": msg}, status=status.HTTP_400_BAD_REQUEST)


    
class CodeGenerateView(APIView):
    """
    POST /api/catalog/codes
    Body:
      { "scope": "product", "name": "Product Name" }
      { "scope": "variant", "product_id": 123, "name": "Variant Name" }
    Returns:
      { "code": "ABC-123" }  # product code or variant sku
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        tenant = _resolve_request_tenant(request)
        scope = (request.data or {}).get("scope", "")
        name = (request.data or {}).get("name", "")
        product_id = (request.data or {}).get("product_id")

        if scope not in ("product", "variant"):
            return Response({"detail": "scope must be 'product' or 'variant'."}, status=400)

        if scope == "product":
            base = _slug_code(name, MAX_CODE_LEN)
            # ensure room for '-XXX'
            base_len = max(1, MAX_CODE_LEN - 4)
            base = _slug_code(name, base_len) or "PROD"
            # loop until unique
            for _ in range(25):
                code = f"{base}-{_rand_suffix(3)}"
                if not Product.objects.filter(tenant=tenant, code__iexact=code).exists():
                    return Response({"code": code})
            return Response({"detail": "Could not generate unique product code"}, status=409)

        else:  # variant
            if not product_id:
                return Response({"detail": "product_id is required for variant codes."}, status=400)
            product = get_object_or_404(Product, pk=product_id, tenant=tenant)
            # prefer product.code slug, else product.name slug
            prod_slug = _slug_code(product.code or product.name or "VAR", MAX_CODE_LEN)
            # reserve room for '-XXX'
            base_len = max(1, MAX_CODE_LEN - 4)
            left = (prod_slug[:base_len] or "VAR")
            # if name provided add a single char from variant name head (optional)
            v_hint = _slug_code(name, 2)[:1] if name else ""
            left = (left[:max(1, base_len - len(v_hint))] + v_hint)[:base_len]
            for _ in range(25):
                sku = f"{left}-{_rand_suffix(3)}"
                if not Variant.objects.filter(product__tenant=tenant, sku__iexact=sku).exists():
                    return Response({"code": sku})
            return Response({"detail": "Could not generate unique variant SKU"}, status=409)
        


"""
Barcode generation endpoint with tenant toggle
We’ll let tenants choose EAN13 or CODE128. If your Tenant model already has barcode_type, great; if not, we’ll default to EAN13.
"""
def _tenant_barcode_type(tenant) -> str:
    t = getattr(tenant, "barcode_type", None)
    return (t or "EAN13").upper()

def _ean13_checksum12(d12: str) -> str:
    """
    Compute the EAN-13 check digit for a 12-digit base.
    Weights: positions counted from the left (1-based)
        odd  -> weight 1
        even -> weight 3
    The check digit = (10 - (sum % 10)) % 10
    """
    if not d12.isdigit() or len(d12) != 12:
        raise ValueError("EAN-13 base must be exactly 12 digits")

    total = 0
    for i, ch in enumerate(d12, start=1):
        num = int(ch)
        total += num * (3 if i % 2 == 0 else 1)
    check = (10 - (total % 10)) % 10
    return str(check)


def _gen_ean13(tenant) -> str:
    # 12-digit base: tenant id (3 digits) + random (9 digits)
    tid = int(tenant.id) % 1000
    left = f"{tid:03d}{random.randrange(0, 10**9):09d}"
    chk = _ean13_checksum12(left)
    return left + chk

def _gen_code128(tenant) -> str:
    # 12-char base36-ish alnum
    return (_b36(random.getrandbits(64)) + _b36(random.getrandbits(64)))[:12]

class BarcodeGenerateView(APIView):
    """
    POST /api/catalog/barcodes
    Body: {} or {"type":"EAN13"|"CODE128"}
    Returns: { "barcode": "...", "type": "EAN13" }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        tenant = _resolve_request_tenant(request)
        req_type = (request.data or {}).get("type")
        btype = (req_type or _tenant_barcode_type(tenant)).upper()
        if btype not in ("EAN13", "CODE128"):
            return Response({"detail": "Unsupported barcode type."}, status=400)

        # loop for uniqueness within tenant
        for _ in range(50):
            code = _gen_ean13(tenant) if btype == "EAN13" else _gen_code128(tenant)
            if not Variant.objects.filter(product__tenant=tenant, barcode__iexact=code).exists():
                return Response({"barcode": code, "type": btype})
        return Response({"detail": "Could not allocate unique barcode"}, status=409)
