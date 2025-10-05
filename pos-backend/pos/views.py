from django.shortcuts import render

# Create your views here.
# pos/views.py
from decimal import Decimal
from django.db import transaction
from django.db.models import Q, OuterRef, Subquery, Value, IntegerField, DecimalField, Sum, CharField, F, Q
from django.db.models.functions import Coalesce
from rest_framework.views import APIView
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.utils import timezone
from tenants.models import Tenant
from tenants.models import TenantUser

from stores.models import Store, Register
from catalog.models import Variant
from inventory.models import InventoryItem
from orders.models import Sale, SaleLine, SalePayment
from rest_framework import status, permissions

import io
import base64
import qrcode

# --- rules (taxes & discounts) ---
from django.db.models import Q
from django.utils.timezone import now

from taxes.models import (
    TaxRule,
    TaxScope as TScope,
    TaxBasis as TBasis,
    ApplyScope as TApply,
)

from discounts.models import (
    DiscountRule,
    DiscountScope as DScope,
    DiscountBasis as DBasis,
    ApplyScope as DApply,
    DiscountTarget,
    Coupon,
)


from decimal import Decimal, ROUND_HALF_UP

from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from decimal import Decimal
from catalog.models import Variant
from .services.totals import LineIn, compute_receipt, serialize_receipt


CENT = Decimal("0.01")
def round2(x: Decimal) -> Decimal:
    # Always round half up to 2 decimals (cash register behavior)
    return (x or Decimal("0")).quantize(CENT, rounding=ROUND_HALF_UP)


def _resolve_tenant(request):
    # assuming middleware sets request.tenant; adjust as per your project
    return request.tenant

def _resolve_store_id(request):
    sid = request.data.get("store_id") or request.query_params.get("store_id")
    return int(sid) if sid else None


# Build absolute URL when we only have a relative path (/media/...)
def _abs(request, url: str) -> str:
    if not url:
        return ""
    return request.build_absolute_uri(url) if url.startswith("/") else url


def active_tax_rules(tenant, store):
    t = now()
    return (TaxRule.objects
            .filter(tenant=tenant, is_active=True)
            .filter(Q(start_at__isnull=True)|Q(start_at__lte=t),
                    Q(end_at__isnull=True)|Q(end_at__gte=t))
            .filter(Q(scope=TScope.GLOBAL)|Q(scope=TScope.STORE, store=store))
            .order_by("priority", "id"))

def active_discount_rules(tenant, store, coupon_code=None):
    t = now()
    rules = (DiscountRule.objects
             .filter(tenant=tenant, is_active=True)
             .filter(Q(start_at__isnull=True)|Q(start_at__lte=t),
                     Q(end_at__isnull=True)|Q(end_at__gte=t))
             .filter(Q(scope=DScope.GLOBAL)|Q(scope=DScope.STORE, store=store))
             .order_by("priority", "id"))
    coupon = None
    if coupon_code:
        coupon = (Coupon.objects
                  .select_related("rule")
                  .filter(tenant=tenant, code=coupon_code, is_active=True)
                  .filter(Q(start_at__isnull=True)|Q(start_at__lte=t),
                          Q(end_at__isnull=True)|Q(end_at__gte=t))
                  .first())
    return list(rules), coupon

def line_matches_rule(line_ctx, rule):
    """
    line_ctx has: variant_id, product_id, category_id
    """
    if rule.target == DiscountTarget.ALL:
        return True
    if rule.target == DiscountTarget.CATEGORY:
        return rule.categories.filter(id=line_ctx["category_id"]).exists()
    if rule.target == DiscountTarget.PRODUCT:
        return rule.products.filter(id=line_ctx["product_id"]).exists()
    if rule.target == DiscountTarget.VARIANT:
        return rule.variants.filter(id=line_ctx["variant_id"]).exists()
    return False




def _resolve_request_tenant(request):
    """
    Priority:
    1) request.tenant (middleware)
    2) request.auth payload: tenant_id
    3) request.user.tenant or request.user.active_tenant
    """
    t = getattr(request, "tenant", None)
    if t:
        return t
    payload = getattr(request, "auth", None)
    if isinstance(payload, dict) and payload.get("tenant_id"):
        return get_object_or_404(Tenant, id=payload["tenant_id"])
    user = getattr(request, "user", None)
    if user is not None:
        if getattr(user, "tenant", None):
            return user.tenant
        if getattr(user, "active_tenant", None):
            return user.active_tenant
    return None


class POSStoresView(ListAPIView):
    """GET /api/v1/pos/stores  -> stores for tenant"""
    permission_classes = [IsAuthenticated]

    def list(self, request, *args, **kwargs):
        tenant = _resolve_request_tenant(request)
        if tenant is None:
            return Response([], status=200)
        rows = Store.objects.filter(tenant=tenant).values("id", "code", "name")
        return Response(list(rows), status=200)


class ProductsForPOSView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = _resolve_request_tenant(request)
        try:
            store_id = int(request.GET.get("store_id", ""))
        except (TypeError, ValueError):
            return Response({"detail": "store_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        query = (request.GET.get("query") or "").strip()

        # subquery: sum on_hand for this store & tenant per variant
        inv_sub = (
            InventoryItem.objects
            .filter(tenant=tenant, store_id=store_id, variant_id=OuterRef("pk"))
            .values("variant")
            .annotate(total=Sum("on_hand"))
            .values("total")
        )

        qs = (
            Variant.objects.select_related("product", "tax_category")
            .filter(
                product__tenant=tenant,
                product__is_active=True,        # <-- FIX: use double underscore
            )
            .annotate(
                on_hand=Coalesce(Subquery(inv_sub[:1]), Value(0), output_field=IntegerField()),
                tax_rate=F("tax_category__rate"),
            )
        )

        if query:
            qs = qs.filter(
                Q(product__name__icontains=query)
                | Q(sku__icontains=query)
                | Q(barcode__icontains=query)
            )

        def variant_image_url(v):
            # 0) Variant file (best)
            try:
                if getattr(v, "image_file", None) and v.image_file and v.image_file.url:
                    return _abs(request, v.image_file.url)
            except Exception:
                pass

            # 1) Variant URL (next best)
            if (getattr(v, "image_url", "") or "").strip():
                return _abs(request, v.image_url)

            # 2) Product file (fallback)
            try:
                if getattr(v.product, "image_file", None) and v.product.image_file and v.product.image_file.url:
                    return _abs(request, v.product.image_file.url)
            except Exception:
                pass

            # 3) Product URL (last resort)
            return _abs(request, getattr(v.product, "image_url", "") or "")

        data = [
            {
                "id": v.id,
                "name": v.product.name,
                "variant_name": v.name,
                "price": str(v.price),
                "sku": v.sku,
                "barcode": v.barcode,
                "on_hand": int(v.on_hand or 0),
                "tax_rate": str(v.tax_rate or 0),
                "image_url": variant_image_url(v),  # ← NEW
                "representative_image_url": variant_image_url(v),
            }
            for v in qs.order_by("product__name")[:120]
        ]
        return Response(data)



class POSLookupBarcodeView(APIView):
    """GET /api/v1/pos/lookup_barcode?barcode=...&store_id=..."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = _resolve_request_tenant(request)
        if tenant is None:
            return Response({"detail": "No tenant"}, status=200)

        barcode = (request.query_params.get("barcode") or "").strip()
        store_id = request.query_params.get("store_id")

        if not barcode:
            return Response({"detail": "barcode required"}, status=400)

        v = Variant.objects.select_related("product", "tax_category").filter(
            product__tenant=tenant, barcode=barcode
        ).first()
        if not v:
            return Response(None, status=200)

        # stock at store (if given)
        on_hand = 0
        if store_id:
            inv = InventoryItem.objects.filter(variant=v, store_id=store_id).values("on_hand").first()
            if inv:
                on_hand = inv["on_hand"]

        data = {
            "id": v.id,
            "name": getattr(v.product, "name", "") or v.sku,
            "sku": v.sku,
            "barcode": v.barcode,
            "price": str(v.price),
            "tax_rate": str(getattr(v.tax_category, "rate", Decimal("0.00"))),
            "category": getattr(v.product, "category", "") or "",
            "on_hand": on_hand,
        }
        return Response(data, status=200)


class POSCheckoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"detail": "No tenant in context."}, status=400)

        user = request.user

        # Basic payload
        data = request.data or {}
        store_id = data.get("store_id")
        register_id = data.get("register_id")
        lines = data.get("lines") or []
        payment = data.get("payment") or {}

        if not store_id or not lines:
            return Response({"detail": "store_id and lines are required"}, status=400)

        # store + register
        try:
            store = Store.objects.get(id=store_id, tenant=tenant)
        except Store.DoesNotExist:
            return Response({"detail": "Invalid store"}, status=400)

        register = None
        if register_id:
            register = Register.objects.filter(id=register_id, store=store).first()
        if not register:
            register = Register.objects.filter(store=store).first()
        if not register:
            return Response({"detail": "No register configured for this store"}, status=400)

        # cashier must belong to tenant
        if not TenantUser.objects.filter(user=user, tenant=tenant).exists():
            return Response({"detail": "User not in tenant"}, status=403)

        # Build sale lines and compute totals
        try:
            with transaction.atomic():
                sale = Sale.objects.create(
                    tenant=tenant,
                    store=store,
                    register=register,
                    cashier=user,
                    status="pending",
                )

                # subtotal = Decimal("0.00")
                # total_tax = Decimal("0.00")
                # total_fee = Decimal("0.00")
                subtotal = Decimal("0.00")
                total_tax = Decimal("0.00")
                total_fee = Decimal("0.00")
                total_discount = Decimal("0.00")

                # Line creation + stock deduction
                # for l in lines:
                #     variant_id = l.get("variant_id")
                #     qty = int(l.get("qty") or 0)
                #     unit_price = Decimal(str(l.get("unit_price") or "0"))
                #     line_discount = Decimal(str(l.get("line_discount") or "0"))

                #     if qty <= 0:
                #         continue

                #     variant = Variant.objects.select_related("product", "tax_category").get(
                #         id=variant_id,
                #         product__tenant=tenant,
                #     )

                #     # tax rate from variant.tax_category.rate (nullable)
                #     tax_rate = Decimal(str(getattr(variant.tax_category, "rate", 0) or 0))

                #     net = (unit_price * qty) - line_discount
                #     tax = (net * tax_rate).quantize(Decimal("0.01"))
                #     fee = Decimal("0.00")
                #     line_total = (net + tax + fee).quantize(Decimal("0.01"))

                #     SaleLine.objects.create(
                #         sale=sale,
                #         variant=variant,
                #         qty=qty,
                #         unit_price=unit_price,
                #         discount=line_discount,
                #         tax=tax,
                #         fee=fee,
                #         line_total=line_total,
                #     )

                #     # deduct inventory at this store
                #     inv, _ = InventoryItem.objects.select_for_update().get_or_create(
                #         tenant=tenant, store=store, variant=variant, defaults={"on_hand": 0, "reserved": 0}
                #     )
                #     # you already subtract elsewhere; keep consistent:
                #     inv.on_hand = (Decimal(inv.on_hand) - Decimal(qty))
                #     if inv.on_hand < 0:
                #         inv.on_hand = 0
                #     inv.save()

                #     subtotal += (unit_price * qty) - line_discount
                #     total_tax += tax
                #     total_fee += fee
                # Optional coupon from payload
                coupon_code = (data.get("coupon_code") or "").strip() or None

                # Load rules once
                rules_disc, coupon = active_discount_rules(tenant, store, coupon_code)
                rules_tax = active_tax_rules(tenant, store)

                # Track per-rule tax amounts for the receipt (rule_id -> amount, code, name)
                tax_by_rule_map = {}  # { rule_id: {"name": str, "code": str, "amount": Decimal} }

                def _add_tax_for_rule(rule, amount: Decimal):
                    if amount <= 0:
                        return
                    entry = tax_by_rule_map.get(rule.id)
                    if entry:
                        entry["amount"] = round2(entry["amount"] + amount)
                    else:
                        tax_by_rule_map[rule.id] = {
                            "name": rule.name,
                            "code": rule.code,
                            "amount": round2(amount),
                        }

                # Helper to aggregate misc taxes (non-rule)        
                def _add_tax_misc(key: str, name: str, code: str, amount: Decimal):
                    """
                    Aggregate non-rule taxes (e.g., base category tax) in tax_by_rule_map.
                    `key` should be unique per logical bucket (e.g., 'base:PAINT').
                    """
                    if amount <= 0:
                        return
                    entry = tax_by_rule_map.get(key)
                    if entry:
                        entry["amount"] = round2(entry["amount"] + amount)
                    else:
                        tax_by_rule_map[key] = {"name": name, "code": code, "amount": round2(amount)}


                # Enforce coupon max uses (if applicable) before spending any work
                if coupon and coupon.max_uses is not None and coupon.used_count >= coupon.max_uses:
                    return Response({"detail": "Coupon usage limit reached"}, status=400)


                # Track lines for receipt-level rules
                lines_payload = []

                # ---- line-by-line processing ----
                for l in lines:
                    variant_id = l.get("variant_id")
                    qty = int(l.get("qty") or 0)
                    unit_price = Decimal(str(l.get("unit_price") or "0"))

                    if qty <= 0:
                        continue

                    variant = Variant.objects.select_related("product", "tax_category", "product__tax_category").get(
                        id=variant_id,
                        product__tenant=tenant,
                    )

                    # category resolution (variant -> product -> None)
                    category_id = (getattr(variant.tax_category, "id", None)
                                or getattr(getattr(variant, "product", None), "tax_category_id", None))

                    # base net is unit * qty, rounded per POS standard
                    base_net = round2(unit_price * qty)

                    # ------- LINE DISCOUNTS (coupon first, then rules in priority order) -------
                    line_discount = Decimal("0.00")

                    # Coupon rule on lines (if any)
                    if coupon and (coupon.rule.apply_scope == DApply.LINE):
                        ctx = {"variant_id": variant.id, "product_id": variant.product_id, "category_id": category_id}
                        if line_matches_rule(ctx, coupon.rule):
                            if coupon.rule.basis == DBasis.PERCENT:
                                line_discount += round2(base_net * (coupon.rule.rate or Decimal("0")))
                            else:
                                line_discount += round2((coupon.rule.amount or Decimal("0.00")) * qty)

                    # Regular discount rules
                    for dr in rules_disc:
                        if dr.apply_scope != DApply.LINE:
                            continue
                        ctx = {"variant_id": variant.id, "product_id": variant.product_id, "category_id": category_id}
                        if not line_matches_rule(ctx, dr):
                            continue
                        if dr.basis == DBasis.PERCENT:
                            line_discount += round2(base_net * (dr.rate or Decimal("0")))
                        else:
                            line_discount += round2((dr.amount or Decimal("0.00")) * qty)
                        if not dr.stackable:
                            break

                    # clamp
                    if line_discount > base_net:
                        line_discount = base_net

                    net = round2(base_net - line_discount)

                    # ------- LINE TAX RULES -------
                    line_tax = Decimal("0.00")
                    applied_any = False

                    if rules_tax.exists():
                        for tr in rules_tax:
                            if tr.apply_scope != TApply.LINE:
                                continue
                            # category matching (if rule has categories)
                            if tr.categories.exists() and not tr.categories.filter(id=category_id).exists():
                                continue
                            # compute rule amount for this line
                            if tr.basis == TBasis.PERCENT:
                                amt = round2(net * (tr.rate or Decimal("0")))
                            else:
                                amt = round2((tr.amount or Decimal("0.00")) * qty)

                            if amt > 0:
                                line_tax += amt
                                _add_tax_for_rule(tr, amt)
                                applied_any = True
                                

                    # --- Always add base category tax (variant -> product -> 0) ---
                    var_rate = getattr(getattr(variant, "tax_category", None), "rate", None)
                    prod_rate = getattr(getattr(getattr(variant, "product", None), "tax_category", None), "rate", None)
                    cat_rate = Decimal(str(var_rate if var_rate is not None else (prod_rate or 0)))
                    if cat_rate and net > 0:
                        base_amt = round2(net * cat_rate)
                        if base_amt > 0:
                            line_tax += base_amt
                            cat_code = (
                                getattr(getattr(variant, "tax_category", None), "code", None) or
                                getattr(getattr(getattr(variant, "product", None), "tax_category", None), "code", None) or
                                "UNCAT"
                            )
                            _add_tax_misc(
                                key=f"base:{cat_code}",
                                name=f"Category tax ({str(cat_code).upper()})",
                                code=f"CAT:{str(cat_code).upper()}",
                                amount=base_amt,
                            )


                    fee = Decimal("0.00")
                    line_total = round2(net + line_tax + fee)

                    # Create the sale line (discount is the authoritative per-line discount)
                    SaleLine.objects.create(
                        sale=sale,
                        variant=variant,
                        qty=qty,
                        unit_price=unit_price,
                        discount=line_discount,
                        tax=line_tax,
                        fee=fee,
                        line_total=line_total,
                    )

                    # Deduct inventory at this store
                    inv, _ = InventoryItem.objects.select_for_update().get_or_create(
                        tenant=tenant, store=store, variant=variant, defaults={"on_hand": 0, "reserved": 0}
                    )
                    inv.on_hand = (Decimal(inv.on_hand) - Decimal(qty))
                    if inv.on_hand < 0:
                        inv.on_hand = 0
                    inv.save()

                    # Totals
                    subtotal += net
                    total_tax += line_tax
                    total_fee += fee
                    total_discount += line_discount

                    lines_payload.append({"net": net, "qty": qty, "category_id": category_id})

                
                # ---- RECEIPT-LEVEL DISCOUNTS ----
                receipt_discount = Decimal("0.00")
                # Coupon at receipt level
                if coupon and (coupon.rule.apply_scope == DApply.RECEIPT):
                    ok_min = (not coupon.min_subtotal) or (subtotal >= coupon.min_subtotal)
                    if ok_min:
                        if coupon.rule.basis == DBasis.PERCENT:
                            receipt_discount += round2(subtotal * (coupon.rule.rate or Decimal("0")))
                        else:
                            receipt_discount += round2(coupon.rule.amount or Decimal("0.00"))

                # Other receipt discount rules
                for dr in rules_disc:
                    if dr.apply_scope != DApply.RECEIPT:
                        continue
                    if dr.basis == DBasis.PERCENT:
                        receipt_discount += round2(subtotal * (dr.rate or Decimal("0")))
                    else:
                        receipt_discount += round2(dr.amount or Decimal("0.00"))
                    if not dr.stackable:
                        break

                if receipt_discount > subtotal:
                    receipt_discount = subtotal

                subtotal = round2(subtotal - receipt_discount)
                total_discount = round2(total_discount + receipt_discount)

                # ---- RECEIPT-LEVEL TAX RULES ----
                for tr in rules_tax:
                    if tr.apply_scope != TApply.RECEIPT:
                        continue
                    # base_net is subtotal of all lines or only matching categories
                    if tr.categories.exists():
                        cat_ids = set(tr.categories.values_list("id", flat=True))
                        base_net = round2(sum(ln["net"] for ln in lines_payload if ln["category_id"] in cat_ids))
                    else:
                        base_net = subtotal
                    if tr.basis == TBasis.PERCENT:
                        amt = round2(base_net * (tr.rate or Decimal("0")))
                    else:
                        amt = round2(tr.amount or Decimal("0.00"))

                    if amt > 0:
                        total_tax += amt
                        _add_tax_for_rule(tr, amt)


                # === BEGIN: canonical totals via compute_receipt (parity with quote) ===

                # Build variant map with tax codes + rates (like POSQuoteView)
                req_lines = data.get("lines") or []
                ids = [int(l.get("variant_id")) for l in req_lines]
                variants = (
                    Variant.objects
                    .select_related("tax_category", "product__tax_category")
                    .filter(id__in=ids)
                )
                vmap = {}
                for v in variants:
                    tc = getattr(v, "tax_category", None)
                    ptc = getattr(getattr(v, "product", None), "tax_category", None)
                    vmap[v.id] = {
                        "code": getattr(tc, "code", None),
                        "var_rate": getattr(tc, "rate", None),
                        "prod_rate": getattr(ptc, "rate", None),
                    }

                # Build LineIn[]
                lines_in = []
                for l in req_lines:
                    vid = int(l["variant_id"])
                    qty = int(l["qty"])
                    up  = Decimal(str(l.get("unit_price")))
                    info = vmap.get(vid, {})
                    lines_in.append(LineIn(
                        variant_id=vid,
                        qty=qty,
                        unit_price=up,
                        tax_category_code=info.get("code"),
                        var_tax_rate=Decimal(str(info.get("var_rate") or "0")),
                        prod_tax_rate=Decimal(str(info.get("prod_rate") or "0")),
                    ))

                # Compute authoritative receipt
                ro = compute_receipt(
                    tenant=tenant,
                    store_id=store.id if store else None,
                    lines_in=lines_in,
                    coupon_code=data.get("coupon_code") or None,
                )

                # Override any earlier ad-hoc totals with canonical values
                subtotal        = Decimal(str(ro.subtotal))
                total_discount  = Decimal(str(ro.discount_total))
                total_tax       = Decimal(str(ro.tax_total))
                total_fee       = Decimal("0.00")  # keep if you calculate fees separately
                grand_total     = Decimal(str(ro.grand_total))

                # === END: canonical totals via compute_receipt ===

                # Persist sale with canonical total
                sale.total = round2(grand_total)
                sale.status = "completed"
                sale.save(update_fields=["total", "status"])

                # Build a sorted list of per-rule taxes: sort by rule priority then id
                priority_by_id = {r.id: r.priority for r in rules_tax}
                tax_by_rule = sorted(
                    (
                        {"rule_id": rid, "code": info["code"], "name": info["name"], "amount": str(info["amount"])}
                        for rid, info in tax_by_rule_map.items()
                    ),
                    key=lambda x: (priority_by_id.get(x["rule_id"], 0), x["rule_id"])
                )

                # Merge base (misc) taxes into the rule list and stringify amounts
                rule_priority = {r.id: r.priority for r in rules_tax}
                combined = []

                # real rules
                for rid, info in tax_by_rule_map.items():
                    if isinstance(rid, int):  # real rule
                        combined.append({
                            "rule_id": rid,
                            "code": info["code"],
                            "name": info["name"],
                            "amount": str(info["amount"]),
                            "_prio": rule_priority.get(rid, 0),
                            "_id": rid,
                        })

                # misc (base category) taxes
                for key, info in tax_by_rule_map.items():
                    if not isinstance(key, int):  # misc bucket
                        combined.append({
                            "rule_id": None,
                            "code": info["code"],
                            "name": info["name"],
                            "amount": str(info["amount"]),
                            "_prio": -1,   # show before rules, or set to 0 if you want to mix
                            "_id": 0,
                        })

                tax_by_rule = sorted(combined, key=lambda x: (x["_prio"], x["_id"]))
                for x in tax_by_rule:
                    x.pop("_prio", None)
                    x.pop("_id", None)



                # build receipt (add discount field)
                receipt = {
                    "receipt_no": sale.assign_receipt_no(),
                    "tenant": {"id": tenant.id, "code": tenant.code, "name": tenant.name},
                    "store": {"id": store.id, "code": store.code, "name": store.name},
                    "register": {"id": register.id},
                    "cashier": {"id": user.id, "username": user.username},
                    "created_at": timezone.localtime(sale.created_at).isoformat(),
                    "lines": [
                        {
                            "variant_id": sl.variant_id,
                            "name": sl.variant.product.name,
                            "sku": sl.variant.sku,
                            "qty": sl.qty,
                            "unit_price": str(sl.unit_price),
                            "discount": str(sl.discount),
                            "tax": str(sl.tax),
                            "fee": str(sl.fee),
                            "line_total": str(sl.line_total),
                        }
                        for sl in sale.lines.select_related("variant__product")
                    ],
                    "totals": {
                        "subtotal": str(ro.subtotal),           # pre-discount subtotal
                            "discount": str(ro.discount_total),
                            "tax": str(ro.tax_total),
                            "fees": "0.00",
                            "grand_total": str(ro.grand_total),
                            "tax_by_rule": [
                                {"rule_id": x.rule_id, "code": x.code, "name": x.name, "amount": str(x.amount)}
                                for x in ro.tax_by_rule
                            ],
                            "discount_by_rule": [
                                {"rule_id": x.rule_id, "code": x.code, "name": x.name, "amount": str(x.amount)}
                                for x in ro.discount_by_rule
                            ],
                        },
                }


                # Payment handling (cash + card) + receipt QR
                def _qr_data_url(text: str) -> str:
                    img = qrcode.make(text)
                    buf = io.BytesIO()
                    img.save(buf, format="PNG")
                    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")

                p_type = (payment.get("type") or "").upper()
                amount = Decimal(str(payment.get("amount") or "0"))
                received = Decimal(str(payment.get("received") or payment.get("cash_received") or "0"))

                # Generate a QR for the receipt regardless of payment type
                qr_text = f"sale:{sale.id}|receipt:{sale.receipt_no}"
                qr_png_data_url = _qr_data_url(qr_text)
                receipt["qr_png_data_url"] = qr_png_data_url

                if p_type == "CASH":
                    print("Received", str(received), "Total:", sale.total)
                    # Validate cash
                    if received < sale.total:
                        return Response({"detail": "Insufficient cash received"}, status=400)

                    change = (received - sale.total).quantize(Decimal("0.01"))

                    SalePayment.objects.create(
                        sale=sale,
                        type="CASH",
                        amount=sale.total,
                        received=received,
                        change=change,
                        meta={"source": "pos"},
                    )

                    receipt["payment"] = {
                        "type": "CASH",
                        "amount": str(sale.total),
                        "received": str(received),
                        "change": str(change),
                    }

                elif p_type == "CARD":
                    # print("Received", str(received), "Amount:", amount, "Total:", sale.total)
                    # For card, require exact capture == total
                    if amount != sale.total:
                        return Response({"detail": "Card amount must match sale total."}, status=400)

                    card_brand = payment.get("card_brand")
                    card_last4 = payment.get("card_last4")
                    card_auth_code = payment.get("card_auth_code")
                    card_reference = payment.get("card_reference")

                    SalePayment.objects.create(
                        sale=sale,
                        type="CARD",
                        amount=amount,
                        meta={
                            "source": "pos",
                            "card_brand": card_brand,
                            "card_last4": card_last4,
                            "card_auth_code": card_auth_code,
                            "card_reference": card_reference,
                        },
                    )

                    receipt["payment"] = {
                        "type": "CARD",
                        "amount": str(amount),
                        "card_brand": card_brand or "",
                        "card_last4": card_last4 or "",
                        "card_auth_code": card_auth_code or "",
                        "card_reference": card_reference or "",
                    }

                    # For card there is no change due
                    change = Decimal("0.00")

                else:
                    return Response({"detail": "Unsupported payment type"}, status=400)

                # Persist the enriched receipt (now with QR + payment info)
                sale.receipt_data = receipt
                sale.save(update_fields=["receipt_no", "receipt_data"])

                # If a coupon was applied, mark usage (safe to do inside the same transaction)
                if coupon:
                    Coupon.objects.filter(id=coupon.id).update(used_count=F("used_count") + 1)


        except Variant.DoesNotExist:
            return Response({"detail": "Variant not found"}, status=400)

        return Response(
            {
                "ok": True,
                "sale_id": sale.id,
                "receipt": receipt,  # <— include this
                "qr_png_data_url": qr_png_data_url,  # <— include this
                "receipt_no": sale.receipt_no,
                "receipt_qr_png": sale.receipt_data.get("qr_png_data_url") if isinstance(sale.receipt_data, dict) else None,
                "change": str(change) if 'change' in locals() else "0.00",
                "total": str(sale.total),
            },
            status=201,
        )



class POSQuoteView(APIView):
    """
    POST /api/v1/pos/quote
    Body:
    {
      "store_id": 1,
      "coupon_code": "HOLIDAY25",   (optional)
      "lines": [
        {"variant_id": 123, "qty": 2, "unit_price": "9.99"},
        ...
      ]
    }
    Response:
    {"ok": true, "quote": { subtotal, discount_total, tax_total, grand_total, tax_by_rule: [...], lines: [...] }}
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        tenant = _resolve_tenant(request)
        store_id = _resolve_store_id(request)
        body = request.data or {}
        lines = body.get("lines") or []
        coupon_code = body.get("coupon_code") or None

        if not store_id:
            return Response({"ok": False, "detail": "store_id required"}, status=400)
        if not lines:
            return Response({"ok": True, "quote": {
                "subtotal": "0.00", "discount_total": "0.00", "tax_total": "0.00", "grand_total": "0.00",
                "tax_by_rule": [], "lines": []
            }})

        # We attempt to pull tax category codes from Variants so category-scoped rules work
        # variant_map = {
        #     v.id: (v.tax_category.code if getattr(v, "tax_category", None) else None)
        #     for v in Variant.objects.filter(id__in=[l.get("variant_id") for l in lines])
        # }

        ids = [l.get("variant_id") for l in lines]
        variants = (
            Variant.objects
            .select_related("tax_category", "product__tax_category")
            .filter(id__in=ids)
        )

        variant_map = {}
        for v in variants:
            tc = getattr(v, "tax_category", None)
            ptc = getattr(getattr(v, "product", None), "tax_category", None)
            variant_map[v.id] = {
                "code": getattr(tc, "code", None),
                "var_rate": getattr(tc, "rate", None),
                "prod_rate": getattr(ptc, "rate", None),
            }

        lines_in = []
        for l in lines:
            try:
                vid = int(l["variant_id"])
                qty = int(l["qty"])
                up  = Decimal(str(l.get("unit_price")))
            except Exception:
                return Response({"ok": False, "detail": "Invalid line payload"}, status=400)
            info = variant_map.get(vid, {})
            lines_in.append(LineIn(
                variant_id=vid,
                qty=qty,
                unit_price=up,
                # tax_category_code=variant_map.get(vid),
                tax_category_code=info.get("code"),
                var_tax_rate=Decimal(str(info.get("var_rate") or "0")),
                prod_tax_rate=Decimal(str(info.get("prod_rate") or "0")),

            ))

        ro = compute_receipt(tenant=tenant, store_id=store_id, lines_in=lines_in, coupon_code=coupon_code)
        return Response({"ok": True, "quote": serialize_receipt(ro)})