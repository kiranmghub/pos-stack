# analytics/reports/customer_reports.py
"""
Customer analytics report calculation functions.
Provides customer-level analytics including lifetime value, repeat customer rate, and top customers.
"""
import logging
from datetime import datetime, date
from decimal import Decimal
from typing import Optional, Dict, List, Any
from django.db.models import Sum, Count, Avg, Q, DecimalField, IntegerField, F, Min
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone

from orders.models import Sale
from customers.models import Customer

logger = logging.getLogger(__name__)


def calculate_customer_analytics(
    tenant,
    store_id: Optional[int],
    date_from: datetime,
    date_to: datetime,
    limit: int = 50,
    tz=None,
) -> Dict[str, Any]:
    """
    Calculate customer analytics report.
    
    Args:
        tenant: Tenant instance
        store_id: Optional store ID to filter by store
        date_from: Start datetime (timezone-aware)
        date_to: End datetime (timezone-aware)
        limit: Maximum number of customers to return in top customers list (default: 50)
    
    Returns:
        Dictionary with:
            - top_customers: List of top customers by revenue
            - summary: Customer metrics (total customers, repeat rate, new vs returning)
            - lifetime_value_stats: Average lifetime value metrics
    """
    # Validate limit
    limit = max(1, min(limit, 500))  # Between 1 and 500
    
    # Build base queryset - only completed sales
    sale_qs = Sale.objects.filter(
        tenant=tenant,
        status="completed",
        created_at__gte=date_from,
        created_at__lte=date_to,
    ).select_related("customer")
    
    if store_id:
        sale_qs = sale_qs.filter(store_id=store_id)
    
    # Get all sales with customers
    sales_with_customers = sale_qs.exclude(customer__isnull=True)
    
    # Calculate summary statistics
    # Collect unique customer IDs once for downstream aggregations
    period_customer_ids = list(
        sales_with_customers.values_list("customer_id", flat=True).distinct()
    )
    unique_customers_in_period = len(period_customer_ids)
    
    # Total sales count (with and without customers)
    total_sales = sale_qs.count()
    sales_with_customer_count = sales_with_customers.count()
    sales_without_customer_count = total_sales - sales_with_customer_count
    
    # Calculate new vs returning customers
    # New customers: first purchase in this period
    # Returning customers: had purchases before this period
    customer_first_sale_map: Dict[int, datetime] = {}
    new_customers = set()
    returning_customers = set()
    
    if period_customer_ids:
        first_sales_qs = Sale.objects.filter(
            tenant=tenant,
            status="completed",
            customer_id__in=period_customer_ids,
        ).values("customer_id").annotate(first_sale_at=Min("created_at"))
        
        for row in first_sales_qs:
            cid = row["customer_id"]
            first_sale_at = row["first_sale_at"]
            if not first_sale_at:
                continue
            customer_first_sale_map[cid] = first_sale_at
            if date_from <= first_sale_at <= date_to:
                new_customers.add(cid)
            elif first_sale_at < date_from:
                returning_customers.add(cid)
    
    # Calculate customer metrics by aggregating from sales
    zero = Decimal("0.00")
    zero_int = 0
    
    # Aggregate customer sales in period
    customer_aggregates = sales_with_customers.values("customer_id").annotate(
        total_revenue=Coalesce(
            Sum("total", output_field=DecimalField(max_digits=12, decimal_places=2)),
            zero
        ),
        sale_count=Count("id", distinct=True, output_field=IntegerField()),
        avg_order_value=Coalesce(
            Avg("total", output_field=DecimalField(max_digits=12, decimal_places=2)),
            zero
        ),
    ).order_by("-total_revenue")[:limit]
    
    # Build top customers list with customer details
    top_customers = []
    customer_ids = [item["customer_id"] for item in customer_aggregates]
    
    # Fetch customer details in bulk
    customers_map = {
        c.id: c for c in Customer.objects.filter(
            id__in=customer_ids,
            tenant=tenant
        ).only("id", "first_name", "last_name", "email", "phone_number")
    }
    
    for item in customer_aggregates:
        customer_id = item["customer_id"]
        customer = customers_map.get(customer_id)
        
        if customer:
            full_name = f"{customer.first_name} {customer.last_name or ''}".strip()
            top_customers.append({
                "customer_id": customer_id,
                "customer_name": full_name or "Unknown",
                "email": customer.email or "",
                "phone": customer.phone_number or "",
                "total_revenue": float(item["total_revenue"] or zero),
                "sale_count": int(item["sale_count"] or zero_int),
                "avg_order_value": float(item["avg_order_value"] or zero),
            })
    
    # Calculate lifetime value from customer model (if available)
    # Get all customers who made purchases in this period
    period_customer_ids = sales_with_customers.values_list("customer_id", flat=True).distinct()
    
    customer_lifetime_stats = Customer.objects.filter(
        id__in=period_customer_ids,
        tenant=tenant
    ).aggregate(
        avg_lifetime_value=Coalesce(
            Avg("total_spend", output_field=DecimalField(max_digits=12, decimal_places=2)),
            zero
        ),
        avg_visits=Coalesce(
            Avg("visits_count", output_field=IntegerField()),
            zero_int
        ),
    )
    
    # Calculate repeat customer rate
    # Repeat customers = customers with more than 1 sale in the period
    repeat_customers_count = sales_with_customers.values("customer_id").annotate(
        sale_count=Count("id")
    ).filter(sale_count__gt=1).count()
    
    repeat_rate = 0.0
    repeat_customers_value = repeat_customers_count
    if unique_customers_in_period > 0:
        repeat_rate = round((repeat_customers_count / unique_customers_in_period) * 100, 2)
    
    # Build trend data (daily)
    bucket_tz = tz or timezone.utc
    new_customers_by_day: Dict[date, int] = {}
    for cid in new_customers:
        first_sale_at = customer_first_sale_map.get(cid)
        if not first_sale_at:
            continue
        if tz and first_sale_at.tzinfo:
            first_sale_local = timezone.localtime(first_sale_at, tz)
        elif first_sale_at.tzinfo:
            first_sale_local = timezone.localtime(first_sale_at)
        else:
            first_sale_local = first_sale_at
        bucket = first_sale_local.date()
        new_customers_by_day[bucket] = new_customers_by_day.get(bucket, 0) + 1
    
    returning_counts_map: Dict[date, int] = {}
    if returning_customers:
        returning_per_day = (
            sales_with_customers.filter(customer_id__in=returning_customers)
            .annotate(bucket=TruncDate("created_at", tzinfo=bucket_tz))
            .values("bucket")
            .annotate(returning_customers=Count("customer_id", distinct=True))
        )
        for row in returning_per_day:
            bucket = row["bucket"]
            if bucket:
                returning_counts_map[bucket] = int(row["returning_customers"] or 0)
    
    sales_trend_map: Dict[date, Dict[str, int]] = {}
    sales_trend_qs = sale_qs.annotate(
        bucket=TruncDate("created_at", tzinfo=bucket_tz)
    ).values("bucket").annotate(
        sales_with_customer=Count("id", filter=Q(customer__isnull=False)),
        sales_without_customer=Count("id", filter=Q(customer__isnull=True)),
    )
    for row in sales_trend_qs:
        bucket = row["bucket"]
        if not bucket:
            continue
        sales_trend_map[bucket] = {
            "sales_with_customer": int(row["sales_with_customer"] or 0),
            "sales_without_customer": int(row["sales_without_customer"] or 0),
        }
    
    trend_data: List[Dict[str, Any]] = []
    for bucket in sorted(sales_trend_map.keys()):
        stats = sales_trend_map[bucket]
        trend_data.append(
            {
                "date": bucket.isoformat(),
                "new_customers": new_customers_by_day.get(bucket, 0),
                "returning_customers": returning_counts_map.get(bucket, 0),
                "sales_with_customers": stats["sales_with_customer"],
                "sales_without_customers": stats["sales_without_customer"],
            }
        )
    
    return {
        "top_customers": top_customers,
        "summary": {
            "total_customers_in_period": unique_customers_in_period,
            "new_customers": len(new_customers),
            "returning_customers": len(returning_customers),
            "repeat_customer_rate": repeat_rate,
            "repeat_customers": repeat_customers_value,
            "total_sales_with_customers": sales_with_customer_count,
            "total_sales_without_customers": sales_without_customer_count,
        },
        "lifetime_value_stats": {
            "avg_lifetime_value": float(customer_lifetime_stats["avg_lifetime_value"] or zero),
            "avg_visits": int(customer_lifetime_stats["avg_visits"] or zero_int),
        },
        "trend": trend_data,
        "filters": {
            "store_id": store_id,
            "date_from": date_from.isoformat(),
            "date_to": date_to.isoformat(),
            "limit": limit,
        },
    }
