# analytics/reports/returns_reports.py
"""
Returns report calculation functions.
Provides returns analysis including return rates, refunds, and breakdowns by reason and disposition.
"""
import logging
from datetime import datetime
from decimal import Decimal
from typing import Optional, Dict, List, Any
from django.db.models import Sum, Count, Q, DecimalField, IntegerField
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone

from orders.models import Return, ReturnItem, Sale

logger = logging.getLogger(__name__)


def calculate_returns_analysis(
    tenant,
    store_id: Optional[int],
    date_from: datetime,
    date_to: datetime,
    tz=None,
) -> Dict[str, Any]:
    """
    Calculate returns analysis report.
    
    Args:
        tenant: Tenant instance
        store_id: Optional store ID to filter by store
        date_from: Start datetime (timezone-aware)
        date_to: End datetime (timezone-aware)
    
    Returns:
        Dictionary with:
            - summary: Total returns, refunded amount, return rate
            - reason_breakdown: Breakdown by reason code
            - disposition_breakdown: Breakdown by disposition (RESTOCK/WASTE/PENDING)
            - status_breakdown: Breakdown by return status
    """
    # Build base queryset for returns
    returns_qs = Return.objects.filter(
        tenant=tenant,
        created_at__gte=date_from,
        created_at__lte=date_to,
    ).select_related("store", "sale")
    
    if store_id:
        returns_qs = returns_qs.filter(store_id=store_id)
    
    # Calculate summary statistics
    zero = Decimal("0.00")
    zero_int = 0
    
    returns_aggregates = returns_qs.aggregate(
        total_returns=Count("id", distinct=True, output_field=IntegerField()),
        total_refunded=Coalesce(
            Sum("refund_total", output_field=DecimalField(max_digits=12, decimal_places=2)),
            zero
        ),
    )
    
    total_returns = int(returns_aggregates["total_returns"] or zero_int)
    total_refunded = float(returns_aggregates["total_refunded"] or zero)
    
    # Get total sales in same period for return rate calculation
    sales_qs = Sale.objects.filter(
        tenant=tenant,
        status="completed",
        created_at__gte=date_from,
        created_at__lte=date_to,
    )
    
    if store_id:
        sales_qs = sales_qs.filter(store_id=store_id)
    
    total_sales = sales_qs.count()
    
    # Calculate return rate
    return_rate = 0.0
    if total_sales > 0:
        return_rate = round((total_returns / total_sales) * 100, 2)
    
    # Reason code breakdown (from Return model)
    reason_breakdown = returns_qs.exclude(reason_code__isnull=True).exclude(reason_code="").values(
        "reason_code"
    ).annotate(
        return_count=Count("id", distinct=True, output_field=IntegerField()),
        refunded_amount=Coalesce(
            Sum("refund_total", output_field=DecimalField(max_digits=12, decimal_places=2)),
            zero
        ),
    ).order_by("-return_count")
    
    reason_breakdown_list = []
    for item in reason_breakdown:
        reason_breakdown_list.append({
            "reason_code": item["reason_code"] or "UNKNOWN",
            "return_count": int(item["return_count"] or zero_int),
            "refunded_amount": float(item["refunded_amount"] or zero),
        })
    
    # Disposition breakdown (from ReturnItem model)
    # Get return IDs for filtering items
    return_ids = returns_qs.values_list("id", flat=True)
    
    # Aggregate by disposition from ReturnItem
    disposition_breakdown = ReturnItem.objects.filter(
        return_ref_id__in=return_ids
    ).values("disposition").annotate(
        item_count=Count("id", distinct=True, output_field=IntegerField()),
        refunded_amount=Coalesce(
            Sum("refund_total", output_field=DecimalField(max_digits=12, decimal_places=2)),
            zero
        ),
    ).order_by("-item_count")
    
    disposition_breakdown_list = []
    for item in disposition_breakdown:
        disposition_breakdown_list.append({
            "disposition": item["disposition"] or "PENDING",
            "item_count": int(item["item_count"] or zero_int),
            "refunded_amount": float(item["refunded_amount"] or zero),
        })
    
    # Status breakdown
    status_breakdown = returns_qs.values("status").annotate(
        return_count=Count("id", distinct=True, output_field=IntegerField()),
        refunded_amount=Coalesce(
            Sum("refund_total", output_field=DecimalField(max_digits=12, decimal_places=2)),
            zero
        ),
    ).order_by("-return_count")
    
    status_breakdown_list = []
    for item in status_breakdown:
        status_breakdown_list.append({
            "status": item["status"],
            "return_count": int(item["return_count"] or zero_int),
            "refunded_amount": float(item["refunded_amount"] or zero),
        })
    
    # Trend data (daily buckets)
    trend_data: List[Dict[str, Any]] = []
    bucket_tz = tz or timezone.utc
    trend_qs = (
        returns_qs.annotate(bucket=TruncDate("created_at", tzinfo=bucket_tz))
        .values("bucket")
        .annotate(
            return_count=Count("id", distinct=True, output_field=IntegerField()),
            refunded_amount=Coalesce(
                Sum("refund_total", output_field=DecimalField(max_digits=12, decimal_places=2)),
                zero,
            ),
        )
        .order_by("bucket")
    )
    sales_trend_map: Dict[Any, int] = {}
    sales_trend_qs = (
        sales_qs.annotate(bucket=TruncDate("created_at", tzinfo=bucket_tz))
        .values("bucket")
        .annotate(sales_count=Count("id", distinct=True, output_field=IntegerField()))
    )
    for row in sales_trend_qs:
        bucket = row["bucket"]
        if bucket:
            sales_trend_map[bucket] = int(row["sales_count"] or zero_int)
    
    for row in trend_qs:
        bucket = row["bucket"]
        if not bucket:
            continue
        return_count = int(row["return_count"] or zero_int)
        refunded_amount = float(row["refunded_amount"] or zero)
        sales_count = sales_trend_map.get(bucket, 0)
        daily_rate = round((return_count / sales_count) * 100, 2) if sales_count > 0 else 0.0
        trend_data.append(
            {
                "date": bucket.isoformat(),
                "return_count": return_count,
                "refunded_amount": round(refunded_amount, 2),
                "sales_count": sales_count,
                "return_rate": daily_rate,
            }
        )
    
    return {
        "summary": {
            "total_returns": total_returns,
            "total_refunded": round(total_refunded, 2),
            "total_sales": total_sales,
            "return_rate": return_rate,
        },
        "reason_breakdown": reason_breakdown_list,
        "disposition_breakdown": disposition_breakdown_list,
        "status_breakdown": status_breakdown_list,
        "trend": trend_data,
        "filters": {
            "store_id": store_id,
            "date_from": date_from.isoformat(),
            "date_to": date_to.isoformat(),
        },
    }
