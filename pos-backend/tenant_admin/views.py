# pos-backend/tenant_admin/views.py

from django.shortcuts import render, get_object_or_404
from rest_framework import viewsets, mixins
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser
from django.core.files.storage import default_storage
from django.core.files.storage.filesystem import FileSystemStorage
from django.conf import settings

from tenants.models import TenantUser, Tenant
from stores.models import Store, Register
from catalog.models import TaxCategory
from taxes.models import TaxRule
from discounts.models import DiscountRule, Coupon

from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from common.roles import TenantRole
from rest_framework.decorators import action
from rest_framework import status
from common.permissions import IsOwnerOrAdmin


from .serializers import (
    TenantUserSerializer,
    StoreSerializer,
    RegisterSerializer,
    TaxCategorySerializer,
    TaxRuleSerializer,
    DiscountRuleSerializer,
    CouponSerializer,
)
from .permissions import IsTenantAdmin




# ---------- helpers ----------
class TenantScopedMixin:
    """Filter base queryset by request.tenant where applicable."""
    def get_queryset(self):
        qs = super().get_queryset()
        tenant = getattr(self.request, "tenant", None)
        if tenant is None:
            return qs.none()
        # models with 'tenant' field
        if hasattr(qs.model, "tenant"):
            return qs.filter(tenant=tenant)
        # Register: join via store.tenant
        if qs.model is Register:
            return qs.filter(tenant=tenant)
        # Ensure stable default ordering for paginated lists
        if qs.model.__name__ == "TenantUser":
            qs = qs.order_by("id")
        return qs

    def perform_create(self, serializer):
        # auto-inject tenant on create, when a 'tenant' field exists
        if "tenant" in serializer.fields:
            serializer.save(tenant=getattr(self.request, "tenant", None))
        else:
            serializer.save()

# ---------- ViewSets ----------
class TenantUserViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    queryset = TenantUser.objects.select_related("tenant", "user").prefetch_related("stores")
    serializer_class = TenantUserSerializer
    permission_classes = [IsAuthenticated, IsTenantAdmin]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["role", "is_active", "stores"]
    search_fields = ["user__username", "user__email", "user__first_name", "user__last_name"]
    ordering = ["id"]
    ordering_fields = ["id", "role", "is_active"]

    def perform_create(self, serializer):
        """
        Override TenantScopedMixin to avoid passing tenant twice.
        TenantUserSerializer.create() already sets tenant internally.
        """
        serializer.save()
    

class StoreViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    queryset = Store.objects.all()
    serializer_class = StoreSerializer
    permission_classes = [IsAuthenticated, IsTenantAdmin]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["is_active", "code"]
    search_fields = ["code", "name"]
    ordering_fields = ["id", "code", "name", "is_active"]

    # def perform_create(self, serializer):
    #     # Let the serializer read tenant from self.context["request"].tenant -- Previous Comment
    #     # ✅ inject tenant explicitly
    #     serializer.save(tenant=getattr(self.request, "tenant", None))
    #     serializer.save()

    def perform_update(self, serializer):
        serializer.save()



class RegisterViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    queryset = Register.objects.select_related("store")
    serializer_class = RegisterSerializer
    permission_classes = [IsAuthenticated, IsTenantAdmin]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["store", "is_active"]
    search_fields = ["code", "store__code", "store__name"]
    ordering_fields = ["id", "code", "is_active"]

    def perform_update(self, serializer):
        serializer.save()

    @action(detail=True, methods=["POST"], url_path="set-pin")
    def set_pin(self, request, pk=None):
        """
        POST /api/v1/tenant-admin/registers/{id}/set-pin
        Body: {"pin": "123456"} to set; {"pin": ""} or no 'pin' to clear.
        """
        reg: Register = self.get_object()
        pin = (request.data.get("pin") or "").strip()
        if pin:
            reg.set_pin(pin)   # uses your model helper
        else:
            reg.set_pin(None)  # clear
        reg.save(update_fields=["access_pin_hash", "updated_at"])
        return Response({"ok": True}, status=status.HTTP_200_OK)    


class TaxCategoryViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    queryset = TaxCategory.objects.all()
    serializer_class = TaxCategorySerializer
    permission_classes = [IsAuthenticated, IsTenantAdmin]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["code", "name"]
    search_fields = ["code", "name", "description"]
    ordering_fields = ["id", "code", "name", "rate", "description"]

    def perform_update(self, serializer):
        serializer.save()


class TaxRuleViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    queryset = TaxRule.objects.select_related("tenant", "store").prefetch_related("categories")
    serializer_class = TaxRuleSerializer
    permission_classes = [IsAuthenticated, IsTenantAdmin]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["is_active", "scope", "apply_scope", "basis", "store", "priority"]
    search_fields = ["code", "name", "categories__code"]
    ordering_fields = ["priority", "code", "name", "start_at", "end_at"]

class DiscountRuleViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    queryset = DiscountRule.objects.select_related("tenant", "store").prefetch_related(
        "categories", "products", "variants"
    )
    serializer_class = DiscountRuleSerializer
    permission_classes = [IsAuthenticated, IsTenantAdmin]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["is_active", "scope", "apply_scope", "basis", "target", "store", "stackable", "priority"]
    search_fields = ["code", "name", "description", "categories__code", "products__name", "variants__sku"]
    ordering_fields = ["priority", "code", "name", "description", "start_at", "end_at"]

    def get_queryset(self):
        qs = super().get_queryset()
        from django.db.models import Exists, OuterRef
        qs = qs.annotate(has_coupon=Exists(
            Coupon.objects.filter(rule_id=OuterRef("id"))
        ))
        return qs

    def perform_update(self, serializer):
        serializer.save()


class CouponViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    queryset = Coupon.objects.select_related("tenant", "rule")
    serializer_class = CouponSerializer
    permission_classes = [IsAuthenticated, IsTenantAdmin]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["is_active", "rule", "start_at", "end_at"]
    search_fields = ["code", "name", "description", "rule__name", "rule__code"]
    ordering_fields = ["code", "name", "description", "max_uses", "used_count", "start_at", "end_at"]

    def perform_update(self, serializer):
        serializer.save()





@api_view(["GET"])
@permission_classes([IsAuthenticated, IsTenantAdmin])
def tenant_roles(request):
    """
    GET /api/v1/tenant-admin/roles/tenant
    Returns [{"value":"owner","label":"Owner"}, ...]
    """
    data = [{"value": c.value, "label": c.label} for c in TenantRole]
    return Response({"ok": True, "roles": data})


class TenantDetailView(APIView):
    """
    GET /api/v1/tenant_admin/tenant
    Returns tenant details including name, logo_url, logo_file URL, etc.
    Permission: IsOwnerOrAdmin (owners and admins only)
    """
    permission_classes = [IsAuthenticated, IsOwnerOrAdmin]

    def get(self, request):
        tenant = request.tenant
        if not tenant:
            return Response({"detail": "Tenant not found"}, status=status.HTTP_404_NOT_FOUND)

        # Build logo URL if logo_file exists
        logo_file_url = None
        if tenant.logo_file and tenant.logo_file.name:
            try:
                url = tenant.logo_file.url
                # Convert relative URLs to absolute
                if url and url.startswith("/"):
                    logo_file_url = request.build_absolute_uri(url)
                else:
                    logo_file_url = url
            except Exception:
                # Fallback for local filesystem
                if isinstance(default_storage, FileSystemStorage):
                    try:
                        relative_path = settings.MEDIA_URL.rstrip("/") + "/" + tenant.logo_file.name.lstrip("/")
                        logo_file_url = request.build_absolute_uri(relative_path)
                    except Exception:
                        pass
                else:
                    try:
                        url = default_storage.url(tenant.logo_file.name)
                        # Convert relative URLs to absolute
                        if url and url.startswith("/"):
                            logo_file_url = request.build_absolute_uri(url)
                        else:
                            logo_file_url = url
                    except Exception:
                        pass

        # Convert logo_url to absolute if it's relative
        logo_url_absolute = None
        if tenant.logo_url:
            if tenant.logo_url.startswith("/"):
                logo_url_absolute = request.build_absolute_uri(tenant.logo_url)
            else:
                logo_url_absolute = tenant.logo_url

        return Response({
            "id": tenant.id,
            "name": tenant.name,
            "code": tenant.code,
            "logo_url": logo_url_absolute,
            "logo_file_url": logo_file_url,
            "email": tenant.email,
            "business_phone": tenant.business_phone,
            "description": tenant.description,
            "currency_code": tenant.currency_code,
            "currency_symbol": tenant.currency_symbol,
            "country_code": tenant.country_code or tenant.business_country_code,
        })


class TenantLogoUploadView(APIView):
    """
    POST /api/v1/tenant_admin/tenant/logo
    Upload a logo file for the tenant.
    Permission: IsOwnerOrAdmin (owners and admins only)
    """
    permission_classes = [IsAuthenticated, IsOwnerOrAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        tenant = request.tenant
        if not tenant:
            return Response({"detail": "Tenant not found"}, status=status.HTTP_404_NOT_FOUND)

        file = request.FILES.get("file")
        if not file:
            return Response({"detail": "No file provided as 'file'."}, status=status.HTTP_400_BAD_REQUEST)

        # Save to default storage (local dev or S3 prod)
        tenant.logo_file.save(file.name, file, save=False)
        tenant.save(update_fields=["logo_file"])

        # Refresh tenant from database to get updated logo_file
        tenant.refresh_from_db()

        # Build a URL that works on both FS and S3
        url = None
        if tenant.logo_file and tenant.logo_file.name:
            try:
                url = tenant.logo_file.url
                # Convert relative URLs to absolute
                if url and url.startswith("/"):
                    url = request.build_absolute_uri(url)
            except Exception:
                # Fallback for local filesystem
                if isinstance(default_storage, FileSystemStorage):
                    try:
                        relative_path = settings.MEDIA_URL.rstrip("/") + "/" + tenant.logo_file.name.lstrip("/")
                        url = request.build_absolute_uri(relative_path)
                    except Exception:
                        pass
                else:
                    try:
                        url = default_storage.url(tenant.logo_file.name)
                        # Convert relative URLs to absolute
                        if url and url.startswith("/"):
                            url = request.build_absolute_uri(url)
                    except Exception:
                        pass

        # Also keep logo_url in sync (optional but convenient)
        if url and url != (tenant.logo_url or ""):
            tenant.logo_url = url
            tenant.save(update_fields=["logo_url"])

        if not url:
            return Response({"detail": "Failed to generate logo URL"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({"image_url": url, "logo_file_url": url}, status=status.HTTP_200_OK)