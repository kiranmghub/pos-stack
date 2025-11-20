# pos-backend/customers/services.py

from decimal import Decimal
from django.utils import timezone

from .models import Customer
from orders.models import Sale, Return


def update_customer_after_sale(sale: Sale) -> None:
    """
    Called after a Sale is created/finalized.
    """
    customer = getattr(sale, "customer", None)
    if not customer:
        return
    if customer.tenant_id != sale.tenant_id:
        return

    amount = sale.total or Decimal("0.00")
    customer.total_spend = (customer.total_spend or Decimal("0.00")) + amount
    customer.visits_count = int(customer.visits_count or 0) + 1
    customer.last_purchase_date = sale.created_at or timezone.now()
    customer.recalc_net_spend()
    customer.save(
        update_fields=[
            "total_spend",
            "visits_count",
            "last_purchase_date",
            "net_spend",
        ]
    )


def update_customer_after_return(ret: Return) -> None:
    """
    Called after a Return is finalized.
    """
    sale = ret.sale
    customer = getattr(sale, "customer", None)
    if not customer:
        return
    if customer.tenant_id != sale.tenant_id:
        return

    amount = ret.refund_total or Decimal("0.00")
    customer.total_returns = (customer.total_returns or Decimal("0.00")) + amount
    customer.recalc_net_spend()
    customer.save(update_fields=["total_returns", "net_spend"])
