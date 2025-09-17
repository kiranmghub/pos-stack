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
