from django.shortcuts import render

# Create your views here.
# analytics/views.py
from datetime import datetime, timedelta
from django.db.models import Sum, Count
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from common.api_mixins import IsOwner
from stores.models import Store
from orders.models import Sale   # adjust if your app label differs
from inventory.models import InventoryItem  # or your stock model
from catalog.models import Variant          # or Product/Variant


# Helpers
def today_range(tz):
    now = timezone.now().astimezone(tz)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    return start, end


class OwnerSummaryView(APIView):
    permission_classes = [IsAuthenticated, IsOwner]

    def get(self, request):
        tz = timezone.get_current_timezone()
        tenant = request.tenant

        start, end = today_range(tz)

        qs_today = Sale.objects.filter(store__tenant=tenant, created_at__gte=start, created_at__lt=end)
        agg_today = qs_today.aggregate(revenue=Sum("total"), orders=Count("id"))
        revenue_today = float(agg_today["revenue"] or 0)
        orders_today = int(agg_today["orders"] or 0)
        aov_today = (revenue_today / orders_today) if orders_today else 0.0

        # yesterday for delta
        y_start = start - timedelta(days=1)
        y_end = start
        qs_y = Sale.objects.filter(store__tenant=tenant, created_at__gte=y_start, created_at__lt=y_end)
        y_rev = float(qs_y.aggregate(revenue=Sum("total"))["revenue"] or 0.0)
        delta_pct = ((revenue_today - y_rev) / y_rev * 100.0) if y_rev > 0 else 0.0

        active_stores = Store.objects.filter(tenant=tenant, is_active=True).count() if hasattr(Store, "is_active") else Store.objects.filter(tenant=tenant).count()

        return Response({
            "revenue_today": revenue_today,
            "orders_today": orders_today,
            "aov_today": round(aov_today, 2),
            "active_stores": active_stores,
            "delta_revenue_pct": round(delta_pct, 2),
        })


class OwnerSalesTrendView(APIView):
    permission_classes = [IsAuthenticated, IsOwner]

    def get(self, request):
        tenant = request.tenant
        days = int(request.GET.get("days", 14))
        tz = timezone.get_current_timezone()

        # build per-day buckets
        end = timezone.now().astimezone(tz).replace(hour=23, minute=59, second=59, microsecond=0)
        start = end - timedelta(days=days - 1)

        # group by date
        qs = (
            Sale.objects.filter(store__tenant=tenant, created_at__date__gte=start.date(), created_at__date__lte=end.date())
            .values("created_at__date")
            .annotate(revenue=Sum("total"), orders=Count("id"))
            .order_by("created_at__date")
        )

        # make dense series (fill missing dates with 0)
        bucket = {row["created_at__date"]: row for row in qs}
        out = []
        for i in range(days):
            d = (start + timedelta(days=i)).date()
            row = bucket.get(d)
            revenue = float(row["revenue"]) if row else 0.0
            orders = int(row["orders"]) if row else 0
            out.append({
                "date": d.strftime("%b %d"),
                "revenue": revenue,
                "orders": orders,
            })
        return Response(out)


class OwnerRevenueByStoreView(APIView):
    permission_classes = [IsAuthenticated, IsOwner]

    def get(self, request):
        tenant = request.tenant
        days = int(request.GET.get("days", 30))
        since = timezone.now() - timedelta(days=days)

        qs = (
            Sale.objects.filter(store__tenant=tenant, created_at__gte=since)
            .values("store_id", "store__code", "store__name")
            .annotate(revenue=Sum("total"), orders=Count("id"))
            .order_by("-revenue")
        )

        out = [{
            "store_code": r["store__code"] or str(r["store_id"]),
            "store_name": r["store__name"] or r["store__code"],
            "revenue": float(r["revenue"] or 0),
            "orders": int(r["orders"] or 0),
        } for r in qs]

        return Response(out)


class OwnerTopProductsView(APIView):
    permission_classes = [IsAuthenticated, IsOwner]

    def get(self, request):
        from orders.models import SaleLine  # adjust path if required

        tenant = request.tenant
        limit = int(request.GET.get("limit", 5))
        days = int(request.GET.get("days", 30))
        since = timezone.now() - timedelta(days=days)

        qs = (
            SaleLine.objects
            .filter(sale__store__tenant=tenant, sale__created_at__gte=since)
            .values("variant_id", "variant__sku", "variant__product__name")
            .annotate(
                revenue=Sum("line_total"),  # already stored; avoids calc errors
                qty=Sum("qty"),
            )
            .order_by("-revenue")[:limit]
        )

        out = [{
            "sku": row.get("variant__sku") or f"VAR-{row['variant_id']}",
            "name": row.get("variant__product__name") or row.get("variant__sku") or "Product",
            "revenue": float(row.get("revenue") or 0),
            "qty": int(row.get("qty") or 0),
        } for row in qs]

        return Response(out)