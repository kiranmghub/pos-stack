from django.shortcuts import render

# Create your views here.
from common.api_mixins import TenantScopedViewSetMixin, IsInTenant, RoleRequired
from common.roles import TenantRole
from .models import Store, Register
from .serializers import StoreSerializer, RegisterSerializer, StoreMiniSerializer
from django.db.models import QuerySet
from rest_framework import viewsets, permissions
from rest_framework.response import Response


# If you already have this helper in a common place, import and reuse it.
# Here’s a safe local resolver mirroring your catalog pattern.
def _resolve_request_tenant(request):
    t = getattr(request, "tenant", None)
    if t:
        return t
    payload = getattr(request, "auth", None)
    if isinstance(payload, dict) and payload.get("tenant_id"):
        from tenants.models import Tenant
        from django.shortcuts import get_object_or_404
        return get_object_or_404(Tenant, id=payload["tenant_id"])
    user = getattr(request, "user", None)
    if user is not None:
        if getattr(user, "tenant", None):
            return user.tenant
        if getattr(user, "active_tenant", None):
            return user.active_tenant
    return None

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



class StoreLiteViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Tenant-scoped, read-only list of lightweight store rows for dropdowns.
    """
    serializer_class = StoreMiniSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self) -> QuerySet:
        tenant = _resolve_request_tenant(self.request)
        # Return no rows if tenant can't be resolved (defensive)
        if not tenant:
            return Store.objects.none()
        # Explicit tenant scoping + active filter, ordered for UX
        return (
            Store.objects
            .filter(tenant=tenant, is_active=True)
            .only("id", "code", "name", "is_active")  # keep lean
            .order_by("name", "id")
        )