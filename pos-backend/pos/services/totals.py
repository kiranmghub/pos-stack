# pos/services/totals.py
from decimal import Decimal, ROUND_HALF_UP
from dataclasses import dataclass
from typing import List, Dict, Any, Optional

from django.utils import timezone
from django.db.models import Q

from taxes.models import TaxRule, TaxScope, ApplyScope
from discounts.models import DiscountRule, DiscountScope, Coupon

CENTS = Decimal("0.01")

def money(q: Decimal) -> Decimal:
    return q.quantize(CENTS, rounding=ROUND_HALF_UP)

@dataclass
class LineIn:
    variant_id: int
    qty: int
    unit_price: Decimal
    tax_category_code: Optional[str] = None
    var_tax_rate: Optional[Decimal] = None
    prod_tax_rate: Optional[Decimal] = None

@dataclass
class RuleAmount:
    rule_id: int
    code: str
    name: str
    amount: Decimal

@dataclass
class ReceiptOut:
    subtotal: Decimal
    discount_total: Decimal
    tax_total: Decimal
    grand_total: Decimal
    tax_by_rule: List[RuleAmount]
    discount_by_rule: List[RuleAmount]
    # optional: per-line details (omit if you don't need them on UI)
    lines: List[Dict[str, Any]]

def _active_tax_rules(tenant, store_id: Optional[int]):
    now = timezone.now()
    base = (TaxRule.objects
            .filter(tenant=tenant, is_active=True)
            .filter(Q(start_at__isnull=True) | Q(start_at__lte=now))
            .filter(Q(end_at__isnull=True) | Q(end_at__gte=now)))
    cond = Q(scope=TaxScope.GLOBAL)
    if store_id:
        cond |= Q(scope=TaxScope.STORE, store_id=store_id)
    return base.filter(cond).order_by("priority", "id")

def _active_discount_rules(tenant, store_id: Optional[int], coupon_code: Optional[str]):
    now = timezone.now()
    base = (DiscountRule.objects
            .filter(tenant=tenant, is_active=True)
            .filter(Q(start_at__isnull=True) | Q(start_at__lte=now))
            .filter(Q(end_at__isnull=True) | Q(end_at__gte=now)))
    cond = Q(scope=DiscountScope.GLOBAL)
    if store_id:
        cond |= Q(scope=DiscountScope.STORE, store_id=store_id)
    rules = list(base.filter(cond).order_by("priority", "id"))

    coupon_rule = None
    if coupon_code:
        c = (Coupon.objects
             .filter(tenant=tenant, code__iexact=coupon_code.strip(), is_active=True)
             .filter(Q(start_at__isnull=True) | Q(start_at__lte=now))
             .filter(Q(end_at__isnull=True) | Q(end_at__gte=now))
             .first())
        if c:
            coupon_rule = c.rule
    return rules, coupon_rule

def _matches_categories(line: LineIn, rule) -> bool:
    cats = [c.code.upper() for c in getattr(rule, "categories").all()] if hasattr(rule, "categories") else []
    if not cats:  # empty means all categories
        return True
    return (line.tax_category_code or "").upper() in cats

def compute_receipt(*, tenant, store_id: Optional[int], lines_in: List[LineIn], coupon_code: Optional[str] = None) -> ReceiptOut:
    # 1) Subtotal
    subtotal = sum((l.unit_price * l.qty for l in lines_in), Decimal("0"))
    subtotal = money(subtotal)

    # 2) Discounts (simple: apply receipt-level then line-level; expand as needed)
    discount_rules, coupon_rule = _active_discount_rules(tenant, store_id, coupon_code)

    # For this pass, we won’t fully model targets; feel free to expand to PRODUCT/VARIANT
    line_discounts = [Decimal("0") for _ in lines_in]
    receipt_discount = Decimal("0")

    ordered = []
    if coupon_rule:
        ordered.append(coupon_rule)
    ordered.extend(discount_rules)

    discount_by_rule_map: Dict[int, RuleAmount] = {}  # NEW

    for r in ordered:
        is_pct = str(r.basis).upper() == "PCT"
        # normalize 20 -> 0.20 (defensive; your models/serializers already normalize)
        rate = Decimal(r.rate or 0)
        if is_pct and rate > 1:
            rate = rate / Decimal("100")

        if str(r.apply_scope).upper() == "LINE":
            acc = Decimal("0")
            for i, l in enumerate(lines_in):
                if not _matches_categories(l, r):
                    continue
                base = l.unit_price * l.qty
                d = money(base * rate) if is_pct else money(Decimal(r.amount or 0) * l.qty)
                line_discounts[i] += d
                acc += d
            if acc > 0:
                discount_by_rule_map[r.id] = RuleAmount(r.id, r.code, r.name, money(discount_by_rule_map.get(r.id, RuleAmount(r.id, r.code, r.name, Decimal("0"))).amount + acc))
        else:
            base = sum((l.unit_price * l.qty for l in lines_in if _matches_categories(l, r)), Decimal("0"))
            d = money(base * rate) if is_pct else money(Decimal(r.amount or 0))
            receipt_discount += d
            if d > 0:
                discount_by_rule_map[r.id] = RuleAmount(r.id, r.code, r.name, money(discount_by_rule_map.get(r.id, RuleAmount(r.id, r.code, r.name, Decimal("0"))).amount + d))



    # clamp line discounts
    for i, l in enumerate(lines_in):
        maxd = l.unit_price * l.qty
        if line_discounts[i] > maxd:
            line_discounts[i] = maxd

    discount_total = money(sum(line_discounts, receipt_discount))

    # 3) Tax on net bases
    tax_rules = list(_active_tax_rules(tenant, store_id))
    tax_by_rule_map: Dict[int, RuleAmount] = {}

    # net lines after line-level discount share (simple: subtract the line discount only)
    net_lines = []
    for i, l in enumerate(lines_in):
        net = (l.unit_price * l.qty) - line_discounts[i]
        net_lines.append((l, money(net)))

    # --- Base variant/product category tax (percent) ---
    base_tax_by_code: Dict[str, Decimal] = {}
    for (lin, net) in net_lines:
        # rate = variant.rate if present, else product.rate, else 0
        rate = lin.var_tax_rate if lin.var_tax_rate is not None else (lin.prod_tax_rate or Decimal("0"))
        if rate and net > 0:
            amt = money(net * rate)
            if amt > 0:
                code = (lin.tax_category_code or "UNCAT").upper()
                base_tax_by_code[code] = money(base_tax_by_code.get(code, Decimal("0")) + amt)

    # fold base taxes into the same per-rule map as pseudo rules
    # note: negative ids so they don't collide with real rule ids
    pseudo_id = -1
    for code, amt in sorted(base_tax_by_code.items()):
        tax_by_rule_map[pseudo_id] = RuleAmount(
            rule_id=pseudo_id,
            code=f"CAT:{code}",
            name=f"Category tax ({code})",
            amount=amt,
        )
        pseudo_id -= 1


    for r in tax_rules:
        acc = Decimal("0")
        # r.apply_scope stored as string, but we also imported ApplyScope for clarity
        if r.apply_scope == ApplyScope.LINE or str(r.apply_scope).upper() == "LINE":
            for (l, net) in net_lines:
                if not _matches_categories(l, r):
                    continue
                if str(r.basis).upper() == "PCT":
                    acc += money(net * Decimal(r.rate or 0))
                else:
                    acc += money(Decimal(r.amount or 0) * l.qty)
        else:
            # RECEIPT
            base = sum((net for (l, net) in net_lines if _matches_categories(l, r)), Decimal("0"))
            if str(r.basis).upper() == "PCT":
                acc += money(base * Decimal(r.rate or 0))
            else:
                acc += money(Decimal(r.amount or 0))

        if acc > 0:
            tax_by_rule_map[r.id] = RuleAmount(
                rule_id=r.id, code=r.code, name=r.name, amount=acc
            )

    tax_by_rule = sorted(
        tax_by_rule_map.values(),
        key=lambda x: (next((t.priority for t in tax_rules if t.id == x.rule_id), 0), x.rule_id),
    )

    discount_rules_all = ordered  # includes coupon first + other rules

    prio_by_id_disc = {r.id: r.priority for r in discount_rules_all if r is not None}
    discount_by_rule = sorted(
        discount_by_rule_map.values(),
        key=lambda x: (prio_by_id_disc.get(x.rule_id, 0), x.rule_id)
    )

    tax_total = money(sum((ra.amount for ra in tax_by_rule), Decimal("0")))
    grand_total = money(subtotal - discount_total + tax_total)

    # Optional per-line detail payload
    lines_out = []
    for i, (l, net) in enumerate(net_lines):
        lines_out.append({
            "variant_id": l.variant_id,
            "qty": l.qty,
            "unit_price": str(money(l.unit_price)),
            "line_subtotal": str(money(l.unit_price * l.qty)),
            "line_discount": str(money(line_discounts[i])),
            "line_net": str(net),
        })

    return ReceiptOut(
        subtotal=money(subtotal),
        discount_total=money(discount_total),
        tax_total=money(tax_total),
        grand_total=money(grand_total),
        tax_by_rule=tax_by_rule,
        discount_by_rule=discount_by_rule,
        lines=lines_out,
    )

def serialize_receipt(ro: ReceiptOut) -> Dict[str, Any]:
    return {
        "subtotal": str(ro.subtotal),
        "discount_total": str(ro.discount_total),
        "tax_total": str(ro.tax_total),
        "grand_total": str(ro.grand_total),
        "tax_by_rule": [
            {"rule_id": x.rule_id, "code": x.code, "name": x.name, "amount": str(x.amount)}
            for x in ro.tax_by_rule
        ],
        "discount_by_rule": [
            {"rule_id": x.rule_id, "code": x.code, "name": x.name, "amount": str(x.amount)}
            for x in ro.discount_by_rule
        ],
        "lines": ro.lines,
    }
