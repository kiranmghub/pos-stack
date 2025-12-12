# analytics/reports/sales_reports.py
"""
Sales report calculation functions.
Provides summary and detail report calculations for sales data.
"""
import logging
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional, Dict, List, Any
from django.utils import timezone
from django.db.models import Sum, Count, Avg, Q, DecimalField, IntegerField
from django.db.models.functions import TruncDate, TruncWeek, TruncMonth, Coalesce

from orders.models import Sale
from stores.models import Store

logger = logging.getLogger(__name__)


def calculate_sales_summary(
    tenant,
    store_id: Optional[int],
    date_from: datetime,
    date_to: datetime,
    group_by: str = "day",
    tz=None,
) -> Dict[str, Any]:
    """
    Calculate sales summary report with aggregations and time series data.
    
    Args:
        tenant: Tenant instance
        store_id: Optional store ID to filter by store
        date_from: Start datetime (timezone-aware)
        date_to: End datetime (timezone-aware)
        group_by: Grouping period ("day", "week", or "month")
    
    Returns:
        Dictionary with:
            - summary: Total revenue, order count, AOV
            - comparison: Previous period metrics
            - time_series: Array of data points by period
            - store_breakdown: Breakdown by store (if multiple stores)
    """
    # Build base queryset - only completed sales
    qs = Sale.objects.filter(
        tenant=tenant,
        status="completed",
        created_at__gte=date_from,
        created_at__lte=date_to,
    ).select_related("store")
    
    # Filter by store if provided
    if store_id:
        qs = qs.filter(store_id=store_id)
    
    # Calculate summary metrics
    summary_agg = qs.aggregate(
        total_revenue=Coalesce(Sum("total", output_field=DecimalField(max_digits=12, decimal_places=2)), Decimal("0.00")),
        order_count=Count("id", output_field=IntegerField()),
    )
    
    total_revenue = float(summary_agg["total_revenue"] or Decimal("0.00"))
    order_count = int(summary_agg["order_count"] or 0)
    average_order_value = round(total_revenue / order_count, 2) if order_count > 0 else 0.0
    
    # Calculate previous period for comparison
    period_duration = date_to - date_from
    prev_date_to = date_from - timedelta(seconds=1)
    prev_date_from = prev_date_to - period_duration
    
    prev_qs = Sale.objects.filter(
        tenant=tenant,
        status="completed",
        created_at__gte=prev_date_from,
        created_at__lte=prev_date_to,
    )
    
    if store_id:
        prev_qs = prev_qs.filter(store_id=store_id)
    
    prev_agg = prev_qs.aggregate(
        total_revenue=Coalesce(Sum("total", output_field=DecimalField(max_digits=12, decimal_places=2)), Decimal("0.00")),
        order_count=Count("id", output_field=IntegerField()),
    )
    
    prev_revenue = float(prev_agg["total_revenue"] or Decimal("0.00"))
    prev_orders = int(prev_agg["order_count"] or 0)
    prev_aov = round(prev_revenue / prev_orders, 2) if prev_orders > 0 else 0.0
    
    # Calculate growth percentages
    revenue_growth = 0.0
    order_growth = 0.0
    if prev_revenue > 0:
        revenue_growth = round(((total_revenue - prev_revenue) / prev_revenue) * 100, 2)
    elif total_revenue > 0:
        revenue_growth = 100.0  # 100% growth if there was no previous revenue
    
    if prev_orders > 0:
        order_growth = round(((order_count - prev_orders) / prev_orders) * 100, 2)
    elif order_count > 0:
        order_growth = 100.0  # 100% growth if there were no previous orders
    
    # Build time series data based on group_by
    # CRITICAL: Use tenant timezone for TruncDate/TruncWeek/TruncMonth to group by tenant's local date
    # If no timezone provided, default to UTC (should not happen, but defensive)
    if tz is None:
        tz = timezone.utc
    
    time_series = []
    
    if group_by == "day":
        trunc_func = TruncDate("created_at", tzinfo=tz)
        date_format = "%Y-%m-%d"
    elif group_by == "week":
        trunc_func = TruncWeek("created_at", tzinfo=tz)
        date_format = "%Y-%m-%d"  # Will use week start date
    elif group_by == "month":
        trunc_func = TruncMonth("created_at", tzinfo=tz)
        date_format = "%Y-%m"
    else:
        # Default to day
        trunc_func = TruncDate("created_at", tzinfo=tz)
        date_format = "%Y-%m-%d"
    
    # Aggregate by period
    time_series_qs = qs.annotate(period=trunc_func).values("period").annotate(
        revenue=Coalesce(Sum("total", output_field=DecimalField(max_digits=12, decimal_places=2)), Decimal("0.00")),
        orders=Count("id", output_field=IntegerField()),
    ).order_by("period")
    
    # Create period buckets from query results
    # TruncDate/TruncWeek/TruncMonth return datetime objects in the specified timezone
    # Convert to date in the same timezone for consistent comparison
    period_buckets = {}
    for row in time_series_qs:
        period_key = row["period"]
        if period_key:
            # Normalize period key to date in tenant timezone
            # TruncDate/TruncWeek/TruncMonth return timezone-aware datetimes in the specified timezone
            if isinstance(period_key, datetime):
                # Convert to tenant timezone if needed, then extract date
                if period_key.tzinfo != tz:
                    period_key = period_key.astimezone(tz)
                period_date = period_key.date()
            elif hasattr(period_key, "date"):  # Already a date object
                period_date = period_key
            else:
                # Try to convert string or other format
                try:
                    period_date = period_key
                except Exception:
                    continue
            
            period_buckets[period_date] = {
                "revenue": float(row["revenue"] or Decimal("0.00")),
                "orders": int(row["orders"] or 0),
            }
    
    # Generate dense series - iterate through all periods in range
    # Convert date_from/date_to to tenant timezone for period iteration
    date_from_tz = date_from.astimezone(tz) if date_from.tzinfo != tz else date_from
    date_to_tz = date_to.astimezone(tz) if date_to.tzinfo != tz else date_to
    
    seen_periods = set()
    
    # Start from the beginning of the appropriate period in tenant timezone
    if group_by == "day":
        current = date_from_tz.replace(hour=0, minute=0, second=0, microsecond=0)
    elif group_by == "week":
        # Start from Monday of the week containing date_from
        days_since_monday = date_from_tz.weekday()
        current = (date_from_tz - timedelta(days=days_since_monday)).replace(hour=0, minute=0, second=0, microsecond=0)
    else:  # month
        # Start from first day of month containing date_from
        current = date_from_tz.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Iterate through periods
    max_iterations = 1000  # Safety limit to prevent infinite loops
    iterations = 0
    
    while current <= date_to_tz and iterations < max_iterations:
        iterations += 1
        
        # Determine period key based on group_by
        if group_by == "day":
            period_key = current.date()
        elif group_by == "week":
            # Period key is the Monday of this week
            period_key = current.date()
        else:  # month
            # Period key is the first day of this month
            period_key = current.date().replace(day=1)
        
        # Skip if we've already processed this period
        if period_key not in seen_periods:
            seen_periods.add(period_key)
            
            bucket = period_buckets.get(period_key, {"revenue": 0.0, "orders": 0})
            
            # Calculate AOV for this period
            aov = round(bucket["revenue"] / bucket["orders"], 2) if bucket["orders"] > 0 else 0.0
            
            time_series.append({
                "date": period_key.strftime(date_format),
                "revenue": bucket["revenue"],
                "orders": bucket["orders"],
                "aov": aov,
            })
        
        # Move to next period
        if group_by == "day":
            current += timedelta(days=1)
        elif group_by == "week":
            # Move to next Monday (7 days forward)
            current += timedelta(days=7)
        else:  # month
            # Move to first day of next month
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1, day=1)
            else:
                current = current.replace(month=current.month + 1, day=1)
    
    # Store breakdown (only if not filtering by specific store)
    store_breakdown = []
    if not store_id:
        store_breakdown_qs = qs.values("store_id", "store__name", "store__code").annotate(
            revenue=Coalesce(Sum("total", output_field=DecimalField(max_digits=12, decimal_places=2)), Decimal("0.00")),
            orders=Count("id", output_field=IntegerField()),
        ).order_by("-revenue")
        
        for row in store_breakdown_qs:
            store_breakdown.append({
                "store_id": row["store_id"],
                "store_name": row["store__name"] or row["store__code"] or f"Store {row['store_id']}",
                "revenue": float(row["revenue"] or Decimal("0.00")),
                "orders": int(row["orders"] or 0),
            })
    
    return {
        "summary": {
            "total_revenue": total_revenue,
            "order_count": order_count,
            "average_order_value": average_order_value,
            "revenue_growth_percent": revenue_growth,
            "order_growth_percent": order_growth,
        },
        "comparison": {
            "previous_period_revenue": prev_revenue,
            "previous_period_orders": prev_orders,
            "previous_period_aov": prev_aov,
        },
        "time_series": time_series,
        "store_breakdown": store_breakdown,
        "period": {
            "date_from": date_from.isoformat(),
            "date_to": date_to.isoformat(),
            "group_by": group_by,
        },
    }

