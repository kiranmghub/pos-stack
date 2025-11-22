# pos-backend/customers/views.py

from django.shortcuts import render
from django.db.models import Q
from rest_framework import generics, permissions
from rest_framework.response import Response

from .models import Customer
from .serializers import (
    CustomerSerializer,
    CustomerListSerializer,
    CustomerSalesSummarySerializer,
)
from orders.models import Sale
from orders.serializers import SaleListSerializer  # reuse


def _resolve_request_tenant(request):
    """
    Mirror the pattern used in orders/views.py for tenant resolution.
    Adjust this function if you have a shared helper.
    """
    tenant = getattr(request, "tenant", None)
    if tenant:
        return tenant
    # TODO: fallback from JWT or user if needed
    return None


class CustomerListCreateView(generics.ListCreateAPIView):
    """
    GET /api/v1/customers/
    POST /api/v1/customers/
    """

    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == "GET":
            return CustomerListSerializer
        return CustomerSerializer

    def get_queryset(self):
        tenant = _resolve_request_tenant(self.request)
        qs = Customer.objects.all()
        if tenant:
            qs = qs.filter(tenant=tenant)

        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(
                Q(first_name__icontains=q)
                | Q(last_name__icontains=q)
                | Q(email__icontains=q)
                | Q(phone_number__icontains=q)
            )

        return qs.order_by("-last_purchase_date", "-id")


class CustomerDetailView(generics.RetrieveUpdateAPIView):
    """
    GET /api/v1/customers/<id>/
    PATCH /api/v1/customers/<id>/
    """

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = CustomerSerializer

    def get_queryset(self):
        tenant = _resolve_request_tenant(self.request)
        qs = Customer.objects.all()
        if tenant:
            qs = qs.filter(tenant=tenant)
        return qs


class CustomerSalesView(generics.ListAPIView):
    """
    GET /api/v1/customers/<id>/sales?date_from=&date_to=
    """

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = SaleListSerializer

    def get_queryset(self):
        tenant = _resolve_request_tenant(self.request)
        customer_id = self.kwargs["pk"]
        qs = Sale.objects.select_related("store", "customer")
        if tenant:
            qs = qs.filter(tenant=tenant)
        qs = qs.filter(customer_id=customer_id)

        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")

        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)

        return qs.order_by("-created_at", "-id")


class CustomerSalesSummaryView(generics.ListAPIView):
    """
    GET /api/v1/customers/sales-summary?date_from=&date_to=&q=
    """

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = CustomerSalesSummarySerializer

    def get_queryset(self):
        tenant = _resolve_request_tenant(self.request)
        qs = Customer.objects.all()
        if tenant:
            qs = qs.filter(tenant=tenant)

        # NEW: search filter
        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(
                Q(first_name__icontains=q)
                | Q(last_name__icontains=q)
                | Q(email__icontains=q)
                | Q(phone_number__icontains=q)
            )

        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")
        if date_from:
            qs = qs.filter(last_purchase_date__date__gte=date_from)
        if date_to:
            qs = qs.filter(last_purchase_date__date__lte=date_to)

        # Optional: keep results stable & recent-first
        return qs.order_by("-last_purchase_date", "-id")

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        rows = [
            {
                "id": c.id,
                "full_name": c.full_name,
                "email": c.email,
                "phone_number": c.phone_number,
                "total_spend": c.total_spend,
                "total_returns": c.total_returns,
                "net_spend": c.net_spend,
                "visits_count": c.visits_count,
            }
            for c in qs
        ]
        serializer = self.get_serializer(rows, many=True)
        return Response(serializer.data)
