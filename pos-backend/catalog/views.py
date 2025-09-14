# from django.shortcuts import render
# from rest_framework import viewsets, permissions, filters
# from .models import Product, Variant, TaxCategory
# from .serializers import ProductSerializer, VariantSerializer, TaxCategorySerializer
#
#
# class TenantPermission(permissions.BasePermission):
#     def has_object_permission(self, request, view, obj):
#         t = getattr(obj, "tenant", None) or getattr(getattr(obj, "product", None), "tenant", None)
#         return (not t) or (hasattr(request, "tenant") and t == request.tenant)
#
#
# class ProductViewSet(viewsets.ModelViewSet):
#     queryset = Product.objects.all().order_by("id")
#     serializer_class = ProductSerializer
#     filter_backends = [filters.SearchFilter]
#     search_fields = ["name","category","attributes"]
#
#     def get_queryset(self):
#         return super().get_queryset().filter(tenant=self.request.tenant)
#
#
# class VariantViewSet(viewsets.ModelViewSet):
#     queryset = Variant.objects.all()
#     serializer_class = VariantSerializer
#
#     def get_queryset(self):
#         return super().get_queryset().filter(product__tenant=self.request.tenant)
#
#
# class TaxCategoryViewSet(viewsets.ModelViewSet):
#     queryset = TaxCategory.objects.all()
#     serializer_class = TaxCategorySerializer
#
#     def get_queryset(self):
#         return super().get_queryset().filter(tenant=self.request.tenant)


# catalog/views.py
from rest_framework import viewsets
from common.api_mixins import TenantScopedViewSetMixin, IsInTenant, RoleRequired
from common.roles import TenantRole
from .models import Product, Variant, TaxCategory
from .serializers import ProductSerializer, VariantSerializer, TaxCategorySerializer


class ProductViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    permission_classes = [IsInTenant, RoleRequired]
    permission_roles = { "POST": [TenantRole.MANAGER, TenantRole.ADMIN],
                         "DELETE": [TenantRole.ADMIN, TenantRole.OWNER] }
    tenant_field = "tenant"


class VariantViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    queryset = Variant.objects.select_related("product")
    serializer_class = VariantSerializer
    permission_classes = [IsInTenant]
    tenant_path = "product__tenant"


class TaxCategoryViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    queryset = TaxCategory.objects.all()
    serializer_class = TaxCategorySerializer
    permission_classes = [IsInTenant, RoleRequired]
    permission_roles = { "POST": [TenantRole.ADMIN], "DELETE": [TenantRole.ADMIN, TenantRole.OWNER] }
    tenant_field = "tenant"
