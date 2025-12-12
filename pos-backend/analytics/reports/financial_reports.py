# analytics/reports/financial_reports.py
"""
Financial report calculation functions.
Provides financial summaries including revenue, discounts, taxes, and payment method breakdowns.
"""
import logging
from datetime import datetime
from decimal import Decimal
from typing import Optional, Dict, List, Any
from django.db.models import Sum, Count, Q, DecimalField, IntegerField
from django.db.models.functions import Coalesce

from orders.models import Sale, SaleLine, SalePayment

logger = logging.getLogger(__name__)


def calculate_financial_summary(
    tenant,
    store_id: Optional[int],
    date_from: datetime,
    date_to: datetime,
) -> Dict[str, Any]:
    """
    Calculate financial summary report with aggregations.
    
    Args:
        tenant: Tenant instance
        store_id: Optional store ID to filter by store
        date_from: Start datetime (timezone-aware)
        date_to: End datetime (timezone-aware)
    
    Returns:
        Dictionary with:
            - summary: Total revenue, discounts, taxes, fees, net revenue
            - payment_methods: Breakdown by payment method
            - discount_rules: Breakdown by discount rule
            - tax_rules: Breakdown by tax rule
    """
    # Build base queryset - only completed sales
    sale_qs = Sale.objects.filter(
        tenant=tenant,
        status="completed",
        created_at__gte=date_from,
        created_at__lte=date_to,
    )
    
    if store_id:
        sale_qs = sale_qs.filter(store_id=store_id)
    
    # Get sale IDs for filtering related objects
    sale_ids = sale_qs.values_list("id", flat=True)
    
    # Calculate summary from SaleLine aggregations
    zero = Decimal("0.00")
    zero_int = 0
    
    line_aggregates = SaleLine.objects.filter(
        sale_id__in=sale_ids
    ).aggregate(
        total_revenue=Coalesce(
            Sum("line_total", output_field=DecimalField(max_digits=12, decimal_places=2)),
            zero
        ),
        total_discounts=Coalesce(
            Sum("discount", output_field=DecimalField(max_digits=12, decimal_places=2)),
            zero
        ),
        total_taxes=Coalesce(
            Sum("tax", output_field=DecimalField(max_digits=12, decimal_places=2)),
            zero
        ),
        total_fees=Coalesce(
            Sum("fee", output_field=DecimalField(max_digits=12, decimal_places=2)),
            zero
        ),
    )
    
    total_revenue = float(line_aggregates["total_revenue"] or zero)
    total_discounts = float(line_aggregates["total_discounts"] or zero)
    total_taxes = float(line_aggregates["total_taxes"] or zero)
    total_fees = float(line_aggregates["total_fees"] or zero)
    
    # Net revenue = revenue - discounts (gross revenue after discounts)
    net_revenue = total_revenue - total_discounts
    
    # Get sale count
    sale_count = sale_qs.count()
    
    # Payment method breakdown
    payment_breakdown = SalePayment.objects.filter(
        sale_id__in=sale_ids
    ).values("type").annotate(
        total_amount=Coalesce(
            Sum("amount", output_field=DecimalField(max_digits=12, decimal_places=2)),
            zero
        ),
        payment_count=Count("id", output_field=IntegerField()),
    ).order_by("-total_amount")
    
    payment_methods = []
    for item in payment_breakdown:
        payment_methods.append({
            "method": item["type"],
            "total_amount": float(item["total_amount"] or zero),
            "payment_count": int(item["payment_count"] or zero_int),
        })
    
    # Discount rules breakdown from receipt_data
    discount_rules_map: Dict[str, Dict[str, Any]] = {}
    total_discount_from_rules = Decimal("0.00")
    
    # Iterate through sales to extract discount rules from receipt_data
    for sale in sale_qs.select_related().iterator(chunk_size=100):
        receipt = sale.receipt_data or {}
        totals = receipt.get("totals") or {}
        rules = receipt.get("discount_by_rule") or totals.get("discount_by_rule") or []
        
        for rule in rules:
            amount = Decimal(str(rule.get("amount") or "0"))
            if amount <= 0:
                continue
            
            code = (rule.get("code") or f"RULE-{rule.get('rule_id') or ''}" or "UNKNOWN").upper()
            name = rule.get("name") or code
            
            if code not in discount_rules_map:
                discount_rules_map[code] = {
                    "code": code,
                    "name": name,
                    "total_amount": Decimal("0.00"),
                    "sales_count": set(),
                }
            
            discount_rules_map[code]["total_amount"] += amount
            discount_rules_map[code]["sales_count"].add(sale.id)
            total_discount_from_rules += amount
    
    discount_rules = []
    for code, data in discount_rules_map.items():
        discount_rules.append({
            "code": code,
            "name": data["name"],
            "total_amount": float(data["total_amount"]),
            "sales_count": len(data["sales_count"]),
        })
    discount_rules.sort(key=lambda x: x["total_amount"], reverse=True)
    
    # Tax rules breakdown from receipt_data
    tax_rules_map: Dict[str, Dict[str, Any]] = {}
    total_tax_from_rules = Decimal("0.00")
    
    # Iterate through sales to extract tax rules from receipt_data
    for sale in sale_qs.select_related().iterator(chunk_size=100):
        receipt = sale.receipt_data or {}
        totals = receipt.get("totals") or {}
        tax_rules_list = receipt.get("tax_by_rule") or totals.get("tax_by_rule") or []
        
        for entry in tax_rules_list:
            amount = Decimal(str(entry.get("amount") or "0"))
            if amount <= 0:
                continue
            
            code = (entry.get("code") or f"TAX-{entry.get('rule_id') or ''}" or "UNKNOWN").upper()
            name = entry.get("name") or code
            
            if code not in tax_rules_map:
                tax_rules_map[code] = {
                    "code": code,
                    "name": name,
                    "tax_amount": Decimal("0.00"),
                    "sales_count": set(),
                }
            
            tax_rules_map[code]["tax_amount"] += amount
            tax_rules_map[code]["sales_count"].add(sale.id)
            total_tax_from_rules += amount
    
    tax_rules = []
    for code, data in tax_rules_map.items():
        tax_rules.append({
            "code": code,
            "name": data["name"],
            "tax_amount": float(data["tax_amount"]),
            "sales_count": len(data["sales_count"]),
        })
    tax_rules.sort(key=lambda x: x["tax_amount"], reverse=True)
    
    return {
        "summary": {
            "total_revenue": round(total_revenue, 2),
            "total_discounts": round(total_discounts, 2),
            "total_taxes": round(total_taxes, 2),
            "total_fees": round(total_fees, 2),
            "net_revenue": round(net_revenue, 2),
            "sale_count": sale_count,
            "discount_percentage": round((total_discounts / total_revenue * 100), 2) if total_revenue > 0 else 0.0,
            "tax_percentage": round((total_taxes / total_revenue * 100), 2) if total_revenue > 0 else 0.0,
        },
        "payment_methods": payment_methods,
        "discount_rules": discount_rules,
        "tax_rules": tax_rules,
        "filters": {
            "store_id": store_id,
            "date_from": date_from.isoformat(),
            "date_to": date_to.isoformat(),
        },
    }

