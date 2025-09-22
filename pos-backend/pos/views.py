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


# Build absolute URL when we only have a relative path (/media/...)
def _abs(request, url: str) -> str:
    if not url:
        return ""
    return request.build_absolute_uri(url) if url.startswith("/") else url


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

                subtotal = Decimal("0.00")
                total_tax = Decimal("0.00")
                total_fee = Decimal("0.00")

                # Line creation + stock deduction
                for l in lines:
                    variant_id = l.get("variant_id")
                    qty = int(l.get("qty") or 0)
                    unit_price = Decimal(str(l.get("unit_price") or "0"))
                    line_discount = Decimal(str(l.get("line_discount") or "0"))

                    if qty <= 0:
                        continue

                    variant = Variant.objects.select_related("product", "tax_category").get(
                        id=variant_id,
                        product__tenant=tenant,
                    )

                    # tax rate from variant.tax_category.rate (nullable)
                    tax_rate = Decimal(str(getattr(variant.tax_category, "rate", 0) or 0))

                    net = (unit_price * qty) - line_discount
                    tax = (net * tax_rate).quantize(Decimal("0.01"))
                    fee = Decimal("0.00")
                    line_total = (net + tax + fee).quantize(Decimal("0.01"))

                    SaleLine.objects.create(
                        sale=sale,
                        variant=variant,
                        qty=qty,
                        unit_price=unit_price,
                        discount=line_discount,
                        tax=tax,
                        fee=fee,
                        line_total=line_total,
                    )

                    # deduct inventory at this store
                    inv, _ = InventoryItem.objects.select_for_update().get_or_create(
                        tenant=tenant, store=store, variant=variant, defaults={"on_hand": 0, "reserved": 0}
                    )
                    # you already subtract elsewhere; keep consistent:
                    inv.on_hand = (Decimal(inv.on_hand) - Decimal(qty))
                    if inv.on_hand < 0:
                        inv.on_hand = 0
                    inv.save()

                    subtotal += (unit_price * qty) - line_discount
                    total_tax += tax
                    total_fee += fee

                sale.total = (subtotal + total_tax + total_fee).quantize(Decimal("0.01"))
                sale.status = "completed"
                sale.save(update_fields=["total", "status"])

                # assign & persist a receipt number and snapshot
                receipt_no = sale.assign_receipt_no()
                receipt = {
                    "receipt_no": receipt_no,
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
                        "subtotal": str(subtotal.quantize(Decimal("0.01"))),
                        "tax": str(total_tax.quantize(Decimal("0.01"))),
                        "fees": str(total_fee.quantize(Decimal("0.01"))),
                        "grand_total": str(sale.total),
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

