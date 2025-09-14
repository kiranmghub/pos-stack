# inventory/api.py
from decimal import Decimal
from django.db import transaction
from django.db.models import (
    Sum, F, Value, IntegerField, OuterRef, Subquery, Q, Count, DecimalField, ExpressionWrapper,
)

from django.db.models.functions import Coalesce, Cast
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status, serializers

from tenants.models import Tenant
from stores.models import Store
from catalog.models import Product, Variant
from inventory.models import InventoryItem, AdjustmentReason, InventoryAdjustment, InventoryAdjustmentLine, StockLedger, \
    InventoryTransfer, InventoryTransferLine


def _resolve_request_tenant(request):
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

def _inventory_summary(items_qs):
    """
    items_qs: InventoryItem queryset already filtered by tenant / store.
    Returns: { total_skus, total_qty, total_value: '0.00' }
    """
    DEC2 = DecimalField(max_digits=18, decimal_places=2)
    INT  = IntegerField()

    # price * qty as Decimal on both sides to avoid int/decimal mixing
    line_value = ExpressionWrapper(
        Cast(F("on_hand"), DEC2) * Cast(F("variant__price"), DEC2),
        output_field=DEC2,
    )

    agg = (
        items_qs
        .select_related("variant")
        .annotate(line_value=line_value)
        .aggregate(
            total_skus=Count("variant_id", distinct=True),
            total_qty=Coalesce(
                Sum("on_hand", output_field=INT),
                Value(0, output_field=INT),
                output_field=INT,
            ),
            total_value=Coalesce(
                Sum("line_value", output_field=DEC2),
                Value(0, output_field=DEC2),
                output_field=DEC2,
            ),
        )
    )

    return {
        "total_skus": int(agg.get("total_skus") or 0),
        "total_qty": int(agg.get("total_qty") or 0),
        "total_value": f"{Decimal(agg.get('total_value') or 0).quantize(Decimal('0.01'))}",
    }



LOW_STOCK_THRESHOLD = 5  # can be made tenant-configurable later


# --------------------------- Serializers ------------------------------------
class VariantStockRowSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    product_name = serializers.CharField()
    sku = serializers.CharField(allow_null=True)
    barcode = serializers.CharField(allow_null=True)
    price = serializers.CharField()
    on_hand = serializers.IntegerField()
    low_stock = serializers.BooleanField()


class LedgerRowSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    created_at = serializers.DateTimeField()
    store_id = serializers.IntegerField()
    variant_id = serializers.IntegerField()
    product_name = serializers.CharField()
    sku = serializers.CharField(allow_null=True)
    qty_delta = serializers.IntegerField()
    balance_after = serializers.IntegerField(allow_null=True)
    ref_type = serializers.CharField()
    ref_id = serializers.IntegerField(allow_null=True)
    note = serializers.CharField(allow_blank=True)


# --------------------------- Views ------------------------------------------
class InventoryOverviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)

        store_id = request.GET.get("store_id")

        # Base queryset (scoped to tenant, optional store)
        items = InventoryItem.objects.filter(tenant=tenant)
        if store_id:
            items = items.filter(store_id=store_id)

        # --- summary (total_skus / total_qty / total_value) ---
        summary = _inventory_summary(items)
        # use the already-formatted string from summary
        on_hand_value = summary["total_value"]  # e.g. "123.45"

        # ---- Low stock items (sum on_hand per variant as integers) ----
        low_rows = (
            items.values("variant_id")
            .annotate(
                q=Coalesce(
                    Sum("on_hand", output_field=IntegerField()),
                    Value(0, output_field=IntegerField()),
                    output_field=IntegerField(),
                )
            )
            .filter(q__lte=LOW_STOCK_THRESHOLD)
        )
        low_count = low_rows.count()

        # recent ledger (10)
        recent_qs = (
            StockLedger.objects.filter(tenant=tenant, store_id=store_id)
            if store_id
            else StockLedger.objects.filter(tenant=tenant)
        )
        recent = recent_qs.select_related("variant__product").order_by("-created_at")[:10]

        recent_data = [
            {
                "id": r.id,
                "created_at": r.created_at,
                "store_id": r.store_id,
                "variant_id": r.variant_id,
                "product_name": r.variant.product.name,
                "sku": r.variant.sku,
                "qty_delta": r.qty_delta,
                "ref_type": r.ref_type,
                "ref_id": r.ref_id,
                "note": r.note,
            }
            for r in recent
        ]

        return Response(
            {
                "on_hand_value": on_hand_value,  # already "0.00" style string
                "low_stock_count": low_count,
                "recent": recent_data,
                "summary": summary,  # kept for UI (contains total_skus/total_qty/total_value)
            },
            status=200,
        )



class StockByStoreListView(APIView):
    """
    GET /api/v1/inventory/stock?store_id=..&q=&category=&page=&page_size=
    Lists variants with on_hand for a specific store (required).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"results": [], "count": 0}, status=200)

        try:
            store_id = int(request.GET.get("store_id") or "0")
        except ValueError:
            store_id = 0
        if not store_id:
            return Response({"error": "store_id required"}, status=400)

        q = (request.GET.get("q") or "").strip()
        category = (request.GET.get("category") or "").strip()
        page = int(request.GET.get("page") or "1")
        page_size = int(request.GET.get("page_size") or "24")

        # Subquery for on_hand in this store
        on_hand_sq = InventoryItem.objects.filter(
            tenant=tenant, store_id=store_id, variant=OuterRef("pk")
        ).values("on_hand")[:1]

        vs = (
            Variant.objects.filter(product__tenant=tenant, is_active=True)
            .annotate(
                on_hand=Coalesce(Subquery(on_hand_sq, output_field=IntegerField()), Value(0, output_field=IntegerField()))
            )
            .select_related("product")
            .order_by("product__name", "sku")
        )

        if q:
            vs = vs.filter(
                Q(product__name__icontains=q) |
                Q(sku__icontains=q) |
                Q(barcode__icontains=q)
            )
        if category:
            # Your catalog exposes Category names; match product.category (CharField)
            vs = vs.filter(product__category__iexact=category)

        total = vs.count()
        start = (page - 1) * page_size
        rows = vs[start:start + page_size]

        data = [{
            "id": v.id,
            "product_name": v.product.name,
            "sku": v.sku,
            "barcode": v.barcode,
            "price": str(v.price),
            "on_hand": int(v.on_hand or 0),
            "low_stock": int(v.on_hand or 0) <= LOW_STOCK_THRESHOLD,
        } for v in rows]

        return Response({"results": data, "count": total}, status=200)


class AdjustmentReasonsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response([], status=200)

        seeds = [
            ("COUNT", "Cycle Count"),
            ("SHRINK", "Shrink / Theft"),
            ("DAMAGE", "Damaged"),
            ("SAMPLE", "Sample"),
            ("CORRECTION", "Correction"),
        ]
        # Auto-seed per tenant if missing
        if not AdjustmentReason.objects.filter(tenant=tenant).exists():
            AdjustmentReason.objects.bulk_create([
                AdjustmentReason(tenant=tenant, code=c, name=n) for c, n in seeds
            ])

        rows = AdjustmentReason.objects.filter(tenant=tenant, is_active=True).order_by("name")
        return Response([{"id": r.id, "code": r.code, "name": r.name} for r in rows], status=200)


class AdjustmentCreateListView(APIView):
    """
    POST /api/v1/inventory/adjustments
      { store_id, reason_code, note?, lines:[{variant_id, delta}, ...] }
    GET  /api/v1/inventory/adjustments?store_id=&page=&page_size=
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"results": [], "count": 0}, status=200)

        page = int(request.GET.get("page") or "1")
        page_size = int(request.GET.get("page_size") or "24")
        qs = InventoryAdjustment.objects.filter(tenant=tenant).select_related("store", "reason", "created_by").order_by("-created_at")

        store_id = request.GET.get("store_id")
        if store_id:
            qs = qs.filter(store_id=store_id)

        total = qs.count()
        start = (page - 1) * page_size
        rows = qs[start:start + page_size]

        data = []
        for a in rows:
            lines = InventoryAdjustmentLine.objects.filter(adjustment=a).select_related("variant__product")
            data.append({
                "id": a.id,
                "created_at": a.created_at,
                "store_id": a.store_id,
                "reason": {"code": a.reason.code, "name": a.reason.name},
                "note": a.note or "",
                "created_by": getattr(a.created_by, "username", None),
                "lines": [{
                    "variant_id": ln.variant_id,
                    "product_name": ln.variant.product.name,
                    "sku": ln.variant.sku,
                    "delta": ln.delta,
                } for ln in lines]
            })

        return Response({"results": data, "count": total}, status=200)

    def post(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)

        payload = request.data or {}
        try:
            store_id = int(payload.get("store_id"))
        except Exception:
            return Response({"error": "store_id required"}, status=400)

        reason_code = (payload.get("reason_code") or "").strip()
        lines = payload.get("lines") or []
        note = payload.get("note") or ""

        if not lines:
            return Response({"error": "lines required"}, status=400)

        store = get_object_or_404(Store, id=store_id, tenant=tenant)
        reason = get_object_or_404(AdjustmentReason, tenant=tenant, code=reason_code)

        # validate lines
        v_ids = []
        clean_lines = []
        for ln in lines:
            try:
                vid = int(ln.get("variant_id"))
                delta = int(ln.get("delta"))
            except Exception:
                return Response({"error": "Invalid line"}, status=400)
            if delta == 0:
                continue
            v_ids.append(vid)
            clean_lines.append((vid, delta))

        if not clean_lines:
            return Response({"error": "No non-zero lines"}, status=400)

        variants = {v.id: v for v in Variant.objects.filter(id__in=v_ids, product__tenant=tenant)}
        if len(variants) != len(set(v_ids)):
            return Response({"error": "Variant not found (tenant scope)"}, status=400)

        with transaction.atomic():
            adj = InventoryAdjustment.objects.create(
                tenant=tenant, store=store, reason=reason, note=note, created_by=request.user
            )

            result_lines = []
            for vid, delta in clean_lines:
                v = variants[vid]
                ln = InventoryAdjustmentLine.objects.create(adjustment=adj, variant=v, delta=delta)

                # Update InventoryItem on_hand atomically
                item, _ = InventoryItem.objects.select_for_update().get_or_create(
                    tenant=tenant, store=store, variant=v, defaults={"on_hand": 0}
                )
                item.on_hand = F("on_hand") + delta
                item.save(update_fields=["on_hand"])
                # refresh balance
                item.refresh_from_db(fields=["on_hand"])

                # Ledger
                lg = StockLedger.objects.create(
                    tenant=tenant, store=store, variant=v,
                    qty_delta=delta, balance_after=item.on_hand,
                    ref_type="ADJUSTMENT", ref_id=adj.id,
                    note=note, created_by=request.user,
                )

                result_lines.append({
                    "variant_id": vid,
                    "delta": delta,
                    "balance_after": item.on_hand,
                })

        return Response({
            "id": adj.id,
            "created_at": adj.created_at,
            "lines": result_lines,
        }, status=201)


class LedgerListView(APIView):
    """
    GET /api/v1/inventory/ledger?store_id=&q=&ref_type=&page=&page_size=
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"results": [], "count": 0}, status=200)

        page = int(request.GET.get("page") or "1")
        page_size = int(request.GET.get("page_size") or "50")
        q = (request.GET.get("q") or "").strip()
        ref_type = (request.GET.get("ref_type") or "").strip()
        store_id = request.GET.get("store_id")

        qs = StockLedger.objects.filter(tenant=tenant).select_related("variant__product").order_by("-created_at")
        if store_id:
            qs = qs.filter(store_id=store_id)
        if ref_type:
            qs = qs.filter(ref_type=ref_type)
        if q:
            qs = qs.filter(
                Q(variant__product__name__icontains=q) |
                Q(variant__sku__icontains=q) |
                Q(note__icontains=q)
            )

        total = qs.count()
        start = (page - 1) * page_size
        rows = qs[start:start + page_size]

        data = [{
            "id": r.id,
            "created_at": r.created_at,
            "store_id": r.store_id,
            "variant_id": r.variant_id,
            "product_name": r.variant.product.name,
            "sku": r.variant.sku,
            "qty_delta": r.qty_delta,
            "balance_after": r.balance_after,
            "ref_type": r.ref_type,
            "ref_id": r.ref_id,
            "note": r.note or "",
        } for r in rows]

        return Response({"results": data, "count": total}, status=200)


# --------------------------- Transfers --------------------------------------
class TransferListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"results": [], "count": 0}, status=200)
        page = int(request.GET.get("page") or "1")
        page_size = int(request.GET.get("page_size") or "24")
        status_f = (request.GET.get("status") or "").strip().upper()
        store_id = request.GET.get("store_id")

        qs = InventoryTransfer.objects.filter(tenant=tenant).select_related("from_store", "to_store", "created_by").order_by("-created_at")
        if status_f:
            qs = qs.filter(status=status_f)
        if store_id:
            qs = qs.filter(Q(from_store_id=store_id) | Q(to_store_id=store_id))

        total = qs.count()
        rows = qs[(page-1)*page_size : page*page_size]
        data = [{
            "id": t.id,
            "created_at": t.created_at,
            "status": t.status,
            "from_store": {"id": t.from_store_id, "code": t.from_store.code, "name": t.from_store.name},
            "to_store": {"id": t.to_store_id, "code": t.to_store.code, "name": t.to_store.name},
            "notes": t.notes or "",
            "lines": [{"variant_id": ln.variant_id, "sku": ln.variant.sku, "product": ln.variant.product.name, "qty": ln.qty} for ln in t.lines.select_related("variant__product")],
        } for t in rows]
        return Response({"results": data, "count": total}, status=200)

    def post(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)
        p = request.data or {}
        try:
            from_store = get_object_or_404(Store, id=int(p.get("from_store_id")), tenant=tenant)
            to_store = get_object_or_404(Store, id=int(p.get("to_store_id")), tenant=tenant)
        except Exception:
            return Response({"error": "from_store_id/to_store_id required"}, status=400)
        if from_store.id == to_store.id:
            return Response({"error": "from_store and to_store must differ"}, status=400)
        raw_lines = p.get("lines") or []
        if not raw_lines:
            return Response({"error": "lines required"}, status=400)

        v_ids = {int(ln.get("variant_id")) for ln in raw_lines if int(ln.get("qty") or 0) != 0}
        variants = {v.id: v for v in Variant.objects.filter(id__in=v_ids, product__tenant=tenant)}
        if len(variants) != len(v_ids):
            return Response({"error": "Variant not found (tenant scope)"}, status=400)

        with transaction.atomic():
            t = InventoryTransfer.objects.create(
                tenant=tenant, from_store=from_store, to_store=to_store, notes=p.get("notes") or "", created_by=request.user
            )
            for ln in raw_lines:
                vid = int(ln.get("variant_id"))
                qty = int(ln.get("qty") or 0)
                if qty == 0:
                    continue
                InventoryTransferLine.objects.create(transfer=t, variant=variants[vid], qty=qty)
        return Response({"id": t.id, "status": t.status}, status=201)


class TransferDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_obj(self, request, pk):
        tenant = _resolve_request_tenant(request)
        return get_object_or_404(InventoryTransfer.objects.select_related("from_store","to_store"), id=pk, tenant=tenant)

    def get(self, request, pk):
        t = self.get_obj(request, pk)
        data = {
            "id": t.id,
            "created_at": t.created_at,
            "status": t.status,
            "from_store": {"id": t.from_store_id, "code": t.from_store.code, "name": t.from_store.name},
            "to_store": {"id": t.to_store_id, "code": t.to_store.code, "name": t.to_store.name},
            "notes": t.notes or "",
            "lines": [{"variant_id": ln.variant_id, "sku": ln.variant.sku, "product": ln.variant.product.name, "qty": ln.qty} for ln in t.lines.select_related("variant__product")],
        }
        return Response(data, status=200)

    def post(self, request, pk):
        """
        Actions via ?action=send|receive|cancel
        """
        t = self.get_obj(request, pk)
        action = (request.GET.get("action") or "").lower()
        if action not in ("send", "receive", "cancel"):
            return Response({"error": "action required: send|receive|cancel"}, status=400)

        if action == "cancel":
            if t.status != "DRAFT":
                return Response({"error": "Only DRAFT can be cancelled"}, status=400)
            t.status = "CANCELLED"
            t.save(update_fields=["status"])
            return Response({"ok": True, "status": t.status})

        if action == "send":
            if t.status != "DRAFT":
                return Response({"error": "Only DRAFT can be sent"}, status=400)
            # decrement from_store, write ledger
            with transaction.atomic():
                for ln in t.lines.select_related("variant"):
                    item, _ = InventoryItem.objects.select_for_update().get_or_create(
                        tenant=t.tenant, store=t.from_store, variant=ln.variant, defaults={"on_hand": 0}
                    )
                    item.on_hand = F("on_hand") - ln.qty
                    item.save(update_fields=["on_hand"])
                    item.refresh_from_db(fields=["on_hand"])
                    StockLedger.objects.create(
                        tenant=t.tenant, store=t.from_store, variant=ln.variant,
                        qty_delta= -ln.qty, balance_after=item.on_hand,
                        ref_type="TRANSFER_OUT", ref_id=t.id, note=t.notes or "", created_by=request.user
                    )
                t.status = "SENT"
                t.save(update_fields=["status"])
            return Response({"ok": True, "status": t.status})

        if action == "receive":
            if t.status != "SENT":
                return Response({"error": "Only SENT can be received"}, status=400)
            # increment to_store, write ledger
            with transaction.atomic():
                for ln in t.lines.select_related("variant"):
                    item, _ = InventoryItem.objects.select_for_update().get_or_create(
                        tenant=t.tenant, store=t.to_store, variant=ln.variant, defaults={"on_hand": 0}
                    )
                    item.on_hand = F("on_hand") + ln.qty
                    item.save(update_fields=["on_hand"])
                    item.refresh_from_db(fields=["on_hand"])
                    StockLedger.objects.create(
                        tenant=t.tenant, store=t.to_store, variant=ln.variant,
                        qty_delta= ln.qty, balance_after=item.on_hand,
                        ref_type="TRANSFER_IN", ref_id=t.id, note=t.notes or "", created_by=request.user
                    )
                t.status = "RECEIVED"
                t.save(update_fields=["status"])
            return Response({"ok": True, "status": t.status})
