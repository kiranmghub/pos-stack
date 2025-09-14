# catalog/api.py
from decimal import Decimal
from django.db.models import Sum, Count, F, Value, IntegerField, DecimalField, CharField
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.generics import ListCreateAPIView, RetrieveUpdateDestroyAPIView, RetrieveUpdateAPIView
from rest_framework.response import Response
from rest_framework import permissions, status, serializers
from django.db import transaction

from tenants.models import Tenant
from tenants.models import TenantUser
from stores.models import Store
from catalog.models import Product, Variant, TaxCategory
from inventory.models import InventoryItem
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

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

class ProductListSerializer(serializers.ModelSerializer):
    variants_count = serializers.IntegerField(read_only=True)
    # allow_null=True so we can return None when the field doesn't exist on the model
    default_tax_rate = serializers.DecimalField(
        max_digits=6, decimal_places=4, required=False, read_only=True, allow_null=True
    )

    class Meta:
        model = Product
        fields = ("id", "name", "is_active", "category", "variants_count", "default_tax_rate", "created_at")


class VariantMiniSerializer(serializers.ModelSerializer):
    tax_rate = serializers.SerializerMethodField()
    on_hand = serializers.SerializerMethodField()

    class Meta:
        model = Variant
        fields = ("id", "sku", "barcode", "price", "is_active", "tax_category", "tax_rate", "on_hand")

    def get_tax_rate(self, obj):
        return str(getattr(obj.tax_category, "rate", 0) or 0)

    def get_on_hand(self, obj):
        ctx = self.context or {}
        store_id = ctx.get("store_id")
        tenant = ctx.get("tenant")
        qs = InventoryItem.objects.filter(variant=obj, tenant=tenant)
        if store_id:
            qs = qs.filter(store_id=store_id)
        total = qs.aggregate(n=Coalesce(Sum("on_hand"), Value(0)))["n"]
        return int(total or 0)


class ProductDetailSerializer(serializers.ModelSerializer):
    variants = VariantMiniSerializer(many=True, read_only=True)

    class Meta:
        model = Product
        fields = ("id", "name", "is_active", "category", "description", "variants")


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
            variants_count=Count("variant")
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

        qs = qs.order_by("name")

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
        data = ProductListSerializer(items, many=True).data
        return Response({"count": total, "results": data}, status=200)

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
        ser = ProductDetailSerializer(obj, context={"store_id": store_id, "tenant": _resolve_request_tenant(request)})
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
