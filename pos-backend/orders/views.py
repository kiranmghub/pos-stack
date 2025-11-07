# pos-backend/orders/views.py
from django.shortcuts import render
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from common.api_mixins import IsInTenant
from .models import Sale
from rest_framework.generics import ListAPIView
from .serializers import RecentSaleSerializer
from django.shortcuts import get_object_or_404
from tenants.models import Tenant
from django.db.models import Count, Q, F, Sum, DecimalField, Value, ExpressionWrapper
from django.db.models.functions import Coalesce
from rest_framework import generics, permissions
from .serializers import SaleListSerializer, SaleDetailSerializer


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
    

class SalesListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = SaleListSerializer

    def get_queryset(self):
        tenant = _resolve_request_tenant(self.request)
        qs = Sale.objects.select_related("store", "cashier")
        if tenant:
            qs = qs.filter(tenant=tenant)

        # filters
        store_id = self.request.query_params.get("store_id")
        status = (self.request.query_params.get("status") or "").strip()  # pending/completed/void
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")
        query = (self.request.query_params.get("query") or "").strip()

        if store_id:
            qs = qs.filter(store_id=store_id)
        if status:
            qs = qs.filter(status__iexact=status)
        if date_from:
            qs = qs.filter(created_at__gte=date_from)
        if date_to:
            qs = qs.filter(created_at__lte=date_to)
        if query:
            # receipt_no, cashier name/username, product/sku inside line snapshot (best-effort)
            qs = qs.filter(
                Q(receipt_no__icontains=query) |
                Q(cashier__username__icontains=query) |
                Q(cashier__first_name__icontains=query) |
                Q(cashier__last_name__icontains=query) |
                Q(lines__sku__icontains=query) |
                Q(lines__product_name__icontains=query)
            ).distinct()

        # lightweight annotations (derive from lines)
        zero = Value(0, output_field=DecimalField(max_digits=12, decimal_places=2))
        qs = qs.annotate(
            lines_count=Coalesce(Count("lines"), 0),
            # Safe subtotal: sum(line_total + discount - tax - fee)
            subtotal=Coalesce(
                Sum(
                    F("lines__line_total")
                    + F("lines__discount")
                    - F("lines__tax")
                    - F("lines__fee"),
                    output_field=DecimalField(max_digits=12, decimal_places=2),
                ),
                zero,
            ),
            discount_total=Coalesce(Sum("lines__discount"), zero),
            tax_total=Coalesce(Sum("lines__tax"), zero),
            fee_total=Coalesce(Sum("lines__fee"), zero),
            total=Coalesce(F("total"), zero),
        ).order_by("-created_at", "-id")
        return qs

class SaleDetailView(generics.RetrieveAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = SaleDetailSerializer
    lookup_url_kwarg = "pk"

    def get_queryset(self):
        tenant = _resolve_request_tenant(self.request)
        qs = Sale.objects.select_related("store", "cashier").prefetch_related("lines", "pos_payments")
        if tenant:
            qs = qs.filter(tenant=tenant)
        return qs