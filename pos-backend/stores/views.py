from django.shortcuts import render

# Create your views here.
from rest_framework import viewsets
from common.api_mixins import TenantScopedViewSetMixin, IsInTenant, RoleRequired
from common.roles import TenantRole
from .models import Store, Register
from .serializers import StoreSerializer, RegisterSerializer, StoreMiniSerializer
from django.db.models import QuerySet
from rest_framework import viewsets, permissions


class StoreViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    """
    Direct tenant FK → filter on `tenant`.
    """
    queryset = Store.objects.select_related("tenant")
    serializer_class = StoreSerializer
    permission_classes = [IsInTenant, RoleRequired]
    permission_roles = { "POST": [TenantRole.MANAGER, TenantRole.ADMIN],
                         "DELETE": [TenantRole.ADMIN, TenantRole.OWNER] }
    tenant_field = "tenant"   # auto-filters by request.tenant; sets on create


class RegisterViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
    """
    Register links to tenant via store → filter on `store__tenant`.
    """
    queryset = Register.objects.select_related("store", "store__tenant")
    serializer_class = RegisterSerializer
    permission_classes = [IsInTenant, RoleRequired]
    permission_roles = { "POST": [TenantRole.MANAGER, TenantRole.ADMIN],
                         "DELETE": [TenantRole.ADMIN, TenantRole.OWNER] }
    tenant_field = None
    tenant_path  = "store__tenant"  # auto-filters by request.tenant



class StoreLiteViewSet(TenantScopedViewSetMixin, viewsets.ReadOnlyModelViewSet):

    serializer_class = StoreMiniSerializer
    permission_classes = [IsInTenant]
    tenant_field = "tenant"

    def get_queryset(self) -> QuerySet:
        qs = Store.objects.select_related("tenant").filter(is_active=True).order_by("name")
        return qs.order_by("name")
