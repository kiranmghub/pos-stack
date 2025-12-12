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


class IsOwnerOrAdmin(BasePermission):
    """
    Allow only Owners and Admins to access resources (stricter than IsTenantAdmin).
    Used for sensitive resources like documents that should not be accessible to Managers.
    """
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        
        tenant = getattr(request, "tenant", None)
        if not tenant:
            return False
        
        membership = request.user.tenant_memberships.filter(
            tenant=tenant,
            is_active=True
        ).first()
        
        if not membership:
            return False
        
        # Only OWNER and ADMIN roles allowed (not MANAGER, CASHIER, etc.)
        role_upper = str(membership.role).upper()
        return role_upper in ("OWNER", "ADMIN")
