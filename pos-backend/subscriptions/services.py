from datetime import timedelta
from typing import Optional
from decimal import Decimal

from django.utils import timezone
from django.conf import settings

from .models import Plan, PlanPrice, Subscription
from discounts.models import Coupon, DiscountBasis


def get_plan_prices_for_country(country: Optional[str], currency: Optional[str]):
    """
    Return PlanPrice rows filtered by region & currency.
    If country-specific prices exist, prefer them; otherwise use global (blank country).
    """
    qs = PlanPrice.objects.filter(valid_to__isnull=True, plan__is_active=True)
    if currency:
        qs = qs.filter(currency=currency)

    if country:
        region_specific = qs.filter(country_code=country)
        if region_specific.exists():
            return list(region_specific)
    return list(qs.filter(country_code=""))


def _resolve_trial_days(plan: Plan, trial_days: Optional[int]) -> int:
    if trial_days is not None:
        return trial_days
    if getattr(plan, "trial_days", None):
        return plan.trial_days
    return int(getattr(settings, "DEFAULT_SIGNUP_TRIAL_DAYS", 14))


def create_trial_subscription(
    tenant,
    plan: Plan,
    price: PlanPrice,
    trial_days: Optional[int] = None,
    coupon: Optional[Coupon] = None,
    amount_override: Optional[Decimal] = None,
) -> Subscription:
    now = timezone.now()
    trial_days_val = _resolve_trial_days(plan, trial_days)
    trial_end = now + timedelta(days=trial_days_val)

    sub = Subscription.objects.create(
        tenant=tenant,
        plan=plan,
        currency=price.currency,
        amount=amount_override if amount_override is not None else price.amount,
        status=Subscription.STATUS_TRIALING,
        trial_end_at=trial_end,
        current_period_start=now,
        current_period_end=trial_end,
        is_auto_renew=True,
        price_version=price.version,
        coupon=coupon,
    )
    return sub


def _normalize_country(code: Optional[str]) -> Optional[str]:
    return code.upper() if code else None


def validate_signup_coupon(code: str, plan_code: str, country_code: Optional[str], tenant=None) -> Coupon:
    """
    Validate a coupon for signup flow.
    - Must be active, within date window, and (if set) signup-only.
    - Must match allowed plan codes / country codes if provided.
    - Must respect max_uses and per_tenant_limit when tenant is provided.
    """
    now = timezone.now()
    coupon = (
        Coupon.objects.select_related("rule")
        .filter(code__iexact=code.strip())
        .first()
    )
    if not coupon:
        raise ValueError("Coupon not found")

    if not coupon.is_active:
        raise ValueError("Coupon is inactive")
    if coupon.start_at and coupon.start_at > now:
        raise ValueError("Coupon is not active yet")
    if coupon.end_at and coupon.end_at < now:
        raise ValueError("Coupon has expired")
    if coupon.is_signup_only is False:
        # Allow non-signup-only coupons if you want; for now require signup-only to reduce misuse.
        raise ValueError("Coupon not valid for signup")

    if coupon.max_uses is not None and coupon.used_count >= coupon.max_uses:
        raise ValueError("Coupon usage limit reached")

    cc = _normalize_country(country_code)
    if coupon.allowed_plan_codes and plan_code not in coupon.allowed_plan_codes:
        raise ValueError("Coupon not valid for this plan")
    if coupon.allowed_country_codes and cc and cc not in [c.upper() for c in coupon.allowed_country_codes]:
        raise ValueError("Coupon not valid in this country")

    if tenant and coupon.per_tenant_limit:
        tenant_uses = Subscription.objects.filter(tenant=tenant, coupon=coupon).count()
        if tenant_uses >= coupon.per_tenant_limit:
            raise ValueError("Coupon limit reached for this tenant")

    return coupon


def apply_coupon_to_amount(amount: Decimal, coupon: Coupon) -> Decimal:
    """
    Apply coupon's rule to a monetary amount. Floors at 0.
    """
    rule = coupon.rule
    amt = Decimal(amount)
    if rule.basis == DiscountBasis.PERCENT and rule.rate:
        amt = amt * (Decimal("1") - Decimal(rule.rate))
    elif rule.basis == DiscountBasis.FLAT and rule.amount:
        amt = amt - Decimal(rule.amount)
    return amt if amt > 0 else Decimal("0.00")
