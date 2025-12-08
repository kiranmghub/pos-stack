# analytics/vendor_analytics.py
"""
Vendor analytics and scorecard calculations.
Computes metrics like on-time %, average lead time, fill rate, cost variance, and price history.
"""
from decimal import Decimal
from datetime import datetime, timedelta
from django.utils import timezone
from django.db.models import (
    Sum, Avg, Count, Q, F, Max, Min,
    Case, When, Value, IntegerField, DecimalField,
)
from django.db.models.functions import Coalesce

from purchasing.models import Vendor, PurchaseOrder, PurchaseOrderLine


def calculate_on_time_percentage(tenant, vendor_id, days_back=90):
    """
    Calculate on-time delivery percentage for a vendor.
    
    On-time is defined as: received_date <= expected_date (if expected_date exists)
    or received_date <= (submitted_at + lead_time_days) if lead_time_days exists.
    
    Args:
        tenant: Tenant instance
        vendor_id: Vendor ID
        days_back: Number of days to look back (default: 90)
    
    Returns:
        dict with:
            - on_time_percentage: Percentage of orders delivered on time (0-100)
            - total_orders: Total number of orders in period
            - on_time_orders: Number of orders delivered on time
            - late_orders: Number of orders delivered late
            - confidence: Confidence score based on data availability
    """
    end_date = timezone.now()
    start_date = end_date - timedelta(days=days_back)
    
    # Get vendor with lead_time_days
    try:
        vendor = Vendor.objects.get(id=vendor_id, tenant=tenant)
        vendor_lead_time = vendor.lead_time_days
    except Vendor.DoesNotExist:
        return {
            "on_time_percentage": 0.0,
            "total_orders": 0,
            "on_time_orders": 0,
            "late_orders": 0,
            "confidence": 0.0,
        }
    
    # Get completed purchase orders in period
    pos = PurchaseOrder.objects.filter(
        tenant=tenant,
        vendor_id=vendor_id,
        status__in=["RECEIVED", "PARTIAL_RECEIVED"],
        submitted_at__gte=start_date,
        submitted_at__lte=end_date,
    ).select_related("vendor")
    
    total_orders = pos.count()
    if total_orders == 0:
        return {
            "on_time_percentage": 0.0,
            "total_orders": 0,
            "on_time_orders": 0,
            "late_orders": 0,
            "confidence": 0.0,
        }
    
    on_time_count = 0
    late_count = 0
    
    for po in pos:
        if not po.submitted_at:
            continue
        
        # Calculate expected delivery date
        if vendor_lead_time:
            expected_date = po.submitted_at + timedelta(days=vendor_lead_time)
        else:
            # Default to 7 days if no lead time specified
            expected_date = po.submitted_at + timedelta(days=7)
        
        # Use received_at field for accurate tracking (falls back to updated_at if not set)
        received_date = po.received_at or po.updated_at
        
        if received_date <= expected_date:
            on_time_count += 1
        else:
            late_count += 1
    
    on_time_percentage = (on_time_count / total_orders) * 100 if total_orders > 0 else 0.0
    
    # Confidence: higher if more orders
    confidence = min(1.0, total_orders / 10.0)  # Max confidence at 10+ orders
    
    return {
        "on_time_percentage": round(on_time_percentage, 2),
        "total_orders": total_orders,
        "on_time_orders": on_time_count,
        "late_orders": late_count,
        "confidence": round(confidence, 2),
    }


def calculate_average_lead_time(tenant, vendor_id, days_back=90):
    """
    Calculate average lead time for a vendor based on actual delivery times.
    
    Args:
        tenant: Tenant instance
        vendor_id: Vendor ID
        days_back: Number of days to look back (default: 90)
    
    Returns:
        dict with:
            - average_lead_time_days: Average lead time in days
            - min_lead_time_days: Minimum lead time
            - max_lead_time_days: Maximum lead time
            - orders_count: Number of orders used in calculation
            - confidence: Confidence score
    """
    end_date = timezone.now()
    start_date = end_date - timedelta(days=days_back)
    
    # Get completed purchase orders
    pos = PurchaseOrder.objects.filter(
        tenant=tenant,
        vendor_id=vendor_id,
        status__in=["RECEIVED", "PARTIAL_RECEIVED"],
        submitted_at__gte=start_date,
        submitted_at__lte=end_date,
    )
    
    lead_times = []
    for po in pos:
        if not po.submitted_at:
            continue
        
        # Calculate actual lead time (submitted to received)
        # Use received_at for accurate tracking (falls back to updated_at if not set)
        received_date = po.received_at or po.updated_at
        lead_time = (received_date - po.submitted_at).days
        if lead_time >= 0:  # Only count positive lead times
            lead_times.append(lead_time)
    
    if not lead_times:
        return {
            "average_lead_time_days": None,
            "min_lead_time_days": None,
            "max_lead_time_days": None,
            "orders_count": 0,
            "confidence": 0.0,
        }
    
    avg_lead_time = sum(lead_times) / len(lead_times)
    confidence = min(1.0, len(lead_times) / 10.0)
    
    return {
        "average_lead_time_days": round(avg_lead_time, 2),
        "min_lead_time_days": min(lead_times),
        "max_lead_time_days": max(lead_times),
        "orders_count": len(lead_times),
        "confidence": round(confidence, 2),
    }


def calculate_fill_rate(tenant, vendor_id, days_back=90):
    """
    Calculate fill rate (percentage of ordered quantity that was received).
    
    Args:
        tenant: Tenant instance
        vendor_id: Vendor ID
        days_back: Number of days to look back (default: 90)
    
    Returns:
        dict with:
            - fill_rate_percentage: Percentage of ordered quantity received (0-100)
            - total_ordered: Total quantity ordered
            - total_received: Total quantity received
            - orders_count: Number of orders
            - confidence: Confidence score
    """
    end_date = timezone.now()
    start_date = end_date - timedelta(days=days_back)
    
    # Get purchase order lines for completed orders
    lines = PurchaseOrderLine.objects.filter(
        purchase_order__tenant=tenant,
        purchase_order__vendor_id=vendor_id,
        purchase_order__status__in=["RECEIVED", "PARTIAL_RECEIVED"],
        purchase_order__submitted_at__gte=start_date,
        purchase_order__submitted_at__lte=end_date,
    )
    
    total_ordered = lines.aggregate(total=Sum("qty_ordered"))["total"] or 0
    total_received = lines.aggregate(total=Sum("qty_received"))["total"] or 0
    
    orders_count = lines.values("purchase_order").distinct().count()
    
    fill_rate = (total_received / total_ordered * 100) if total_ordered > 0 else 0.0
    
    confidence = min(1.0, orders_count / 10.0)
    
    return {
        "fill_rate_percentage": round(fill_rate, 2),
        "total_ordered": int(total_ordered),
        "total_received": int(total_received),
        "orders_count": orders_count,
        "confidence": round(confidence, 2),
    }


def calculate_cost_variance(tenant, vendor_id, variant_id=None, days_back=90):
    """
    Calculate cost variance for a vendor (price changes over time).
    
    Args:
        tenant: Tenant instance
        vendor_id: Vendor ID
        variant_id: Optional variant ID to filter by specific product
        days_back: Number of days to look back (default: 90)
    
    Returns:
        dict with:
            - average_unit_cost: Average unit cost
            - min_unit_cost: Minimum unit cost
            - max_unit_cost: Maximum unit cost
            - cost_variance: Variance in unit costs
            - price_history: List of price points over time
            - orders_count: Number of orders
    """
    end_date = timezone.now()
    start_date = end_date - timedelta(days=days_back)
    
    lines = PurchaseOrderLine.objects.filter(
        purchase_order__tenant=tenant,
        purchase_order__vendor_id=vendor_id,
        purchase_order__submitted_at__gte=start_date,
        purchase_order__submitted_at__lte=end_date,
    )
    
    if variant_id:
        lines = lines.filter(variant_id=variant_id)
    
    # Only include lines with unit_cost > 0
    lines = lines.filter(unit_cost__gt=0)
    
    costs = list(lines.values_list("unit_cost", flat=True))
    
    if not costs:
        return {
            "average_unit_cost": None,
            "min_unit_cost": None,
            "max_unit_cost": None,
            "cost_variance": None,
            "price_history": [],
            "orders_count": 0,
        }
    
    avg_cost = sum(costs) / len(costs)
    min_cost = min(costs)
    max_cost = max(costs)
    
    # Calculate variance
    variance = sum((c - avg_cost) ** 2 for c in costs) / len(costs) if costs else 0
    
    # Get price history (last 20 price points)
    price_history = list(
        lines.order_by("-purchase_order__submitted_at")
        .values("unit_cost", "purchase_order__submitted_at", "variant_id")
        [:20]
    )
    
    return {
        "average_unit_cost": float(avg_cost),
        "min_unit_cost": float(min_cost),
        "max_unit_cost": float(max_cost),
        "cost_variance": float(variance),
        "price_history": price_history,
        "orders_count": len(costs),
    }


def get_vendor_scorecard(tenant, vendor_id, days_back=90):
    """
    Get comprehensive vendor scorecard with all metrics.
    
    Args:
        tenant: Tenant instance
        vendor_id: Vendor ID
        days_back: Number of days to look back (default: 90)
    
    Returns:
        dict with all vendor metrics:
            - vendor_id: Vendor ID
            - vendor_name: Vendor name
            - on_time_performance: On-time delivery metrics
            - lead_time: Lead time metrics
            - fill_rate: Fill rate metrics
            - cost_variance: Cost variance metrics
            - overall_score: Overall vendor score (0-100)
    """
    try:
        vendor = Vendor.objects.get(id=vendor_id, tenant=tenant)
    except Vendor.DoesNotExist:
        return None
    
    on_time = calculate_on_time_percentage(tenant, vendor_id, days_back)
    lead_time = calculate_average_lead_time(tenant, vendor_id, days_back)
    fill_rate = calculate_fill_rate(tenant, vendor_id, days_back)
    cost_var = calculate_cost_variance(tenant, vendor_id, days_back=days_back)
    
    # Calculate overall score (weighted average)
    # Weights: on-time 40%, fill rate 30%, lead time consistency 20%, cost stability 10%
    overall_score = 0.0
    weight_sum = 0.0
    
    if on_time["confidence"] > 0:
        overall_score += on_time["on_time_percentage"] * 0.4
        weight_sum += 0.4
    
    if fill_rate["confidence"] > 0:
        overall_score += fill_rate["fill_rate_percentage"] * 0.3
        weight_sum += 0.3
    
    # Lead time consistency: lower variance is better (simplified)
    if lead_time["confidence"] > 0 and lead_time["average_lead_time_days"]:
        # Normalize: assume 0-30 days range, lower is better
        lead_time_score = max(0, 100 - (lead_time["average_lead_time_days"] / 30 * 100))
        overall_score += lead_time_score * 0.2
        weight_sum += 0.2
    
    # Cost stability: lower variance is better (simplified)
    if cost_var["orders_count"] > 0 and cost_var["cost_variance"]:
        # Normalize variance (simplified - would need domain knowledge for proper normalization)
        cost_stability_score = max(0, 100 - min(100, cost_var["cost_variance"] * 100))
        overall_score += cost_stability_score * 0.1
        weight_sum += 0.1
    
    # Normalize by actual weights used
    if weight_sum > 0:
        overall_score = overall_score / weight_sum
    else:
        overall_score = 0.0
    
    return {
        "vendor_id": vendor_id,
        "vendor_name": vendor.name,
        "vendor_code": vendor.code,
        "on_time_performance": on_time,
        "lead_time": lead_time,
        "fill_rate": fill_rate,
        "cost_variance": cost_var,
        "overall_score": round(overall_score, 2),
        "period_days": days_back,
        "calculated_at": timezone.now().isoformat(),
    }

