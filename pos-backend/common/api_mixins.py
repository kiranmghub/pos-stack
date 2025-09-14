from rest_framework.permissions import BasePermission, SAFE_METHODS
from common.roles import TenantRole


class IsOwner(BasePermission):
    def has_permission(self, request, view):
        if request.user.is_superuser:
            return True
        m = request.user.tenant_memberships.filter(tenant=request.tenant, is_active=True).first()
        return bool(m and m.role == TenantRole.OWNER)


class IsInTenant(BasePermission):
    def has_permission(self, request, view):
        u = getattr(request, "user", None)
        t = getattr(request, "tenant", None)
        if not (u and u.is_authenticated):
            return False
        if u.is_superuser or t is None:
            return True
        return u.tenant_memberships.filter(tenant=t, is_active=True).exists()


class RoleRequired(BasePermission):
    """
    Viewset can define:
      permission_roles = { "POST": [TenantRole.ADMIN, ...], "DELETE": [TenantRole.OWNER] }
    If method not in dict → allowed (subject to IsInTenant).
    """
    def has_permission(self, request, view):
        if request.user.is_superuser:
            return True
        roles_map = getattr(view, "permission_roles", {})
        needed = roles_map.get(request.method, [])
        if not needed:
            return True
        membership = request.user.tenant_memberships.filter(tenant=request.tenant, is_active=True).first()
        return bool(membership and membership.role in needed)


class TenantScopedViewSetMixin:
    """
    Auto-filters by tenant and sets tenant on create.
    For models with a direct FK: set tenant_field = "tenant"
    For models linked via store: set tenant_field=None, tenant_path="store__tenant"
    """
    tenant_field = "tenant"
    tenant_path  = None

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.is_superuser:
            return qs
        t = self.request.tenant
        if self.tenant_field:
            return qs.filter(**{self.tenant_field: t})
        elif self.tenant_path:
            return qs.filter(**{self.tenant_path: t})
        return qs

    def perform_create(self, serializer):
        if self.tenant_field:
            serializer.save(**{self.tenant_field: self.request.tenant})
        else:
            serializer.save()
