# analytics/reports/product_reports.py
"""
Product performance report calculation functions.
Provides product-level analytics including revenue, quantity sold, and performance rankings.
"""
import logging
from datetime import datetime
from decimal import Decimal
from typing import Optional, Dict, List, Any
from django.db.models import Sum, Count, Avg, Q, DecimalField, IntegerField, F
from django.db.models.functions import Coalesce

from orders.models import Sale, SaleLine
from catalog.models import Variant, Product

logger = logging.getLogger(__name__)


def calculate_product_performance(
    tenant,
    store_id: Optional[int],
    date_from: datetime,
    date_to: datetime,
    limit: int = 50,
    sort_by: str = "revenue",
) -> Dict[str, Any]:
    """
    Calculate product performance report with aggregations by variant/product.
    
    Args:
        tenant: Tenant instance
        store_id: Optional store ID to filter by store
        date_from: Start datetime (timezone-aware)
        date_to: End datetime (timezone-aware)
        limit: Maximum number of products to return (default: 50)
        sort_by: Sort field - "revenue" or "quantity" (default: "revenue")
    
    Returns:
        Dictionary with:
            - top_products_by_revenue: List of top products sorted by revenue
            - top_products_by_quantity: List of top products sorted by quantity
            - summary: Total products sold, total revenue, total quantity
    """
    # Validate limit
    limit = max(1, min(limit, 500))  # Between 1 and 500
    
    # Build base queryset filtering through Sale -> SaleLine
    # Only include completed sales
    sale_qs = Sale.objects.filter(
        tenant=tenant,
        status="completed",
        created_at__gte=date_from,
        created_at__lte=date_to,
    )
    
    if store_id:
        sale_qs = sale_qs.filter(store_id=store_id)
    
    # Get sale IDs for filtering SaleLines
    sale_ids = sale_qs.values_list("id", flat=True)
    
    # Build SaleLine queryset with joins to Variant and Product
    # Filter by completed sales and tenant (through variant->product)
    qs = SaleLine.objects.filter(
        sale_id__in=sale_ids,
        variant__tenant=tenant,
        variant__product__tenant=tenant,
    ).select_related(
        "variant",
        "variant__product",
    )
    
    # Aggregate by variant
    # Group by variant to get per-variant metrics
    zero = Decimal("0.00")
    zero_int = 0
    
    aggregated = qs.values(
        "variant_id",
        "variant__name",
        "variant__sku",
        "variant__product__id",
        "variant__product__name",
        "variant__product__code",
        "variant__product__category",
    ).annotate(
        revenue=Coalesce(
            Sum("line_total", output_field=DecimalField(max_digits=12, decimal_places=2)),
            zero
        ),
        quantity_sold=Coalesce(
            Sum("qty", output_field=IntegerField()),
            zero_int
        ),
        transaction_count=Count("sale_id", distinct=True),
        avg_unit_price=Coalesce(
            Avg("unit_price", output_field=DecimalField(max_digits=10, decimal_places=2)),
            zero
        ),
    ).order_by()
    
    # Convert to list for processing
    products_list = list(aggregated)
    
    # Calculate total summary
    total_revenue = sum(float(item["revenue"] or zero) for item in products_list)
    total_quantity = sum(int(item["quantity_sold"] or zero_int) for item in products_list)
    total_products = len(products_list)
    
    # Calculate average price for each product (revenue / quantity)
    for item in products_list:
        qty = int(item["quantity_sold"] or zero_int)
        rev = float(item["revenue"] or zero)
        item["avg_price"] = round(rev / qty, 2) if qty > 0 else 0.0
        # Convert Decimal to float for JSON serialization
        item["revenue"] = float(item["revenue"] or zero)
        item["quantity_sold"] = int(item["quantity_sold"] or zero_int)
        item["transaction_count"] = int(item["transaction_count"] or zero_int)
        item["avg_unit_price"] = float(item["avg_unit_price"] or zero)
    
    # Sort by revenue (descending) for top products by revenue
    top_by_revenue = sorted(
        products_list,
        key=lambda x: x["revenue"],
        reverse=True
    )[:limit]
    
    # Sort by quantity (descending) for top products by quantity
    top_by_quantity = sorted(
        products_list,
        key=lambda x: x["quantity_sold"],
        reverse=True
    )[:limit]
    
    # Format response data
    def format_product(item):
        """Format product item for response."""
        return {
            "variant_id": item["variant_id"],
            "variant_name": item["variant__name"] or "",
            "sku": item["variant__sku"] or "",
            "product_id": item["variant__product__id"],
            "product_name": item["variant__product__name"] or "",
            "product_code": item["variant__product__code"] or "",
            "category": item["variant__product__category"] or "",
            "revenue": item["revenue"],
            "quantity_sold": item["quantity_sold"],
            "transaction_count": item["transaction_count"],
            "avg_price": item["avg_price"],
            "avg_unit_price": item["avg_unit_price"],
        }
    
    return {
        "top_products_by_revenue": [format_product(item) for item in top_by_revenue],
        "top_products_by_quantity": [format_product(item) for item in top_by_quantity],
        "summary": {
            "total_products": total_products,
            "total_revenue": round(total_revenue, 2),
            "total_quantity_sold": total_quantity,
        },
        "filters": {
            "store_id": store_id,
            "date_from": date_from.isoformat(),
            "date_to": date_to.isoformat(),
            "limit": limit,
            "sort_by": sort_by,
        },
    }

