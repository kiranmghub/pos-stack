# common/permissions.py
from rest_framework import permissions
from common.roles import TenantRole
from tenants.models import TenantUser

def user_role_for_tenant(user, tenant):
    if not (user and tenant):
        return None
    try:
        return TenantUser.objects.filter(user=user, tenant=tenant).values_list("role", flat=True).first()
    except Exception:
        return None

class IsOwnerOrAdmin(permissions.BasePermission):
    """
    Allows access only to users who are OWNER or ADMIN for the request.tenant.
    Assumes middleware has set request.tenant.
    """
    def has_permission(self, request, view):
        tenant = getattr(request, "tenant", None)
        if not (request.user and request.user.is_authenticated and tenant):
            return False
        role = user_role_for_tenant(request.user, tenant)
        return role in {TenantRole.OWNER, TenantRole.ADMIN}
