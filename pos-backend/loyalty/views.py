# pos-backend/loyalty/views.py
from django.shortcuts import render

from rest_framework import generics, permissions
from rest_framework.response import Response

from .models import LoyaltyProgram, LoyaltyAccount, LoyaltyTransaction
from .serializers import LoyaltyProgramSerializer, LoyaltyAccountSerializer
from tenants.models import Tenant
from customers.models import Customer


def _resolve_request_tenant(request):
    tenant = getattr(request, "tenant", None)
    if tenant:
        return tenant
    return None


class LoyaltyProgramView(generics.RetrieveUpdateAPIView):
    """
    GET /api/v1/loyalty/program
    PATCH /api/v1/loyalty/program
    """

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = LoyaltyProgramSerializer

    def get_object(self):
        tenant = _resolve_request_tenant(self.request)
        if not tenant:
            raise Exception("Tenant context missing")
        program, _ = LoyaltyProgram.objects.get_or_create(tenant=tenant)
        return program


class LoyaltyAccountDetailView(generics.RetrieveAPIView):
    """
    GET /api/v1/loyalty/accounts/<customer_id>
    """

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = LoyaltyAccountSerializer

    def get_object(self):
        tenant = _resolve_request_tenant(self.request)
        customer_id = self.kwargs["customer_id"]
        customer = Customer.objects.get(id=customer_id, tenant=tenant)
        account, _ = LoyaltyAccount.objects.get_or_create(
            tenant=tenant, customer=customer
        )
        return account


class LoyaltyHistoryView(generics.ListAPIView):
    """
    GET /api/v1/loyalty/accounts/<customer_id>/history
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        tenant = _resolve_request_tenant(request)
        customer_id = kwargs["customer_id"]
        account = LoyaltyAccount.objects.get(
            tenant=tenant, customer_id=customer_id
        )
        qs = LoyaltyTransaction.objects.filter(
            tenant=tenant, account=account
        ).order_by("-created_at", "-id")

        data = [
            {
                "id": tx.id,
                "type": tx.type,
                "points": tx.points,
                "balance_after": tx.balance_after,
                "sale_id": tx.sale_id,
                "metadata": tx.metadata,
                "created_at": tx.created_at,
            }
            for tx in qs
        ]
        return Response(data)
