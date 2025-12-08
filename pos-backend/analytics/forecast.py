# analytics/forecast.py
"""
Forecasting and predictive reorder calculations.
Computes sales velocity, predicted stockout dates, and recommended order quantities.
"""
from decimal import Decimal
from datetime import datetime, timedelta
from django.utils import timezone
from django.db.models import Sum, Q, Avg, Count
from django.db.models.functions import TruncDate

from orders.models import SaleLine, Sale
from inventory.models import InventoryItem
from catalog.models import Variant
from purchasing.models import Vendor


def calculate_sales_velocity(tenant, variant_id, store_id=None, days=30):
    """
    Calculate average daily sales velocity for a variant over a specified period.
    
    Args:
        tenant: Tenant instance
        variant_id: Variant ID
        store_id: Optional store ID to filter by store
        days: Number of days to look back (default: 30)
    
    Returns:
        dict with:
            - daily_avg: Average quantity sold per day
            - total_qty: Total quantity sold in period
            - days_with_sales: Number of days with sales
            - period_days: Total days in period
            - confidence: Confidence score (0-1) based on data availability
    """
    end_date = timezone.now()
    start_date = end_date - timedelta(days=days)
    
    # Base queryset: completed sales only
    qs = SaleLine.objects.filter(
        sale__tenant=tenant,
        sale__status="completed",
        variant_id=variant_id,
        sale__created_at__gte=start_date,
        sale__created_at__lte=end_date,
    )
    
    if store_id:
        qs = qs.filter(sale__store_id=store_id)
    
    # Aggregate total quantity sold
    total_qty = qs.aggregate(total=Sum("qty"))["total"] or 0
    
    # Count distinct days with sales
    days_with_sales = (
        qs.annotate(sale_date=TruncDate("sale__created_at"))
        .values("sale_date")
        .distinct()
        .count()
    )
    
    # Calculate daily average
    daily_avg = Decimal(str(total_qty)) / Decimal(str(days)) if days > 0 else Decimal("0")
    
    # Confidence score: higher if more days have sales data
    # Formula: (days_with_sales / period_days) * (1 - min(1, days_with_sales / 10))
    # This gives higher confidence for more consistent sales patterns
    if days_with_sales == 0:
        confidence = Decimal("0")
    else:
        coverage_ratio = Decimal(str(days_with_sales)) / Decimal(str(days))
        consistency_factor = min(Decimal("1"), Decimal(str(days_with_sales)) / Decimal("10"))
        confidence = coverage_ratio * consistency_factor
    
    return {
        "daily_avg": float(daily_avg),
        "total_qty": int(total_qty),
        "days_with_sales": days_with_sales,
        "period_days": days,
        "confidence": float(confidence),
    }


def calculate_predicted_stockout_date(tenant, variant_id, store_id, current_on_hand, daily_velocity):
    """
    Calculate predicted date when stock will run out.
    
    Args:
        tenant: Tenant instance
        variant_id: Variant ID
        store_id: Store ID
        current_on_hand: Current on-hand quantity
        daily_velocity: Average daily sales velocity
    
    Returns:
        dict with:
            - predicted_date: Predicted stockout date (datetime or None if no velocity)
            - days_until_stockout: Days until stockout (int or None)
            - is_at_risk: Boolean indicating if stockout is predicted within 30 days
    """
    if daily_velocity <= 0:
        return {
            "predicted_date": None,
            "days_until_stockout": None,
            "is_at_risk": False,
        }
    
    # Calculate days until stockout
    days_until = int(current_on_hand / daily_velocity) if daily_velocity > 0 else None
    
    if days_until is None:
        return {
            "predicted_date": None,
            "days_until_stockout": None,
            "is_at_risk": False,
        }
    
    predicted_date = timezone.now() + timedelta(days=days_until)
    is_at_risk = days_until <= 30  # At risk if stockout within 30 days
    
    return {
        "predicted_date": predicted_date,
        "days_until_stockout": days_until,
        "is_at_risk": is_at_risk,
    }


def calculate_recommended_order_qty(
    tenant,
    variant_id,
    store_id,
    daily_velocity,
    lead_time_days=None,
    safety_stock_days=None,
    reorder_point=None,
    current_on_hand=0,
):
    """
    Calculate recommended order quantity based on sales velocity, lead time, and safety stock.
    
    Args:
        tenant: Tenant instance
        variant_id: Variant ID
        store_id: Store ID
        daily_velocity: Average daily sales velocity
        lead_time_days: Vendor lead time in days (optional)
        safety_stock_days: Safety stock buffer in days (optional)
        reorder_point: Variant reorder point (optional, from variant.reorder_point)
        current_on_hand: Current on-hand quantity
    
    Returns:
        dict with:
            - recommended_qty: Recommended order quantity
            - calculation_method: Method used for calculation
            - factors: Breakdown of calculation factors
    """
    if daily_velocity <= 0:
        # No sales velocity, use reorder_point if available
        if reorder_point and reorder_point > current_on_hand:
            return {
                "recommended_qty": max(0, reorder_point - current_on_hand),
                "calculation_method": "reorder_point",
                "factors": {
                    "reorder_point": reorder_point,
                    "current_on_hand": current_on_hand,
                },
            }
        return {
            "recommended_qty": 0,
            "calculation_method": "no_data",
            "factors": {},
        }
    
    # Default lead time: 7 days if not specified
    effective_lead_time = lead_time_days if lead_time_days is not None else 7
    
    # Default safety stock: 7 days if not specified
    effective_safety_stock = safety_stock_days if safety_stock_days is not None else 7
    
    # Calculate:
    # 1. Lead time demand (quantity needed during lead time)
    lead_time_demand = daily_velocity * effective_lead_time
    
    # 2. Safety stock (buffer for variability)
    safety_stock_qty = daily_velocity * effective_safety_stock
    
    # 3. Target stock level (lead time demand + safety stock)
    target_stock = lead_time_demand + safety_stock_qty
    
    # 4. Recommended order quantity (target - current on hand)
    recommended_qty = max(0, int(target_stock - current_on_hand))
    
    # If reorder_point exists and is higher, use that as minimum
    if reorder_point and reorder_point > current_on_hand:
        min_qty = reorder_point - current_on_hand
        if recommended_qty < min_qty:
            recommended_qty = min_qty
    
    return {
        "recommended_qty": recommended_qty,
        "calculation_method": "velocity_based",
        "factors": {
            "daily_velocity": daily_velocity,
            "lead_time_days": effective_lead_time,
            "safety_stock_days": effective_safety_stock,
            "lead_time_demand": float(lead_time_demand),
            "safety_stock_qty": float(safety_stock_qty),
            "target_stock": float(target_stock),
            "current_on_hand": current_on_hand,
            "reorder_point": reorder_point,
        },
    }


def get_reorder_forecast(tenant, variant_id, store_id, window_days=30):
    """
    Get comprehensive reorder forecast for a variant at a store.
    
    Args:
        tenant: Tenant instance
        variant_id: Variant ID
        store_id: Store ID
        window_days: Days to look back for sales velocity (default: 30)
    
    Returns:
        dict with:
            - variant_id: Variant ID
            - store_id: Store ID
            - current_on_hand: Current on-hand quantity
            - current_reserved: Current reserved quantity
            - available: Available quantity (on_hand - reserved)
            - sales_velocity: Sales velocity data (7/30/90 day windows)
            - predicted_stockout_date: Predicted stockout information
            - recommended_order_qty: Recommended order quantity
            - confidence_score: Overall confidence score (0-1)
            - is_at_risk: Boolean indicating if item is at risk
    """
    # Get current inventory
    try:
        item = InventoryItem.objects.get(tenant=tenant, store_id=store_id, variant_id=variant_id)
        current_on_hand = int(float(item.on_hand or 0))
        current_reserved = int(float(item.reserved or 0))
    except InventoryItem.DoesNotExist:
        current_on_hand = 0
        current_reserved = 0
    
    available = max(0, current_on_hand - current_reserved)
    
    # Calculate sales velocity for multiple windows
    velocity_7d = calculate_sales_velocity(tenant, variant_id, store_id, days=7)
    velocity_30d = calculate_sales_velocity(tenant, variant_id, store_id, days=30)
    velocity_90d = calculate_sales_velocity(tenant, variant_id, store_id, days=90)
    
    # Use 30-day velocity as primary, fallback to 90-day if 30-day has low confidence
    primary_velocity = velocity_30d
    if velocity_30d["confidence"] < 0.3 and velocity_90d["confidence"] > velocity_30d["confidence"]:
        primary_velocity = velocity_90d
    
    daily_velocity = primary_velocity["daily_avg"]
    
    # Get variant for reorder_point
    try:
        variant = Variant.objects.get(id=variant_id, product__tenant=tenant)
        reorder_point = variant.reorder_point
    except Variant.DoesNotExist:
        reorder_point = None
    
    # Get vendor lead time and safety stock (if variant has a preferred vendor)
    # For now, we'll use defaults. In future, could link variants to vendors
    lead_time_days = None
    safety_stock_days = None
    
    # Calculate predicted stockout
    stockout_info = calculate_predicted_stockout_date(
        tenant, variant_id, store_id, current_on_hand, daily_velocity
    )
    
    # Calculate recommended order quantity
    reorder_info = calculate_recommended_order_qty(
        tenant=tenant,
        variant_id=variant_id,
        store_id=store_id,
        daily_velocity=daily_velocity,
        lead_time_days=lead_time_days,
        safety_stock_days=safety_stock_days,
        reorder_point=reorder_point,
        current_on_hand=current_on_hand,
    )
    
    # Overall confidence score (weighted average of velocity confidence and data availability)
    confidence_score = primary_velocity["confidence"]
    
    return {
        "variant_id": variant_id,
        "store_id": store_id,
        "sku": variant.sku if variant else None,
        "product_name": variant.product.name if variant and variant.product else None,
        "current_on_hand": current_on_hand,
        "current_reserved": current_reserved,
        "available": available,
        "sales_velocity": {
            "7_day": velocity_7d,
            "30_day": velocity_30d,
            "90_day": velocity_90d,
            "primary": {
                "daily_avg": primary_velocity["daily_avg"],
                "confidence": primary_velocity["confidence"],
                "window_days": 30 if primary_velocity == velocity_30d else 90,
            },
        },
        "predicted_stockout_date": stockout_info["predicted_date"].isoformat() if stockout_info["predicted_date"] else None,
        "days_until_stockout": stockout_info["days_until_stockout"],
        "recommended_order_qty": reorder_info["recommended_qty"],
        "reorder_calculation": reorder_info,
        "confidence_score": confidence_score,
        "is_at_risk": stockout_info["is_at_risk"],
    }

