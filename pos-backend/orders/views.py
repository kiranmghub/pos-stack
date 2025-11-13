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
from rest_framework.exceptions import ValidationError, PermissionDenied, NotFound
from .serializers import (
    SaleListSerializer, SaleDetailSerializer, ReturnSerializer, ReturnStartSerializer, ReturnAddItemsSerializer, ReturnFinalizeSerializer,
)
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from datetime import datetime, time
from typing import Optional
from django.db import transaction
from .models import Return, ReturnItem, Refund, SaleLine, SalePayment


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
        status = (self.request.query_params.get("status") or "").strip()
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")
        query = (self.request.query_params.get("query") or "").strip()

        if store_id:
            qs = qs.filter(store_id=store_id)
        if status:
            qs = qs.filter(status__iexact=status)

        # ---- robust, TZ-aware date filtering ----
        def _to_aware_dt(val: Optional[str], end_of_day: bool) -> Optional[datetime]:
            """Parse ISO datetime or YYYY-MM-DD; make timezone-aware in current TZ."""
            if not val:
                return None
            dt = parse_datetime(val)
            if dt is None:
                d = parse_date(val)
                if not d:
                    return None
                # Expand bare date to local day bounds
                naive = datetime.combine(d, time.max if end_of_day else time.min)
                return timezone.make_aware(naive, timezone.get_current_timezone())
            # If a datetime was provided but is naive, localize it; otherwise keep its tzinfo
            return timezone.make_aware(dt, timezone.get_current_timezone()) if timezone.is_naive(dt) else dt

        df = _to_aware_dt(date_from, end_of_day=False)
        dt_ = _to_aware_dt(date_to,   end_of_day=True)

        if df:
            qs = qs.filter(created_at__gte=df)
        if dt_:
            qs = qs.filter(created_at__lte=dt_)

        if query:
            # align with real columns/relations used by admin:
            # SaleLine has `qty`, `variant`; Variant has `sku`, and `product.name`
            qs = qs.filter(
                Q(receipt_no__icontains=query)
                | Q(cashier__username__icontains=query)
                | Q(cashier__first_name__icontains=query)
                | Q(cashier__last_name__icontains=query)
                | Q(lines__variant__sku__icontains=query)
                | Q(lines__variant__product__name__icontains=query)
            ).distinct()

        # safe annotations
        zero = Value(0, output_field=DecimalField(max_digits=12, decimal_places=2))
        qs = qs.annotate(
            lines_count=Coalesce(Count("lines"), 0),
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
        ).order_by("-created_at", "-id")

        return qs


class SaleDetailView(generics.RetrieveAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = SaleDetailSerializer
    lookup_url_kwarg = "pk"

    def get_queryset(self):
        tenant = _resolve_request_tenant(self.request)
        # Prefetch deep relations so serializer can access variant/product without N+1
        qs = (
            Sale.objects
            .select_related("store", "cashier")
            .prefetch_related(
                "pos_payments",
                "lines",
                "lines__variant",
                "lines__variant__product",
            )
        )
        if tenant:
            qs = qs.filter(tenant=tenant)
        return qs
    

# ---------- Returns API ----------

class SaleReturnsListCreate(generics.ListCreateAPIView):
    """
    GET  /api/v1/orders/{pk}/returns
    POST /api/v1/orders/{pk}/returns  (create draft return)
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ReturnSerializer

    def get_queryset(self):
        tenant = _resolve_request_tenant(self.request)
        sale = get_object_or_404(Sale, pk=self.kwargs["pk"])
        qs = Return.objects.filter(sale=sale).select_related("sale", "store", "processed_by")
        if tenant:
            qs = qs.filter(tenant=tenant)
        return qs

    def create(self, request, *args, **kwargs):
        tenant = _resolve_request_tenant(request)
        sale = get_object_or_404(Sale, pk=kwargs["pk"])
        if tenant and sale.tenant_id != tenant.id:
            return Response({"detail": "Forbidden"}, status=403)
        payload = {
            "sale": sale.id,
            "store": sale.store_id,
            "processed_by": request.user.id,
            "reason_code": request.data.get("reason_code"),
            "notes": request.data.get("notes"),
        }
        ser = ReturnStartSerializer(data=payload)
        ser.is_valid(raise_exception=True)
        ret = ser.save(tenant=sale.tenant, status="draft")
        # assign return number
        ret.assign_return_no()
        ret.save(update_fields=["return_no"])
        return Response(ReturnSerializer(ret).data, status=201)


class ReturnAddItemsView(generics.CreateAPIView):
    """
    POST /api/v1/returns/{pk}/items
    Body: { items: [{ sale_line, qty_returned, restock, condition }] }
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ReturnAddItemsSerializer

    def create(self, request, *args, **kwargs):
        ret = get_object_or_404(Return, pk=kwargs["pk"], status="draft")
        tenant = _resolve_request_tenant(request)
        if tenant and ret.tenant_id != tenant.id:
            return Response({"detail": "Forbidden"}, status=403)
        ser = self.get_serializer(data=request.data, context={"return": ret})
        ser.is_valid(raise_exception=True)
        # replace current selections
        with transaction.atomic():
            ret.items.all().delete()
            refund_total = 0
            for item in ser.validated_data["items"]:
                ln = get_object_or_404(SaleLine, pk=item["sale_line"], sale_id=ret.sale_id)
                comp = Refund.compute_line_refund(ln, item["qty_returned"])
                ri = ReturnItem.objects.create(
                    return_ref=ret,
                    sale_line=ln,
                    qty_returned=item["qty_returned"],
                    restock=bool(item.get("restock", True)),
                    condition=item.get("condition") or "RESALEABLE",
                    reason_code=(item.get("reason_code") or "").strip() or None,
                    notes=(item.get("notes") or "").strip() or None,
                    refund_subtotal=comp["subtotal"],
                    refund_tax=comp["tax"],
                    refund_total=comp["total"],
                )
                refund_total += comp["total"]
            ret.refund_total = refund_total
            ret.save(update_fields=["refund_total"])
        return Response(ReturnSerializer(ret).data, status=200)


class ReturnFinalizeView(generics.CreateAPIView):
    """
    POST /api/v1/returns/{pk}/finalize
    Body: { refunds: [{ method, amount, external_ref? }, ...] }
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ReturnFinalizeSerializer

    def create(self, request, *args, **kwargs):
        ret = get_object_or_404(Return, pk=kwargs["pk"], status="draft")
        tenant = _resolve_request_tenant(request)
        if tenant and ret.tenant_id != tenant.id:
            return Response({"detail": "Forbidden"}, status=403)
        if not ret.items.exists():
            return Response({"detail": "No items selected"}, status=400)

        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)

        with transaction.atomic():
            # write refunds
            total_methods = 0
            for rf in ser.validated_data["refunds"]:
                r = Refund.objects.create(return_ref=ret, **rf)
                total_methods += r.amount
            # sanity check
            if round(total_methods, 2) != round(ret.refund_total, 2):
                return Response({"detail": "Refund breakdown must equal refund_total"}, status=400)

            # inventory restock ledger
            from inventory.models import InventoryItem, StockLedgerEntry
            for ri in ret.items.select_related("sale_line__variant"):
                if not ri.restock:
                    continue
                ii, _ = InventoryItem.objects.get_or_create(
                    tenant=ret.tenant, store=ret.store, variant=ri.sale_line.variant,
                    defaults={"on_hand": 0, "reserved": 0}
                )
                ii.on_hand = ii.on_hand + ri.qty_returned
                ii.save(update_fields=["on_hand"])
                StockLedgerEntry.objects.create(
                    store=ret.store, variant=ri.sale_line.variant, delta=ri.qty_returned,
                    reason="return", ref_type="return", ref_id=str(ret.id)
                )
            # mark finalized and assign code if needed
            if not ret.return_no:
                ret.assign_return_no()
            ret.status = "finalized"
            ret.save(update_fields=["status", "return_no"])
        return Response(ReturnSerializer(ret).data, status=200)
    

class ReturnDetailView(generics.RetrieveDestroyAPIView):
    """
    GET    /api/v1/orders/returns/{pk}     → return detail
    DELETE /api/v1/orders/returns/{pk}     → delete draft return
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ReturnSerializer
    lookup_url_kwarg = "pk"

    def get_queryset(self):
        tenant = _resolve_request_tenant(self.request)
        qs = (Return.objects
              .select_related("sale", "store", "processed_by")
              .prefetch_related(
                  "items",
                  "items__sale_line",
                  "items__sale_line__variant",
                  "items__sale_line__variant__product",
                  "refunds",
              ))
        if tenant:
            qs = qs.filter(tenant=tenant)
        return qs
    
    def destroy(self, request, *args, **kwargs):
        tenant = _resolve_request_tenant(request)
        ret = get_object_or_404(Return.objects.select_related("sale", "store"), pk=kwargs["pk"])
        try:
            ret = Return.objects.get(pk=kwargs["pk"])
        except Return.DoesNotExist:
            raise NotFound("Return not found or already deleted")
        if tenant and ret.tenant_id != tenant.id:
            raise PermissionDenied("Forbidden")
        if ret.status != "draft":
            raise ValidationError("Only draft returns can be deleted")
        ret.delete()
        return Response(status=204)
    
class ReturnItemDeleteView(generics.DestroyAPIView):
    """
    DELETE /api/v1/orders/return-items/{pk}
    Only allowed when the parent return is in 'draft' status.
    """
    permission_classes = [permissions.IsAuthenticated]
    lookup_url_kwarg = "pk"

    def get_object(self):
        tenant = _resolve_request_tenant(self.request)
        ri = get_object_or_404(ReturnItem.objects.select_related("return_ref"), pk=self.kwargs["pk"])
        if tenant and ri.return_ref.tenant_id != tenant.id:
            raise PermissionDenied("Forbidden")
        if ri.return_ref.status != "draft":
            raise ValidationError("Can only delete items on a draft return")
        return ri

    @transaction.atomic
    def delete(self, request, *args, **kwargs):
        ri = self.get_object()
        ret = ri.return_ref
        ri.delete()
        # Recompute refund_total from remaining items
        total = sum((it.refund_total or 0) for it in ret.items.all())
        ret.refund_total = total
        ret.save(update_fields=["refund_total"])
        return Response(status=204)


class ReturnVoidView(generics.CreateAPIView):
    """
    POST /api/v1/orders/returns/{pk}/void
    Transition draft → void (no inventory changes; nothing to undo).
    """
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request, *args, **kwargs):
        tenant = _resolve_request_tenant(request)
        ret = get_object_or_404(Return.objects.select_for_update(), pk=kwargs["pk"])
        if tenant and ret.tenant_id != tenant.id:
            return Response({"detail": "Forbidden"}, status=403)
        if ret.status != "draft":
            return Response({"detail": "Only draft returns can be voided"}, status=400)
        ret.status = "void"
        ret.save(update_fields=["status"])
        return Response({"id": ret.id, "status": ret.status})