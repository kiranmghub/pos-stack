from django.shortcuts import render

# Create your views here.
# orders/views.py

# class SaleViewSet(TenantScopedViewSetMixin, viewsets.ModelViewSet):
#     queryset = Sale.objects.select_related("store", "register", "customer")
#     serializer_class = SaleSerializer
#     permission_classes = [IsInTenant, RoleRequired]
#     permission_roles = { "POST": [TenantRole.CASHIER, TenantRole.MANAGER, TenantRole.ADMIN] }
#     tenant_field = None
#     tenant_path  = "store__tenant"

# orders/views.py (add)
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from common.api_mixins import IsInTenant
from .models import Sale
from rest_framework.generics import ListAPIView
from .serializers import RecentSaleSerializer
from django.shortcuts import get_object_or_404
from tenants.models import Tenant


# class RecentSalesView(APIView):
#     permission_classes = [IsAuthenticated, IsInTenant]
#
#     def get(self, request):
#         limit = int(request.GET.get("limit", 8))
#         qs = (Sale.objects
#               .filter(store__tenant=request.tenant)
#               .select_related("store")
#               .order_by("-created_at")[:limit])
#         out = [{
#             "id": s.id,
#             "store": s.store.name,
#             "total": float(s.total),
#             "created_at": s.created_at.isoformat(),
#             "cashier": getattr(s, "created_by", None) and getattr(s.created_by, "username", None),
#         } for s in qs]
#         return Response(out)


def _resolve_request_tenant(request):
    """
    Resolve tenant in this priority:
    1) request.tenant (set by your middleware from JWT claim)
    2) JWT payload on request.auth -> tenant_id
    3) user.tenant or user.active_tenant (if your User model/mixin sets these)
    """
    # 1) middleware
    t = getattr(request, "tenant", None)
    if t:
        return t

    # 2) JWT payload
    token_payload = getattr(request, "auth", None)
    if isinstance(token_payload, dict) and token_payload.get("tenant_id"):
        return get_object_or_404(Tenant, id=token_payload["tenant_id"])

    # 3) user helpers/fallbacks
    user = getattr(request, "user", None)
    if user is not None:
        if hasattr(user, "tenant") and getattr(user, "tenant"):
            return user.tenant
        if hasattr(user, "active_tenant") and getattr(user, "active_tenant"):
            return user.active_tenant

    return None


class RecentSalesView(ListAPIView):
    """
    GET /api/v1/orders/recent?limit=8
    Returns recent sales for the authenticated user's tenant.
    """
    serializer_class = RecentSaleSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant = _resolve_request_tenant(self.request)
        if tenant is None:
            # Never leak cross-tenant data; return empty queryset if we couldn't resolve.
            return Sale.objects.none()

        limit = int(self.request.query_params.get("limit", 8))
        return (
            Sale.objects
                .filter(store__tenant=tenant)
                .select_related("store", "cashier")   # avoids N+1 queries
                .order_by("-created_at")[:limit]
        )