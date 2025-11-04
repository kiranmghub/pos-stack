from django.shortcuts import render

# Create your views here.
from rest_framework import viewsets
from common.api_mixins import TenantScopedViewSetMixin, IsInTenant, RoleRequired
from common.roles import TenantRole
from .models import Store, Register
from .serializers import StoreSerializer, RegisterSerializer, StoreLiteSerializer
from rest_framework.response import Response
from rest_framework.decorators import action




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

    @action(detail=False, methods=["get"])
    def storeLite(self, request):
        """
        GET /api/v1/stores/storeLite
        Returns active stores for the current tenant: id, code, name, is_active.
        """
        qs = self.get_queryset().only("id", "code", "name", "is_active").order_by("code", "id")
        qs = qs.filter(is_active=True)
        data = StoreLiteSerializer(qs, many=True).data
        return Response(data)


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
