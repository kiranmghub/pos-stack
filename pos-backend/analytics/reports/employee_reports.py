# analytics/reports/employee_reports.py
"""
Employee performance report calculation functions.
Provides employee-level analytics including sales by cashier, transaction counts, and return rates.
"""
import logging
from datetime import datetime
from decimal import Decimal
from typing import Optional, Dict, List, Any
from django.db.models import Sum, Count, Avg, Q, DecimalField, IntegerField
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone
from django.contrib.auth import get_user_model

from orders.models import Sale, Return

User = get_user_model()
logger = logging.getLogger(__name__)


def calculate_employee_performance(
    tenant,
    store_id: Optional[int],
    date_from: datetime,
    date_to: datetime,
    limit: int = 50,
    tz=None,
) -> Dict[str, Any]:
    """
    Calculate employee performance report.
    
    Args:
        tenant: Tenant instance
        store_id: Optional store ID to filter by store
        date_from: Start datetime (timezone-aware)
        date_to: End datetime (timezone-aware)
        limit: Maximum number of employees to return (default: 50)
    
    Returns:
        Dictionary with:
            - top_employees: List of top employees by revenue
            - summary: Employee metrics (total employees, total sales, etc.)
    """
    # Validate limit
    limit = max(1, min(limit, 500))  # Between 1 and 500
    
    # Build base queryset - only completed sales
    sale_qs = Sale.objects.filter(
        tenant=tenant,
        status="completed",
        created_at__gte=date_from,
        created_at__lte=date_to,
    ).select_related("cashier")
    
    if store_id:
        sale_qs = sale_qs.filter(store_id=store_id)
    
    # Aggregate by cashier (employee)
    zero = Decimal("0.00")
    zero_int = 0
    
    employee_aggregates = sale_qs.values("cashier_id").annotate(
        total_revenue=Coalesce(
            Sum("total", output_field=DecimalField(max_digits=12, decimal_places=2)),
            zero
        ),
        transaction_count=Count("id", distinct=True, output_field=IntegerField()),
        avg_transaction_value=Coalesce(
            Avg("total", output_field=DecimalField(max_digits=12, decimal_places=2)),
            zero
        ),
    ).order_by("-total_revenue")[:limit]
    
    # Build employee list with user details
    top_employees = []
    employee_ids = [item["cashier_id"] for item in employee_aggregates]
    
    # Fetch user details in bulk
    users_map = {
        u.id: u for u in User.objects.filter(id__in=employee_ids).only(
            "id", "first_name", "last_name", "username", "email"
        )
    }
    
    # Calculate return rates for each employee
    # Get return data for sales processed by these employees
    returns_qs = Return.objects.filter(
        tenant=tenant,
        sale__cashier_id__in=employee_ids,
        sale__created_at__gte=date_from,
        sale__created_at__lte=date_to,
    )
    
    if store_id:
        returns_qs = returns_qs.filter(store_id=store_id)
    
    # Aggregate returns by cashier (from the sale)
    returns_by_cashier = returns_qs.values("sale__cashier_id").annotate(
        return_count=Count("id", distinct=True),
        refunded_total=Coalesce(
            Sum("refund_total", output_field=DecimalField(max_digits=12, decimal_places=2)),
            zero
        ),
    )
    
    returns_map = {
        item["sale__cashier_id"]: {
            "return_count": int(item["return_count"] or zero_int),
            "refunded_total": float(item["refunded_total"] or zero),
        }
        for item in returns_by_cashier
    }
    
    # Build top employees list
    for item in employee_aggregates:
        cashier_id = item["cashier_id"]
        user = users_map.get(cashier_id)
        
        if user:
            full_name = f"{user.first_name or ''} {user.last_name or ''}".strip()
            employee_name = full_name or user.username or f"User #{cashier_id}"
            
            # Get return stats
            return_stats = returns_map.get(cashier_id, {"return_count": 0, "refunded_total": 0.0})
            transaction_count = int(item["transaction_count"] or zero_int)
            
            # Calculate return rate
            return_rate = 0.0
            if transaction_count > 0:
                return_rate = round((return_stats["return_count"] / transaction_count) * 100, 2)
            
            top_employees.append({
                "employee_id": cashier_id,
                "employee_name": employee_name,
                "username": user.username or "",
                "email": getattr(user, "email", "") or "",
                "total_revenue": float(item["total_revenue"] or zero),
                "transaction_count": transaction_count,
                "avg_transaction_value": float(item["avg_transaction_value"] or zero),
                "return_count": return_stats["return_count"],
                "refunded_total": return_stats["refunded_total"],
                "return_rate": return_rate,
            })
    
    # Calculate summary statistics
    total_employees = sale_qs.values("cashier_id").distinct().count()
    total_transactions = sale_qs.count()
    
    # Overall return rate
    total_returns = Return.objects.filter(
        tenant=tenant,
        sale__created_at__gte=date_from,
        sale__created_at__lte=date_to,
    )
    if store_id:
        total_returns = total_returns.filter(store_id=store_id)
    
    total_returns_count = total_returns.count()
    overall_return_rate = 0.0
    if total_transactions > 0:
        overall_return_rate = round((total_returns_count / total_transactions) * 100, 2)
    
    # Trend data (daily revenue, transactions, returns)
    bucket_tz = tz or timezone.utc
    trend_data: List[Dict[str, Any]] = []
    sales_trend = (
        sale_qs.annotate(bucket=TruncDate("created_at", tzinfo=bucket_tz))
        .values("bucket")
        .annotate(
            revenue=Coalesce(
                Sum("total", output_field=DecimalField(max_digits=12, decimal_places=2)),
                zero,
            ),
            transaction_count=Count("id", distinct=True, output_field=IntegerField()),
        )
        .order_by("bucket")
    )
    returns_trend_map: Dict[Any, int] = {}
    returns_trend = (
        total_returns.annotate(bucket=TruncDate("created_at", tzinfo=bucket_tz))
        .values("bucket")
        .annotate(return_count=Count("id"))
    )
    for row in returns_trend:
        bucket = row["bucket"]
        if bucket:
            returns_trend_map[bucket] = int(row["return_count"] or 0)
    
    for row in sales_trend:
        bucket = row["bucket"]
        if not bucket:
            continue
        trend_data.append(
            {
                "date": bucket.isoformat(),
                "total_revenue": float(row["revenue"] or zero),
                "transaction_count": int(row["transaction_count"] or 0),
                "return_count": returns_trend_map.get(bucket, 0),
            }
        )
    
    return {
        "top_employees": top_employees,
        "summary": {
            "total_employees": total_employees,
            "total_transactions": total_transactions,
            "total_returns": total_returns_count,
            "overall_return_rate": overall_return_rate,
        },
        "trend": trend_data,
        "filters": {
            "store_id": store_id,
            "date_from": date_from.isoformat(),
            "date_to": date_to.isoformat(),
            "limit": limit,
        },
    }
