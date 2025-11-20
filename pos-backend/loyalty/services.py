# pos-backend/loyalty/services.py

from decimal import Decimal
from django.utils import timezone

from tenants.models import Tenant
from customers.models import Customer
from orders.models import Sale, Return
from .models import LoyaltyProgram, LoyaltyAccount, LoyaltyTransaction


def _get_program_for_tenant(tenant: Tenant) -> LoyaltyProgram | None:
    try:
        return tenant.loyalty_program
    except LoyaltyProgram.DoesNotExist:
        return None


def _get_or_create_account(customer: Customer) -> LoyaltyAccount | None:
    if not customer.is_loyalty_member:
        return None
    program = _get_program_for_tenant(customer.tenant)
    if not program or not program.is_active:
        return None
    account, _ = LoyaltyAccount.objects.get_or_create(
        tenant=customer.tenant, customer=customer
    )
    return account


def record_earning(sale: Sale) -> None:
    """
    Called after a Sale is created/finalized.
    Uses backend-only logic to compute points.
    """
    customer = getattr(sale, "customer", None)
    if not customer:
        return

    account = _get_or_create_account(customer)
    if not account:
        return

    program = _get_program_for_tenant(customer.tenant)
    if not program or not program.is_active:
        return

    amount = sale.total or Decimal("0.00")
    if amount <= 0:
        return

    # Example: 1 pt per earn_rate currency units
    try:
        earn_rate = program.earn_rate or Decimal("1.00")
    except Exception:
        earn_rate = Decimal("1.00")

    points = int(amount / earn_rate)
    if points <= 0:
        return

    account.points_balance = max(0, account.points_balance + points)
    account.updated_at = timezone.now()
    account.save(update_fields=["points_balance", "updated_at"])

    LoyaltyTransaction.objects.create(
        tenant=account.tenant,
        account=account,
        sale=sale,
        type=LoyaltyTransaction.EARN,
        points=points,
        balance_after=account.points_balance,
        metadata={"sale_id": sale.id},
    )
    # TODO: evaluate tier based on program.tiers & account.points_balance


def record_return(ret: Return) -> None:
    """
    Called after a Return is finalized.
    Optionally deduct points.
    """
    sale = ret.sale
    customer = getattr(sale, "customer", None)
    if not customer:
        return

    account = _get_or_create_account(customer)
    if not account:
        return

    program = _get_program_for_tenant(customer.tenant)
    if not program or not program.is_active:
        return

    amount = ret.refund_total or Decimal("0.00")
    if amount <= 0:
        return

    # Example policy: deduct same # points as originally earned for that amount
    try:
        earn_rate = program.earn_rate or Decimal("1.00")
    except Exception:
        earn_rate = Decimal("1.00")

    points = int(amount / earn_rate)
    if points <= 0:
        return

    account.points_balance = max(0, account.points_balance - points)
    account.updated_at = timezone.now()
    account.save(update_fields=["points_balance", "updated_at"])

    LoyaltyTransaction.objects.create(
        tenant=account.tenant,
        account=account,
        sale=sale,
        type=LoyaltyTransaction.ADJUST,
        points=-points,
        balance_after=account.points_balance,
        metadata={"return_id": ret.id},
    )


def record_redemption(account: LoyaltyAccount, sale: Sale, points: int) -> None:
    """
    Called when a loyalty redemption is applied as part of payment.
    """
    if points <= 0:
        return
    account.points_balance = max(0, account.points_balance - points)
    account.updated_at = timezone.now()
    account.save(update_fields=["points_balance", "updated_at"])
    LoyaltyTransaction.objects.create(
        tenant=account.tenant,
        account=account,
        sale=sale,
        type=LoyaltyTransaction.REDEEM,
        points=-points,
        balance_after=account.points_balance,
        metadata={"sale_id": sale.id},
    )
