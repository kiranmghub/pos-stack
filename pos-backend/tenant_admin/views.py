# pos-backend/tenant_admin/views.py

from django.shortcuts import render
from rest_framework import viewsets, mixins
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from tenants.models import TenantUser
from stores.models import Store, Register
from catalog.models import TaxCategory
from taxes.models import TaxRule
from discounts.models import DiscountRule, Coupon

from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from common.roles import TenantRole
from rest_framework.decorators import action
from rest_framework import status


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
            return qs.filter(store__tenant=tenant)
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
    search_fields = ["code", "name"]
    ordering_fields = ["id", "code", "name", "rate"]

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
    search_fields = ["code", "name", "categories__code", "products__name", "variants__sku"]
    ordering_fields = ["priority", "code", "name", "start_at", "end_at"]

    def perform_update(self, serializer):
        serializer.save()


class CouponViewSet(TenantScopedMixin, viewsets.ModelViewSet):
    queryset = Coupon.objects.select_related("tenant", "rule")
    serializer_class = CouponSerializer
    permission_classes = [IsAuthenticated, IsTenantAdmin]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["is_active", "rule", "start_at", "end_at"]
    search_fields = ["code", "name", "rule__name", "rule__code"]
    ordering_fields = ["code", "name", "max_uses", "used_count", "start_at", "end_at"]

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