# pos-backend/orders/views.py
from django.shortcuts import render
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from common.api_mixins import IsInTenant
from .models import Sale, Return, ReturnItem, Refund, SaleLine, SalePayment, AuditLog
from rest_framework.generics import ListAPIView
from .serializers import RecentSaleSerializer
from django.shortcuts import get_object_or_404
from django.http import HttpResponse
import csv
from tenants.models import Tenant
from django.db.models import Count, Q, F, Sum, DecimalField, Value, ExpressionWrapper, OuterRef, Subquery
from django.db.models.functions import Coalesce
from rest_framework import generics, permissions
from rest_framework.exceptions import ValidationError, PermissionDenied, NotFound
from .serializers import (
    SaleListSerializer, SaleDetailSerializer, ReturnSerializer, ReturnStartSerializer, ReturnAddItemsSerializer, ReturnFinalizeSerializer,
    ReturnListSerializer, SalePaymentListSerializer, RefundListSerializer, AuditLogSerializer,
)
from customers.services import update_customer_after_return
from loyalty.services import record_return
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from datetime import datetime, time
from typing import Optional
from django.db import transaction
from decimal import Decimal


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
    pagination_class = None

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
            total_returns=Coalesce(Count("returns", distinct=True), 0),
        ).order_by("-created_at", "-id")

        return qs

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        page_size = int(request.query_params.get("page_size") or 20)
        page = int(request.query_params.get("page") or 1)
        total = qs.count()
        start = (page - 1) * page_size
        rows = qs[start:start + page_size]
        ser = self.get_serializer(rows, many=True, context={"request": request})
        tenant = _resolve_request_tenant(request)
        return Response({
            "count": total,
            "results": ser.data,
            "currency": {
                "code": getattr(tenant, "resolved_currency", None) or getattr(tenant, "currency_code", "USD"),
                "symbol": getattr(tenant, "currency_symbol", None),
                "precision": getattr(tenant, "currency_precision", 2),
            },
        })


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

class ReturnListView(generics.ListAPIView):
    """
    GET /api/v1/orders/returns/?status=&store_id=&date_from=&date_to=&query=
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ReturnListSerializer

    def get_queryset(self):
        tenant = _resolve_request_tenant(self.request)
        qs = Return.objects.select_related("sale__cashier", "store", "processed_by")
        if tenant:
            qs = qs.filter(tenant=tenant)

        status = (self.request.query_params.get("status") or "").strip()
        store_id = self.request.query_params.get("store_id")
        query = (self.request.query_params.get("query") or "").strip()
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")

        if status:
            qs = qs.filter(status__iexact=status)
        if store_id:
            qs = qs.filter(store_id=store_id)
        if query:
            qs = qs.filter(
                Q(return_no__icontains=query)
                | Q(sale__receipt_no__icontains=query)
                | Q(processed_by__username__icontains=query)
                | Q(processed_by__first_name__icontains=query)
                | Q(processed_by__last_name__icontains=query)
            )

        def _to_aware_dt(val: Optional[str], end_of_day: bool) -> Optional[datetime]:
            if not val:
                return None
            dt = parse_datetime(val)
            if dt is None:
                d = parse_date(val)
                if not d:
                    return None
                naive = datetime.combine(d, time.max if end_of_day else time.min)
                return timezone.make_aware(naive, timezone.get_current_timezone())
            return timezone.make_aware(dt, timezone.get_current_timezone()) if timezone.is_naive(dt) else dt

        df = _to_aware_dt(date_from, end_of_day=False)
        dt_ = _to_aware_dt(date_to, end_of_day=True)
        if df:
            qs = qs.filter(created_at__gte=df)
        if dt_:
            qs = qs.filter(created_at__lte=dt_)

        reason_sq = (
            ReturnItem.objects.filter(return_ref=OuterRef("pk"))
            .exclude(reason_code__isnull=True)
            .exclude(reason_code__exact="")
            .values("reason_code")[:1]
        )

        zero = Value(0, output_field=DecimalField(max_digits=12, decimal_places=2))
        return qs.annotate(
            refund_subtotal_total=Coalesce(Sum("items__refund_subtotal"), zero),
            refund_tax_total=Coalesce(Sum("items__refund_tax"), zero),
            items_count=Count("items", distinct=True),
            first_item_reason=Subquery(reason_sq),
        ).order_by("-created_at", "-id")


class PaymentListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = SalePaymentListSerializer

    def get_queryset(self):
        tenant = _resolve_request_tenant(self.request)
        qs = SalePayment.objects.select_related("sale__store", "sale__cashier")
        if tenant:
            qs = qs.filter(sale__tenant=tenant)

        method = (self.request.query_params.get("method") or "").strip()
        store_id = self.request.query_params.get("store_id")
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")

        if method:
            qs = qs.filter(type__iexact=method)
        if store_id:
            qs = qs.filter(sale__store_id=store_id)

        def _to_aware_dt(val: Optional[str], end_of_day: bool) -> Optional[datetime]:
            if not val:
                return None
            dt = parse_datetime(val)
            if dt is None:
                d = parse_date(val)
                if not d:
                    return None
                naive = datetime.combine(d, time.max if end_of_day else time.min)
                return timezone.make_aware(naive, timezone.get_current_timezone())
            return timezone.make_aware(dt, timezone.get_current_timezone()) if timezone.is_naive(dt) else dt

        df = _to_aware_dt(date_from, end_of_day=False)
        dt_ = _to_aware_dt(date_to, end_of_day=True)
        if df:
            qs = qs.filter(created_at__gte=df)
        if dt_:
            qs = qs.filter(created_at__lte=dt_)

        return qs.order_by("-created_at", "-id")


class RefundListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = RefundListSerializer

    def get_queryset(self):
        tenant = _resolve_request_tenant(self.request)
        qs = Refund.objects.select_related("return_ref__sale", "return_ref__store")
        if tenant:
            qs = qs.filter(return_ref__tenant=tenant)

        method = (self.request.query_params.get("method") or "").strip()
        store_id = self.request.query_params.get("store_id")
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")

        if method:
            qs = qs.filter(method__iexact=method)
        if store_id:
            qs = qs.filter(return_ref__store_id=store_id)

        def _to_aware_dt(val: Optional[str], end_of_day: bool) -> Optional[datetime]:
            if not val:
                return None
            dt = parse_datetime(val)
            if dt is None:
                d = parse_date(val)
                if not d:
                    return None
                naive = datetime.combine(d, time.max if end_of_day else time.min)
                return timezone.make_aware(naive, timezone.get_current_timezone())
            return timezone.make_aware(dt, timezone.get_current_timezone()) if timezone.is_naive(dt) else dt

        df = _to_aware_dt(date_from, end_of_day=False)
        dt_ = _to_aware_dt(date_to, end_of_day=True)
        if df:
            qs = qs.filter(created_at__gte=df)
        if dt_:
            qs = qs.filter(created_at__lte=dt_)

        return qs.order_by("-created_at", "-id")


class PaymentSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        tenant = _resolve_request_tenant(request)
        store_id = request.query_params.get("store_id")
        method = (request.query_params.get("method") or "").strip()
        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")

        def _to_aware_dt(val: Optional[str], end_of_day: bool) -> Optional[datetime]:
            if not val:
                return None
            dt = parse_datetime(val)
            if dt is None:
                d = parse_date(val)
                if not d:
                    return None
                naive = datetime.combine(d, time.max if end_of_day else time.min)
                return timezone.make_aware(naive, timezone.get_current_timezone())
            return timezone.make_aware(dt, timezone.get_current_timezone()) if timezone.is_naive(dt) else dt

        payments = SalePayment.objects.select_related("sale__store")
        refunds = Refund.objects.select_related("return_ref__store")
        if tenant:
            payments = payments.filter(sale__tenant=tenant)
            refunds = refunds.filter(return_ref__tenant=tenant)
        if store_id:
            payments = payments.filter(sale__store_id=store_id)
            refunds = refunds.filter(return_ref__store_id=store_id)
        if method:
            payments = payments.filter(type__iexact=method)
            refunds = refunds.filter(method__iexact=method)

        df = _to_aware_dt(date_from, end_of_day=False)
        dt_ = _to_aware_dt(date_to, end_of_day=True)
        if df:
            payments = payments.filter(created_at__gte=df)
            refunds = refunds.filter(created_at__gte=df)
        if dt_:
            payments = payments.filter(created_at__lte=dt_)
            refunds = refunds.filter(created_at__lte=dt_)

        zero = Decimal("0.00")
        payments_by_method = {code: zero for code, _ in SalePayment.TYPE_CHOICES}
        for row in payments.values("type").annotate(total=Coalesce(Sum("amount"), zero)):
            payments_by_method[row["type"]] = row["total"]

        refunds_by_method = {code: zero for code, _ in Refund.METHOD_CHOICES}
        for row in refunds.values("method").annotate(total=Coalesce(Sum("amount"), zero)):
            refunds_by_method[row["method"]] = row["total"]

        total_collected = sum(payments_by_method.values(), zero)
        total_refunded = sum(refunds_by_method.values(), zero)
        net_total = total_collected - total_refunded

        def _serialize(d):
            return {k: str(v) for k, v in d.items()}

        return Response({
            "payments_by_method": _serialize(payments_by_method),
            "refunds_by_method": _serialize(refunds_by_method),
            "total_collected": str(total_collected),
            "total_refunded": str(total_refunded),
            "net_total": str(net_total),
            "currency": {
                "code": getattr(tenant, "resolved_currency", None) or getattr(tenant, "currency_code", "USD"),
                "symbol": getattr(tenant, "currency_symbol", None),
                "precision": getattr(tenant, "currency_precision", 2),
            },
        })


class PaymentExportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        mode = (request.query_params.get("kind") or "payments").lower()
        if mode not in ("payments", "refunds"):
            return Response({"detail": "kind must be 'payments' or 'refunds'."}, status=400)

        tenant = _resolve_request_tenant(request)
        store_id = request.query_params.get("store_id")
        method = (request.query_params.get("method") or "").strip()
        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")

        def _to_aware_dt(val: Optional[str], end_of_day: bool) -> Optional[datetime]:
            if not val:
                return None
            dt = parse_datetime(val)
            if dt is None:
                d = parse_date(val)
                if not d:
                    return None
                naive = datetime.combine(d, time.max if end_of_day else time.min)
                return timezone.make_aware(naive, timezone.get_current_timezone())
            return timezone.make_aware(dt, timezone.get_current_timezone()) if timezone.is_naive(dt) else dt

        if mode == "payments":
            qs = SalePayment.objects.select_related("sale__store", "sale__cashier")
            if tenant:
                qs = qs.filter(sale__tenant=tenant)
            if store_id:
                qs = qs.filter(sale__store_id=store_id)
            if method:
                qs = qs.filter(type__iexact=method)
            df = _to_aware_dt(date_from, end_of_day=False)
            dt_ = _to_aware_dt(date_to, end_of_day=True)
            if df:
                qs = qs.filter(created_at__gte=df)
            if dt_:
                qs = qs.filter(created_at__lte=dt_)

            response = HttpResponse(content_type="text/csv")
            response["Content-Disposition"] = 'attachment; filename="payments_export.csv"'
            writer = csv.writer(response)
            writer.writerow(["Payment ID", "Sale ID", "Receipt", "Store", "Cashier", "Method", "Amount", "Received", "Change", "Reference", "Created"])
            for row in qs.order_by("-created_at"):
                writer.writerow([
                    row.id,
                    row.sale_id,
                    row.sale.receipt_no,
                    row.sale.store.name,
                    row.sale.cashier.get_full_name() or row.sale.cashier.username,
                    row.type,
                    row.amount,
                    row.received,
                    row.change,
                    row.txn_ref or "",
                    row.created_at.isoformat(),
                ])
            return response

        qs = Refund.objects.select_related("return_ref__sale", "return_ref__store")
        if tenant:
            qs = qs.filter(return_ref__tenant=tenant)
        if store_id:
            qs = qs.filter(return_ref__store_id=store_id)
        if method:
            qs = qs.filter(method__iexact=method)
        df = _to_aware_dt(date_from, end_of_day=False)
        dt_ = _to_aware_dt(date_to, end_of_day=True)
        if df:
            qs = qs.filter(created_at__gte=df)
        if dt_:
            qs = qs.filter(created_at__lte=dt_)

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="refunds_export.csv"'
        writer = csv.writer(response)
        writer.writerow(["Refund ID", "Return ID", "Return No.", "Sale ID", "Receipt", "Store", "Method", "Amount", "Reference", "Created"])
        for row in qs.order_by("-created_at"):
            ret = row.return_ref
            writer.writerow([
                row.id,
                ret.id,
                ret.return_no or "",
                ret.sale_id,
                ret.sale.receipt_no,
                ret.store.name,
                row.method,
                row.amount,
                row.external_ref or "",
                row.created_at.isoformat(),
            ])
        return response


class DiscountSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        tenant = _resolve_request_tenant(request)
        store_id = request.query_params.get("store_id")
        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")

        def _to_aware_dt(val: Optional[str], end_of_day: bool) -> Optional[datetime]:
            if not val:
                return None
            dt = parse_datetime(val)
            if dt is None:
                d = parse_date(val)
                if not d:
                    return None
                naive = datetime.combine(d, time.max if end_of_day else time.min)
                return timezone.make_aware(naive, timezone.get_current_timezone())
            return timezone.make_aware(dt, timezone.get_current_timezone()) if timezone.is_naive(dt) else dt

        qs = Sale.objects.select_related("store")
        if tenant:
            qs = qs.filter(tenant=tenant)
        if store_id:
            qs = qs.filter(store_id=store_id)

        df = _to_aware_dt(date_from, end_of_day=False)
        dt_ = _to_aware_dt(date_to, end_of_day=True)
        if df:
            qs = qs.filter(created_at__gte=df)
        if dt_:
            qs = qs.filter(created_at__lte=dt_)

        total_discount = Decimal("0.00")
        summary: dict[str, dict] = {}

        for sale in qs.iterator():
            receipt = sale.receipt_data or {}
            totals = receipt.get("totals") or {}
            rules = receipt.get("discount_by_rule") or totals.get("discount_by_rule") or []
            for rule in rules:
                amount = Decimal(str(rule.get("amount") or "0"))
                if amount <= 0:
                    continue
                code = (rule.get("code") or f"RULE-{rule.get('rule_id') or ''}" or "UNKNOWN").upper()
                bucket = summary.setdefault(code, {
                    "code": code,
                    "name": rule.get("name") or code,
                    "total_discount_amount": Decimal("0.00"),
                    "sale_ids": set(),
                })
                bucket["total_discount_amount"] += amount
                bucket["sale_ids"].add(sale.id)
                total_discount += amount

        result = []
        for code, data in summary.items():
            result.append({
                "code": code,
                "name": data["name"],
                "total_discount_amount": str(data["total_discount_amount"]),
                "sales_count": len(data["sale_ids"]),
            })
        result.sort(key=lambda x: Decimal(x["total_discount_amount"]), reverse=True)

        return Response({
            "total_discount": str(total_discount),
            "rules": result,
            "currency": {
                "code": getattr(tenant, "resolved_currency", None) or getattr(tenant, "currency_code", "USD"),
                "symbol": getattr(tenant, "currency_symbol", None),
                "precision": getattr(tenant, "currency_precision", 2),
            },
        })


class DiscountExportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _iter_sales(self, tenant, store_id, date_from, date_to, rule_code=None):
        qs = Sale.objects.select_related("store", "cashier")
        if tenant:
            qs = qs.filter(tenant=tenant)
        if store_id:
            qs = qs.filter(store_id=store_id)
        def _to_aware_dt(val, end_of_day):
            if not val:
                return None
            dt = parse_datetime(val)
            if dt is None:
                d = parse_date(val)
                if not d:
                    return None
                naive = datetime.combine(d, time.max if end_of_day else time.min)
                return timezone.make_aware(naive, timezone.get_current_timezone())
            return timezone.make_aware(dt, timezone.get_current_timezone()) if timezone.is_naive(dt) else dt
        df = _to_aware_dt(date_from, False)
        dt_ = _to_aware_dt(date_to, True)
        if df: qs = qs.filter(created_at__gte=df)
        if dt_: qs = qs.filter(created_at__lte=dt_)
        if rule_code:
            qs = qs.filter(
                Q(receipt_data__discount_by_rule__contains=[{"code": rule_code}]) |
                Q(receipt_data__totals__discount_by_rule__contains=[{"code": rule_code}])
            )
        return qs.order_by("-created_at")

    def get(self, request, *args, **kwargs):
        tenant = _resolve_request_tenant(request)
        kind = (request.query_params.get("kind") or "summary").lower()
        store_id = request.query_params.get("store_id")
        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")

        if kind == "sales":
            rule_code = (request.query_params.get("rule_code") or "").strip()
            if not rule_code:
                return Response({"detail": "rule_code required for sales export."}, status=400)
            response = HttpResponse(content_type="text/csv")
            response["Content-Disposition"] = f'attachment; filename="discount_sales_{rule_code}.csv"'
            writer = csv.writer(response)
            writer.writerow(["Sale ID", "Receipt", "Store", "Cashier", "Discount total", "Created"])
            for sale in self._iter_sales(tenant, store_id, date_from, date_to, rule_code):
                writer.writerow([
                    sale.id,
                    sale.receipt_no,
                    sale.store.name,
                    sale.cashier.get_full_name() or sale.cashier.username,
                    sale.receipt_data.get("totals", {}).get("discount", "0.00") if isinstance(sale.receipt_data, dict) else "0.00",
                    timezone.localtime(sale.created_at).isoformat(),
                ])
            return response

        # summary export
        summary = DiscountSummaryView()
        summary.request = request
        data = summary.get(request).data
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="discount_summary.csv"'
        writer = csv.writer(response)
        writer.writerow(["Rule", "Code", "Total Discount", "Sales"])
        for rule in data.get("rules", []):
            writer.writerow([rule["name"], rule["code"], rule["total_discount_amount"], rule["sales_count"]])
        return response


class DiscountSalesListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = SaleListSerializer
    queryset = Sale.objects.none()

    def get_queryset(self):
        tenant = _resolve_request_tenant(self.request)
        qs = Sale.objects.select_related("store", "cashier")
        if tenant:
            qs = qs.filter(tenant=tenant)

        store_id = self.request.query_params.get("store_id")
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")
        rule_code = (self.request.query_params.get("rule_code") or "").strip()
        if store_id:
            qs = qs.filter(store_id=store_id)

        def _to_aware_dt(val: Optional[str], end_of_day: bool) -> Optional[datetime]:
            if not val:
                return None
            dt = parse_datetime(val)
            if dt is None:
                d = parse_date(val)
                if not d:
                    return None
                naive = datetime.combine(d, time.max if end_of_day else time.min)
                return timezone.make_aware(naive, timezone.get_current_timezone())
            return timezone.make_aware(dt, timezone.get_current_timezone()) if timezone.is_naive(dt) else dt

        df = _to_aware_dt(date_from, end_of_day=False)
        dt_ = _to_aware_dt(date_to, end_of_day=True)
        if df:
            qs = qs.filter(created_at__gte=df)
        if dt_:
            qs = qs.filter(created_at__lte=dt_)
        if rule_code:
            qs = qs.filter(
                Q(receipt_data__discount_by_rule__contains=[{"code": rule_code}]) |
                Q(receipt_data__totals__discount_by_rule__contains=[{"code": rule_code}])
            )

        return qs.order_by("-created_at", "-id")


class TaxSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        tenant = _resolve_request_tenant(request)
        store_id = request.query_params.get("store_id")
        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")

        def _to_aware_dt(val, end_of_day):
            if not val:
                return None
            dt = parse_datetime(val)
            if dt is None:
                d = parse_date(val)
                if not d:
                    return None
                naive = datetime.combine(d, time.max if end_of_day else time.min)
                return timezone.make_aware(naive, timezone.get_current_timezone())
            return timezone.make_aware(dt, timezone.get_current_timezone()) if timezone.is_naive(dt) else dt

        qs = Sale.objects.select_related("store")
        if tenant:
            qs = qs.filter(tenant=tenant)
        if store_id:
            qs = qs.filter(store_id=store_id)
        df = _to_aware_dt(date_from, False)
        dt_ = _to_aware_dt(date_to, True)
        if df:
            qs = qs.filter(created_at__gte=df)
        if dt_:
            qs = qs.filter(created_at__lte=dt_)

        rule_map: dict[str, dict] = {}
        total_tax = Decimal("0.00")
        sales_count = 0

        for sale in qs.iterator():
            receipt = sale.receipt_data or {}
            totals = receipt.get("totals") or {}
            tax_rules = receipt.get("tax_by_rule") or totals.get("tax_by_rule") or []
            tax_amount = Decimal(str(totals.get("tax") or "0"))
            if tax_amount > 0:
                total_tax += tax_amount
                sales_count += 1
            for entry in tax_rules:
                amount = Decimal(str(entry.get("amount") or "0"))
                if amount <= 0:
                    continue
                code = (entry.get("code") or f"TAX-{entry.get('rule_id') or ''}" or "UNKNOWN").upper()
                bucket = rule_map.setdefault(code, {
                    "code": code,
                    "name": entry.get("name") or code,
                    "tax_amount": Decimal("0.00"),
                    "sales": set(),
                })
                bucket["tax_amount"] += amount
                bucket["sales"].add(sale.id)

        rules = []
        for code, data in rule_map.items():
            rules.append({
                "code": code,
                "name": data["name"],
                "tax_amount": str(data["tax_amount"]),
                "sales_count": len(data["sales"]),
            })
        rules.sort(key=lambda x: Decimal(x["tax_amount"]), reverse=True)

        return Response({
            "total_tax": str(total_tax),
            "taxed_sales": sales_count,
            "rules": rules,
            "currency": {
                "code": getattr(tenant, "resolved_currency", None) or getattr(tenant, "currency_code", "USD"),
                "symbol": getattr(tenant, "currency_symbol", None),
                "precision": getattr(tenant, "currency_precision", 2),
            },
        })


class TaxSalesListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = SaleListSerializer
    queryset = Sale.objects.none()

    def get_queryset(self):
        tenant = _resolve_request_tenant(self.request)
        qs = Sale.objects.select_related("store", "cashier")
        if tenant:
            qs = qs.filter(tenant=tenant)

        store_id = self.request.query_params.get("store_id")
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")
        rule_code = (self.request.query_params.get("rule_code") or "").strip()

        def _to_aware_dt(val, end_of_day):
            if not val:
                return None
            dt = parse_datetime(val)
            if dt is None:
                d = parse_date(val)
                if not d:
                    return None
                naive = datetime.combine(d, time.max if end_of_day else time.min)
                return timezone.make_aware(naive, timezone.get_current_timezone())
            return timezone.make_aware(dt, timezone.get_current_timezone()) if timezone.is_naive(dt) else dt

        if store_id:
            qs = qs.filter(store_id=store_id)
        df = _to_aware_dt(date_from, False)
        dt_ = _to_aware_dt(date_to, True)
        if df:
            qs = qs.filter(created_at__gte=df)
        if dt_:
            qs = qs.filter(created_at__lte=dt_)
        if rule_code:
            qs = qs.filter(
                Q(receipt_data__tax_by_rule__contains=[{"code": rule_code}]) |
                Q(receipt_data__totals__tax_by_rule__contains=[{"code": rule_code}])
            )

        return qs.order_by("-created_at", "-id")


class AuditLogListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = AuditLogSerializer
    queryset = AuditLog.objects.none()

    def get_queryset(self):
        tenant = _resolve_request_tenant(self.request)
        qs = AuditLog.objects.select_related("sale", "store", "user")
        if tenant:
            qs = qs.filter(tenant=tenant)

        action = (self.request.query_params.get("action") or "").strip()
        severity = (self.request.query_params.get("severity") or "").strip()
        store_id = self.request.query_params.get("store_id")
        sale_id = self.request.query_params.get("sale_id")
        user_id = self.request.query_params.get("user_id")
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")

        def _to_aware_dt(val, end_of_day):
            if not val:
                return None
            dt = parse_datetime(val)
            if dt is None:
                d = parse_date(val)
                if not d:
                    return None
                naive = datetime.combine(d, time.max if end_of_day else time.min)
                return timezone.make_aware(naive, timezone.get_current_timezone())
            return timezone.make_aware(dt, timezone.get_current_timezone()) if timezone.is_naive(dt) else dt

        if action:
            qs = qs.filter(action__iexact=action)
        if severity:
            qs = qs.filter(severity__iexact=severity)
        if store_id:
            qs = qs.filter(store_id=store_id)
        if sale_id:
            qs = qs.filter(sale_id=sale_id)
        if user_id:
            qs = qs.filter(user_id=user_id)
        df = _to_aware_dt(date_from, False)
        dt_ = _to_aware_dt(date_to, True)
        if df:
            qs = qs.filter(created_at__gte=df)
        if dt_:
            qs = qs.filter(created_at__lte=dt_)
        return qs.order_by("-created_at", "-id")


class AuditLogDetailView(generics.RetrieveAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = AuditLogSerializer

    def get_queryset(self):
        tenant = _resolve_request_tenant(self.request)
        qs = AuditLog.objects.select_related("sale", "store", "user")
        if tenant:
            qs = qs.filter(tenant=tenant)
        return qs


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
        AuditLog.record(
            tenant=sale.tenant,
            user=request.user if request.user.is_authenticated else None,
            sale=sale,
            action="RETURN_DRAFT_CREATED",
            severity="info",
            metadata={
                "return_id": ret.id,
                "reason": payload.get("reason_code"),
            },
        )
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

            # inventory restock/waste ledger
            from inventory.models import InventoryItem, StockLedger
            for ri in ret.items.select_related("sale_line__variant"):
                # Determine disposition: use new disposition field if set, otherwise fallback to restock boolean
                disposition = getattr(ri, "disposition", None)
                if disposition == "PENDING":
                    # Skip items that haven't been inspected
                    continue
                
                # Determine if restock or waste
                is_restock = False
                if disposition:
                    is_restock = (disposition == "RESTOCK")
                else:
                    # Legacy: use restock boolean
                    is_restock = ri.restock
                
                ii, _ = InventoryItem.objects.get_or_create(
                    tenant=ret.tenant, store=ret.store, variant=ri.sale_line.variant,
                    defaults={"on_hand": 0, "reserved": 0}
                )
                ii = InventoryItem.objects.select_for_update().get(id=ii.id)
                
                if is_restock:
                    # Restock path: increment inventory
                    ii.on_hand = (ii.on_hand or 0) + ri.qty_returned
                    ii.save(update_fields=["on_hand"])
                    StockLedger.objects.create(
                        tenant=ret.tenant,
                        store=ret.store,
                        variant=ri.sale_line.variant,
                        qty_delta=ri.qty_returned,
                        balance_after=ii.on_hand,
                        ref_type="RETURN",
                        ref_id=ret.id,
                        note=f"Return #{ret.id} - Restocked",
                        created_by=request.user if request.user.is_authenticated else None,
                    )
                else:
                    # Waste path: decrement inventory (if it exists) and log as waste
                    current_on_hand = (ii.on_hand or 0)
                    if current_on_hand >= ri.qty_returned:
                        ii.on_hand = current_on_hand - ri.qty_returned
                    else:
                        # If we don't have enough on hand, set to 0 (shouldn't happen but be defensive)
                        ii.on_hand = 0
                    ii.save(update_fields=["on_hand"])
                    StockLedger.objects.create(
                        tenant=ret.tenant,
                        store=ret.store,
                        variant=ri.sale_line.variant,
                        qty_delta=-ri.qty_returned,
                        balance_after=ii.on_hand,
                        ref_type="WASTE",
                        ref_id=ret.id,
                        note=f"Return #{ret.id} - Wasted (condition: {ri.condition})",
                        created_by=request.user if request.user.is_authenticated else None,
                    )
            # mark finalized and assign code if needed
            if not ret.return_no:
                ret.assign_return_no()
            ret.status = "finalized"
            ret.save(update_fields=["status", "return_no"])

            # NEW: update customer aggregates & loyalty after return
            update_customer_after_return(ret)
            if ret.sale and ret.sale.customer_id:
                try:
                    record_return(ret)
                except Exception:
                    # Don't block return finalization if loyalty update fails
                    pass

        AuditLog.record(
            tenant=ret.tenant,
            user=request.user if request.user.is_authenticated else None,
            sale=ret.sale,
            action="RETURN_FINALIZED",
            severity="info",
            metadata={"return_id": ret.id, "refund_total": str(ret.refund_total)},
        )

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
        AuditLog.record(
            tenant=ret.tenant,
            user=request.user if request.user.is_authenticated else None,
            sale=ret.sale,
            action="RETURN_VOIDED",
            severity="warning",
            metadata={"return_id": ret.id},
        )
        return Response({"id": ret.id, "status": ret.status})
