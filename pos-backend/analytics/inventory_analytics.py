# analytics/inventory_analytics.py
"""
Inventory analytics: Shrinkage, Aging, and Cycle Count Coverage.
Provides actionable reports from ledger and count data.
"""
from decimal import Decimal
from datetime import datetime, timedelta
from django.utils import timezone
from django.db.models import (
    Sum, Count, Q, F, Value, IntegerField, DecimalField,
    Case, When, OuterRef, Subquery, Exists,
)
from django.db.models.functions import Coalesce, TruncDate

from inventory.models import StockLedger, InventoryAdjustment, InventoryAdjustmentLine
from inventory.models_counts import CountSession, CountLine
from catalog.models import Variant, Product
from orders.models import SaleLine, Sale
from stores.models import Store


def calculate_shrinkage(tenant, store_id=None, days_back=90, reason_code=None):
    """
    Calculate shrinkage from count sessions and adjustments.
    Shrinkage is defined as negative deltas from count reconciliations and adjustments.
    
    Args:
        tenant: Tenant instance
        store_id: Optional store ID to filter by store
        days_back: Number of days to look back (default: 90)
        reason_code: Optional adjustment reason code to filter by
    
    Returns:
        dict with:
            - total_shrinkage: Total shrinkage quantity (sum of negative deltas)
            - shrinkage_by_reason: Breakdown by adjustment reason
            - count_reconciliations: Shrinkage from cycle counts
            - adjustments: Shrinkage from manual adjustments
            - period_days: Period analyzed
            - confidence: Confidence score
    """
    end_date = timezone.now()
    start_date = end_date - timedelta(days=days_back)
    
    # Get shrinkage from StockLedger entries with negative deltas
    # Shrinkage comes from:
    # 1. COUNT_RECONCILE entries (from cycle counts)
    # 2. ADJUSTMENT entries with negative deltas
    
    ledger_qs = StockLedger.objects.filter(
        tenant=tenant,
        qty_delta__lt=0,  # Only negative deltas (shrinkage)
        created_at__gte=start_date,
        created_at__lte=end_date,
    ).select_related("store", "variant")
    
    if store_id:
        ledger_qs = ledger_qs.filter(store_id=store_id)
    
    # Filter by reason if specified
    if reason_code:
        # For adjustments, filter by reason code
        adjustment_ids = InventoryAdjustment.objects.filter(
            tenant=tenant,
            reason__code=reason_code,
        ).values_list("id", flat=True)
        ledger_qs = ledger_qs.filter(
            Q(ref_type="ADJUSTMENT", ref_id__in=adjustment_ids) |
            Q(ref_type="COUNT_RECONCILE")
        )
    
    # Calculate total shrinkage
    total_shrinkage = abs(ledger_qs.aggregate(
        total=Sum("qty_delta")
    )["total"] or 0)
    
    # Breakdown by ref_type
    count_reconcile_shrinkage = abs(ledger_qs.filter(
        ref_type="COUNT_RECONCILE"
    ).aggregate(total=Sum("qty_delta"))["total"] or 0)
    
    adjustment_shrinkage = abs(ledger_qs.filter(
        ref_type="ADJUSTMENT"
    ).aggregate(total=Sum("qty_delta"))["total"] or 0)
    
    # Breakdown by adjustment reason
    shrinkage_by_reason = {}
    adjustment_ledgers = ledger_qs.filter(ref_type="ADJUSTMENT")
    
    for ledger_entry in adjustment_ledgers:
        try:
            adjustment = InventoryAdjustment.objects.get(id=ledger_entry.ref_id)
            reason_code = adjustment.reason.code
            reason_name = adjustment.reason.name
            
            if reason_code not in shrinkage_by_reason:
                shrinkage_by_reason[reason_code] = {
                    "code": reason_code,
                    "name": reason_name,
                    "quantity": 0,
                    "count": 0,
                }
            
            shrinkage_by_reason[reason_code]["quantity"] += abs(ledger_entry.qty_delta)
            shrinkage_by_reason[reason_code]["count"] += 1
        except InventoryAdjustment.DoesNotExist:
            # Skip if adjustment not found
            continue
    
    # Add count reconcile as a category
    if count_reconcile_shrinkage > 0:
        shrinkage_by_reason["COUNT_RECONCILE"] = {
            "code": "COUNT_RECONCILE",
            "name": "Cycle Count Variance",
            "quantity": int(count_reconcile_shrinkage),
            "count": ledger_qs.filter(ref_type="COUNT_RECONCILE").count(),
        }
    
    # Confidence: higher if more data points
    total_entries = ledger_qs.count()
    confidence = min(1.0, total_entries / 20.0)  # Max confidence at 20+ entries
    
    return {
        "total_shrinkage": int(total_shrinkage),
        "shrinkage_by_reason": list(shrinkage_by_reason.values()),
        "count_reconciliations": {
            "quantity": int(count_reconcile_shrinkage),
            "count": ledger_qs.filter(ref_type="COUNT_RECONCILE").count(),
        },
        "adjustments": {
            "quantity": int(adjustment_shrinkage),
            "count": ledger_qs.filter(ref_type="ADJUSTMENT").count(),
        },
        "period_days": days_back,
        "total_entries": total_entries,
        "confidence": round(confidence, 2),
    }


def calculate_aging(tenant, store_id=None, days_no_sales=90):
    """
    Identify variants with no sales in X days (aging inventory).
    
    Args:
        tenant: Tenant instance
        store_id: Optional store ID to filter by store
        days_no_sales: Number of days without sales to consider as aging (default: 90)
    
    Returns:
        dict with:
            - aging_variants: List of variants with no sales in period
            - total_aging_value: Total value of aging inventory
            - aging_by_category: Breakdown by product category
            - period_days: Period analyzed
    """
    end_date = timezone.now()
    start_date = end_date - timedelta(days=days_no_sales)
    
    # Get all variants for tenant (select_related product for later use)
    variants_qs = Variant.objects.filter(
        product__tenant=tenant,
        is_active=True,
    ).select_related("product")
    
    # Get variants with sales in the period
    sales_variant_ids = SaleLine.objects.filter(
        sale__tenant=tenant,
        sale__status="completed",
        sale__created_at__gte=start_date,
        sale__created_at__lte=end_date,
    )
    
    if store_id:
        sales_variant_ids = sales_variant_ids.filter(sale__store_id=store_id)
    
    sales_variant_ids = sales_variant_ids.values_list("variant_id", flat=True).distinct()
    
    # Find variants with no sales (aging inventory)
    aging_variants_qs = variants_qs.exclude(id__in=sales_variant_ids)
    
    # Get inventory for aging variants
    aging_data = []
    total_value = Decimal("0")
    variant_category_map = {}  # Build category map while iterating
    
    for variant in aging_variants_qs:
        # Get inventory for this variant
        inventory_qs = variant.inventoryitem_set.filter(tenant=tenant)
        if store_id:
            inventory_qs = inventory_qs.filter(store_id=store_id)
        
        total_on_hand = inventory_qs.aggregate(
            total=Sum("on_hand")
        )["total"] or Decimal("0")
        
        if total_on_hand > 0:
            # Calculate value (on_hand * cost or price)
            # Use variant price as proxy for value
            variant_value = total_on_hand * Decimal(str(variant.price or 0))
            total_value += variant_value
            
            # Get last sale date (if any)
            last_sale = SaleLine.objects.filter(
                sale__tenant=tenant,
                variant=variant,
                sale__status="completed",
            )
            if store_id:
                last_sale = last_sale.filter(sale__store_id=store_id)
            
            last_sale = last_sale.order_by("-sale__created_at").first()
            last_sale_date = last_sale.sale.created_at if last_sale else None
            
            aging_data.append({
                "variant_id": variant.id,
                "sku": variant.sku,
                "product_name": variant.product.name if variant.product else variant.name,
                "variant_name": variant.name,
                "on_hand": int(float(total_on_hand)),
                "value": float(variant_value),
                "last_sale_date": last_sale_date.isoformat() if last_sale_date else None,
                "days_since_last_sale": (end_date - last_sale_date).days if last_sale_date else None,
            })
            
            # Build category map while we have the variant
            if variant.id not in variant_category_map:
                category_name = "Uncategorized"
                if variant.product and variant.product.category:
                    # category is a CharField (string), not a ForeignKey
                    category_name = variant.product.category.strip()
                    if not category_name:
                        category_name = "Uncategorized"
                variant_category_map[variant.id] = category_name
    
    # Sort by value (descending)
    aging_data.sort(key=lambda x: x["value"], reverse=True)
    
    # Breakdown by category (using the map we built)
    
    aging_by_category = {}
    for item in aging_data:
        variant_id = item["variant_id"]
        category_name = variant_category_map.get(variant_id, "Uncategorized")
        
        if category_name not in aging_by_category:
            aging_by_category[category_name] = {
                "category": category_name,
                "variant_count": 0,
                "total_quantity": 0,
                "total_value": Decimal("0"),
            }
        
        aging_by_category[category_name]["variant_count"] += 1
        aging_by_category[category_name]["total_quantity"] += item["on_hand"]
        aging_by_category[category_name]["total_value"] += Decimal(str(item["value"]))
    
    # Convert Decimal to float for JSON serialization
    for category in aging_by_category.values():
        category["total_value"] = float(category["total_value"])
    
    return {
        "aging_variants": aging_data,
        "total_aging_value": float(total_value),
        "total_aging_quantity": sum(item["on_hand"] for item in aging_data),
        "aging_by_category": list(aging_by_category.values()),
        "period_days": days_no_sales,
        "variant_count": len(aging_data),
    }


def calculate_count_coverage(tenant, store_id=None, days_back=90):
    """
    Compute percentage of catalog counted within given period.
    
    Args:
        tenant: Tenant instance
        store_id: Optional store ID to filter by store
        days_back: Number of days to look back (default: 90)
    
    Returns:
        dict with:
            - coverage_percentage: Percentage of catalog counted
            - total_variants: Total active variants
            - counted_variants: Number of variants counted in period
            - count_sessions: Number of count sessions in period
            - period_days: Period analyzed
    """
    end_date = timezone.now()
    start_date = end_date - timedelta(days=days_back)
    
    # Get total active variants for tenant
    total_variants = Variant.objects.filter(
        product__tenant=tenant,
        is_active=True,
    ).count()
    
    if total_variants == 0:
        return {
            "coverage_percentage": 0.0,
            "total_variants": 0,
            "counted_variants": 0,
            "count_sessions": 0,
            "period_days": days_back,
        }
    
    # Get count sessions in period
    count_sessions_qs = CountSession.objects.filter(
        tenant=tenant,
        status="FINALIZED",
        finalized_at__gte=start_date,
        finalized_at__lte=end_date,
    )
    
    if store_id:
        count_sessions_qs = count_sessions_qs.filter(store_id=store_id)
    
    count_sessions_count = count_sessions_qs.count()
    
    # Get unique variants counted in these sessions
    counted_variant_ids = CountLine.objects.filter(
        session__in=count_sessions_qs,
    ).values_list("variant_id", flat=True).distinct()
    
    counted_variants = len(counted_variant_ids)
    
    # Calculate coverage percentage
    coverage_percentage = (counted_variants / total_variants * 100) if total_variants > 0 else 0.0
    
    return {
        "coverage_percentage": round(coverage_percentage, 2),
        "total_variants": total_variants,
        "counted_variants": counted_variants,
        "count_sessions": count_sessions_count,
        "period_days": days_back,
    }


def get_inventory_health_summary(tenant, store_id=None, days_back=90, aging_days=90):
    """
    Get comprehensive inventory health summary.
    
    Args:
        tenant: Tenant instance
        store_id: Optional store ID to filter by store
        days_back: Number of days to look back for shrinkage/coverage (default: 90)
        aging_days: Number of days without sales to consider as aging (default: 90)
    
    Returns:
        dict with shrinkage, aging, and coverage metrics
    """
    shrinkage = calculate_shrinkage(tenant, store_id, days_back)
    aging = calculate_aging(tenant, store_id, aging_days)
    coverage = calculate_count_coverage(tenant, store_id, days_back)
    
    return {
        "shrinkage": shrinkage,
        "aging": aging,
        "coverage": coverage,
        "calculated_at": timezone.now().isoformat(),
    }

