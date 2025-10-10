# pos-backend/tenant_admin/permissions.py
from rest_framework.permissions import BasePermission

class IsTenantAdmin(BasePermission):
    """
    Allow only tenant owners/admins to manage tenant resources.
    Assumes request.tenant is set by middleware and request.user membership exists.
    """
    def has_permission(self, request, view):
        tu = getattr(request.user, "tenant_memberships", None)
        if tu is None:  # no memberships relation
            return False
        # a simple role gate; adapt to your exact role choices
        for m in tu.filter(tenant=request.tenant, is_active=True):
            if str(getattr(m, "role", "")).lower() in ("owner", "admin", "manager"):
                return True
        return False
