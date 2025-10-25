# pos-backend/catalog/api.py
from decimal import Decimal
from django.db.models import Sum, Count, F, Value, IntegerField, DecimalField, CharField
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from rest_framework.generics import ListCreateAPIView, RetrieveUpdateDestroyAPIView, RetrieveUpdateAPIView
from rest_framework import permissions, status, serializers, parsers
from django.db import transaction

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

from .models import Product, Variant  # adjust imports
from .serializers import (
    ProductListSerializer,
    ProductDetailSerializer,
    VariantSerializer,
)


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

class ProductListSerializer(serializers.ModelSerializer):
    variants_count = serializers.IntegerField(read_only=True)
    # allow_null=True so we can return None when the field doesn't exist on the model
    default_tax_rate = serializers.DecimalField(
        max_digits=6, decimal_places=4, required=False, read_only=True, allow_null=True
    )
    representative_image_url = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = ("id", "name", "is_active", "category", "variants_count", "default_tax_rate", "created_at", "image_url", "representative_image_url",)

    def get_representative_image_url(self, obj):
        request = self.context.get("request")
        if hasattr(obj, "representative_image_url"):
            return _abs(request, obj.representative_image_url() or "")
        if getattr(obj, "image_url", ""):
            return _abs(request, obj.image_url)
        v = obj.variants.exclude(image_url__isnull=True).exclude(image_url="").order_by("id").first()
        return _abs(request, getattr(v, "image_url", "") if v else "")

    def get_image_url(self, obj):
        request = self.context.get("request")
        # File first, then URL
        try:
            if obj.image_file and obj.image_file.url:
                return _abs(request, obj.image_file.url)
        except Exception:
            pass
        return _abs(request, obj.image_url or "")


class VariantMiniSerializer(serializers.ModelSerializer):
    tax_rate = serializers.SerializerMethodField()
    on_hand = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Variant
        fields = ("id", "sku", "barcode", "price", "is_active", "tax_category", "tax_rate", "on_hand", "image_url")

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

    def get_image_url(self, obj):
        request = self.context.get("request")
        url = getattr(obj, "effective_image_url", None) or getattr(obj, "image_url", "") or ""
        return _abs(request, url)


class ProductDetailSerializer(serializers.ModelSerializer):
    variants = VariantMiniSerializer(many=True, read_only=True)
    representative_image_url = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = ("id", "name", "is_active", "category", "description", "image_url", "representative_image_url", "variants",)

    def get_representative_image_url(self, obj):
        request = self.context.get("request")
        if hasattr(obj, "representative_image_url"):
            return _abs(request, obj.representative_image_url() or "")
        if getattr(obj, "image_url", ""):
            return _abs(request, obj.image_url)
        v = obj.variants.exclude(image_url__isnull=True).exclude(image_url="").order_by("id").first()
        return _abs(request, getattr(v, "image_url", "") if v else "")

    def get_image_url(self, obj):
        request = self.context.get("request")
        try:
            if obj.image_file and obj.image_file.url:
                return _abs(request, obj.image_file.url)
        except Exception:
            pass
        return _abs(request, obj.image_url or "")



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
        data = ProductListSerializer(items, many=True, context={"request": request}).data
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

        saved = variant.image_file.save(file.name, file, save=True)
        try:
            url = variant.image_file.url
        except Exception:
            if isinstance(default_storage, FileSystemStorage):
                url = request.build_absolute_uri(settings.MEDIA_URL.rstrip("/") + "/" + saved.lstrip("/"))
            else:
                url = default_storage.url(saved)

        if url and url != (variant.image_url or ""):
            variant.image_url = url
            variant.save(update_fields=["image_url"])

        return Response({"image_url": url}, status=200)
    



class ProductViewSet(viewsets.ModelViewSet):
    """
    Endpoints:
      - list: GET /catalog/products?search=&category=&active=
      - retrieve: GET /catalog/products/:id
      - create/update/partial_update
      - /:id/variants (list/create via VariantViewSet or custom route if preferred)
    """
    queryset = Product.objects.all().select_related().prefetch_related("variants")
    filter_backends = [filters.SearchFilter]
    search_fields = ["name", "code", "category", "variants__name", "variants__sku"]

    def get_queryset(self):
        qs = super().get_queryset()

        # Annotate aggregates from Variant
        # Adjust field names if your Variant model differs.
        qs = qs.annotate(
            price_min=Coalesce(Min("variants__price"), 0),
            price_max=Coalesce(Max("variants__price"), 0),
            on_hand_sum=Coalesce(Sum("variants__on_hand"), 0),
            variant_count=Coalesce(Count("variants", distinct=True), 0),
        )

        # For cover image fallback, pull first variant per product (optional)
        first_variant_sq = Variant.objects.filter(product=OuterRef("pk")).order_by("id").values("pk")[:1]
        qs = qs.annotate(first_variant=Subquery(first_variant_sq))

        # Filters
        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category=category)

        active = self.request.query_params.get("active")
        if active in ("true", "false"):
            qs = qs.filter(active=(active == "true"))

        return qs

    def get_serializer_class(self):
        if self.action == "list":
            return ProductListSerializer
        return ProductDetailSerializer

    @action(detail=True, methods=["get"])
    def summary(self, request, pk=None):
        """Small summary payload if the table wants to lazy-load aggregates."""
        obj = self.get_queryset().get(pk=pk)
        data = {
            "id": obj.pk,
            "price_min": obj.price_min,
            "price_max": obj.price_max,
            "on_hand_sum": obj.on_hand_sum,
            "variant_count": obj.variant_count,
        }
        return Response(data)


class VariantViewSet(
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """
    Endpoints:
      - list: GET /catalog/variants?product=<id>&search=
      - retrieve: GET /catalog/variants/:id
      - create: POST /catalog/variants
      - update/partial_update
    """
    serializer_class = VariantSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["name", "sku", "barcode"]

    def get_queryset(self):
        qs = Variant.objects.select_related("product")
        product_id = self.request.query_params.get("product")
        if product_id:
            qs = qs.filter(product_id=product_id)
        return qs

