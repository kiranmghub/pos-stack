# pos-backend/inventory/api.py
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
from inventory.utils import tenant_default_reorder_point


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

# --------------------------- Serializers ------------------------------------
class VariantStockRowSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    product_name = serializers.CharField()
    sku = serializers.CharField(allow_null=True)
    barcode = serializers.CharField(allow_null=True)
    price = serializers.CharField()
    on_hand = serializers.IntegerField()
    low_stock = serializers.BooleanField()
    low_stock_threshold = serializers.IntegerField()
    reorder_point = serializers.IntegerField(required=False, allow_null=True)


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
        default_threshold = tenant_default_reorder_point(tenant)

        # Base queryset (scoped to tenant, optional store)
        items = InventoryItem.objects.filter(tenant=tenant).select_related("variant__product")
        if store_id:
            items = items.filter(store_id=store_id)
        
        # Apply filters
        category_id = request.GET.get("category_id")
        search = (request.GET.get("search") or "").strip()
        
        if category_id:
            try:
                items = items.filter(variant__product__category_id=int(category_id))
            except (ValueError, TypeError):
                pass
        
        if search:
            items = items.filter(
                Q(variant__product__name__icontains=search) |
                Q(variant__sku__icontains=search) |
                Q(variant__barcode__icontains=search)
            )

        # --- summary (total_skus / total_qty / total_value) ---
        summary = _inventory_summary(items)
        # use the already-formatted string from summary
        on_hand_value = summary["total_value"]  # e.g. "123.45"

        # ---- Low stock items (sum on_hand per variant as integers) ----
        threshold_value = Value(default_threshold, output_field=IntegerField())
        low_rows = (
            items.values("variant_id")
            .annotate(
                total_qty=Coalesce(
                    Sum("on_hand", output_field=IntegerField()),
                    Value(0, output_field=IntegerField()),
                    output_field=IntegerField(),
                ),
                threshold=Coalesce(
                    F("variant__reorder_point"),
                    threshold_value,
                    output_field=IntegerField(),
                ),
            )
            .filter(total_qty__lte=F("threshold"))
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

        # Count transfers in transit
        transfers_in_transit = InventoryTransfer.objects.filter(
            tenant=tenant,
            status__in=["IN_TRANSIT", "PARTIAL_RECEIVED"]
        )
        if store_id:
            transfers_in_transit = transfers_in_transit.filter(
                Q(from_store_id=store_id) | Q(to_store_id=store_id)
            )
        transfers_in_transit_count = transfers_in_transit.count()

        return Response(
            {
                "on_hand_value": on_hand_value,  # already "0.00" style string
                "low_stock_count": low_count,
                "low_stock_threshold_default": default_threshold,
                "recent": recent_data,
                "summary": summary,  # kept for UI (contains total_skus/total_qty/total_value)
                "transfers_in_transit_count": transfers_in_transit_count,
                "currency": {
                    "code": getattr(tenant, "resolved_currency", None) or getattr(tenant, "currency_code", "USD"),
                    "symbol": getattr(tenant, "currency_symbol", None),
                    "precision": getattr(tenant, "currency_precision", 2),
                },
            },
            status=200,
        )



class StockAcrossStoresView(APIView):
    """
    GET /api/v1/inventory/stock-across-stores?variant_id=X
    Returns stock availability for a variant across all active stores in the tenant.
    Used for cross-store stock lookup in POS.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)

        try:
            variant_id = int(request.GET.get("variant_id") or "0")
        except ValueError:
            return Response({"error": "variant_id required and must be a number"}, status=400)
        
        if not variant_id:
            return Response({"error": "variant_id required"}, status=400)

        # Verify variant exists and belongs to tenant
        try:
            variant = Variant.objects.get(id=variant_id, product__tenant=tenant, is_active=True)
        except Variant.DoesNotExist:
            return Response({"error": "Variant not found"}, status=404)

        default_threshold = tenant_default_reorder_point(tenant)
        default_threshold_value = Value(default_threshold, output_field=IntegerField())

        # Get all active stores in tenant
        stores = Store.objects.filter(tenant=tenant, is_active=True).order_by("name")

        # Build stock data for each store
        stock_data = []
        for store in stores:
            # Get inventory item for this variant in this store
            try:
                item = InventoryItem.objects.get(tenant=tenant, store=store, variant=variant)
                on_hand = int(item.on_hand) if item.on_hand else 0
            except InventoryItem.DoesNotExist:
                on_hand = 0

            # Calculate threshold (variant reorder_point or tenant default)
            threshold = variant.reorder_point if variant.reorder_point is not None else default_threshold
            low_stock = on_hand <= threshold if threshold > 0 else False

            stock_data.append({
                "store_id": store.id,
                "store_name": store.name,
                "store_code": store.code,
                "on_hand": on_hand,
                "low_stock": low_stock,
                "low_stock_threshold": threshold,
            })

        return Response({
            "variant_id": variant.id,
            "variant_name": variant.name or variant.product.name,
            "variant_sku": variant.sku,
            "stores": stock_data,
        }, status=200)


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
        default_threshold = tenant_default_reorder_point(tenant)
        default_threshold_value = Value(default_threshold, output_field=IntegerField())

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
                on_hand=Coalesce(Subquery(on_hand_sq, output_field=IntegerField()), Value(0, output_field=IntegerField())),
                low_stock_threshold=Coalesce(
                    F("reorder_point"),
                    default_threshold_value,
                    output_field=IntegerField(),
                ),
            )
            .select_related("product", "product__tax_category")
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

        data = []
        for v in rows:
            on_hand = int(v.on_hand or 0)
            threshold = int(getattr(v, "low_stock_threshold", None) or 0)
            data.append({
                "id": v.id,
                "product_name": v.product.name,
                "sku": v.sku,
                "barcode": v.barcode,
                "price": str(v.price),
                "on_hand": on_hand,
                "low_stock": on_hand <= threshold,
                "low_stock_threshold": threshold,
                "reorder_point": v.reorder_point,
            })

        return Response({
            "results": data,
            "count": total,
            "page": page,
            "page_size": page_size,
            "currency": {
                "code": getattr(tenant, "resolved_currency", None) or getattr(tenant, "currency_code", "USD"),
                "symbol": getattr(tenant, "currency_symbol", None),
                "precision": getattr(tenant, "currency_precision", 2),
            },
        }, status=200)


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
    GET /api/v1/inventory/ledger?store_id=&variant_id=&q=&ref_type=&ref_id=&date_from=&date_to=&page=&page_size=
    
    Query parameters:
    - store_id: Filter by store ID
    - variant_id: Filter by variant ID
    - q: Search text (product name, SKU, note)
    - ref_type: Filter by reference type (e.g., SALE, RETURN, TRANSFER_OUT, etc.)
    - ref_id: Filter by reference ID
    - date_from: Filter entries from this date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
    - date_to: Filter entries until this date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
    - page: Page number (default: 1)
    - page_size: Items per page (default: 50)
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
        variant_id = request.GET.get("variant_id")
        ref_id = request.GET.get("ref_id")
        date_from = request.GET.get("date_from")
        date_to = request.GET.get("date_to")

        qs = StockLedger.objects.filter(tenant=tenant).select_related("variant__product", "store", "created_by").order_by("-created_at")
        
        # Apply filters
        if store_id:
            try:
                qs = qs.filter(store_id=int(store_id))
            except (ValueError, TypeError):
                pass
        
        if variant_id:
            try:
                qs = qs.filter(variant_id=int(variant_id))
            except (ValueError, TypeError):
                pass
        
        if ref_type:
            qs = qs.filter(ref_type=ref_type)
        
        if ref_id:
            try:
                qs = qs.filter(ref_id=int(ref_id))
            except (ValueError, TypeError):
                pass
        
        if date_from:
            try:
                from django.utils.dateparse import parse_datetime, parse_date
                from django.utils import timezone
                from datetime import datetime
                dt = parse_datetime(date_from)
                if dt is None:
                    dt = parse_date(date_from)
                    if dt:
                        dt = timezone.make_aware(datetime.combine(dt, datetime.min.time()))
                if dt:
                    qs = qs.filter(created_at__gte=dt)
            except (ValueError, TypeError):
                pass
        
        if date_to:
            try:
                from django.utils.dateparse import parse_datetime, parse_date
                from django.utils import timezone
                from datetime import datetime
                dt = parse_datetime(date_to)
                if dt is None:
                    dt = parse_date(date_to)
                    if dt:
                        dt = timezone.make_aware(datetime.combine(dt, datetime.max.time()))
                if dt:
                    qs = qs.filter(created_at__lte=dt)
            except (ValueError, TypeError):
                pass
        
        if q:
            qs = qs.filter(
                Q(variant__product__name__icontains=q) |
                Q(variant__sku__icontains=q) |
                Q(note__icontains=q) |
                Q(store__name__icontains=q) |
                Q(store__code__icontains=q)
            )

        total = qs.count()
        start = (page - 1) * page_size
        rows = qs[start:start + page_size]

        data = [{
            "id": r.id,
            "created_at": r.created_at,
            "store_id": r.store_id,
            "store_name": r.store.name if r.store else None,
            "store_code": r.store.code if r.store else None,
            "variant_id": r.variant_id,
            "product_name": r.variant.product.name if r.variant.product else None,
            "sku": r.variant.sku if r.variant else None,
            "qty_delta": r.qty_delta,
            "balance_after": r.balance_after,
            "ref_type": r.ref_type,
            "ref_id": r.ref_id,
            "note": r.note or "",
            "created_by": r.created_by.username if r.created_by else None,
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
            "lines": [{
                "variant_id": ln.variant_id,
                "sku": ln.variant.sku,
                "product": ln.variant.product.name,
                "qty": ln.qty,
                "qty_sent": ln.qty_sent if ln.qty_sent is not None else ln.qty,
                "qty_received": ln.qty_received or 0,
                "qty_remaining": (ln.qty_sent if ln.qty_sent is not None else ln.qty) - (ln.qty_received or 0),
            } for ln in t.lines.select_related("variant__product")],
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
        lines_data = []
        for ln in t.lines.select_related("variant__product"):
            qty_sent = ln.qty_sent if ln.qty_sent is not None else ln.qty
            qty_received = ln.qty_received or 0
            qty_remaining = qty_sent - qty_received
            lines_data.append({
                "variant_id": ln.variant_id,
                "sku": ln.variant.sku,
                "product": ln.variant.product.name,
                "qty": ln.qty,
                "qty_sent": qty_sent,
                "qty_received": qty_received,
                "qty_remaining": qty_remaining,
            })
        data = {
            "id": t.id,
            "created_at": t.created_at,
            "status": t.status,
            "from_store": {"id": t.from_store_id, "code": t.from_store.code, "name": t.from_store.name},
            "to_store": {"id": t.to_store_id, "code": t.to_store.code, "name": t.to_store.name},
            "notes": t.notes or "",
            "lines": lines_data,
        }
        return Response(data, status=200)

    def post(self, request, pk, action=None):
        """
        Actions via ?action=send|receive|cancel
        """
        t = self.get_obj(request, pk)
        # accept action from path param or query param for flexibility
        action = (action or request.GET.get("action") or "").lower()
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
            # decrement from_store, write ledger, set qty_sent
            with transaction.atomic():
                for ln in t.lines.select_related("variant"):
                    # Lock and validate inventory
                    item, _ = InventoryItem.objects.select_for_update().get_or_create(
                        tenant=t.tenant, store=t.from_store, variant=ln.variant, defaults={"on_hand": 0, "reserved": 0}
                    )
                    current_on_hand = Decimal(item.on_hand or 0)
                    qty_to_send = Decimal(ln.qty)
                    
                    # Validate sufficient stock
                    if current_on_hand < qty_to_send:
                        return Response({
                            "error": f"Insufficient stock for {ln.variant.sku}: available {current_on_hand}, requested {qty_to_send}"
                        }, status=400)
                    
                    # Decrement inventory
                    item.on_hand = current_on_hand - qty_to_send
                    item.save(update_fields=["on_hand"])
                    item.refresh_from_db(fields=["on_hand"])
                    
                    # Set qty_sent (defaults to qty if not explicitly set)
                    ln.qty_sent = ln.qty
                    ln.qty_received = 0  # Initialize received to 0
                    ln.save(update_fields=["qty_sent", "qty_received"])
                    
                    # Write ledger entry
                    StockLedger.objects.create(
                        tenant=t.tenant, store=t.from_store, variant=ln.variant,
                        qty_delta=-int(qty_to_send), balance_after=int(float(item.on_hand)),
                        ref_type="TRANSFER_OUT", ref_id=t.id, note=f"Transfer #{t.id} to {t.to_store.code}", created_by=request.user
                    )
                t.status = "IN_TRANSIT"
                # Store user for webhook signal
                t._current_user = request.user
                t.save(update_fields=["status"])
            return Response({"ok": True, "status": t.status})

        if action == "receive":
            if t.status not in ("SENT", "IN_TRANSIT", "PARTIAL_RECEIVED"):
                return Response({"error": "Only SENT/IN_TRANSIT/PARTIAL_RECEIVED transfers can be received"}, status=400)
            
            # Store previous status for webhook signal
            t._previous_status = t.status
            # Accept partial receive payload: {lines: [{variant_id, qty_receive}, ...]}
            payload = request.data or {}
            receive_lines = payload.get("lines", [])
            
            if not receive_lines:
                # If no lines specified, receive all remaining quantities
                receive_lines = [
                    {"variant_id": ln.variant_id, "qty_receive": ln.qty_remaining}
                    for ln in t.lines.all()
                    if ln.qty_remaining > 0
                ]
            
            if not receive_lines:
                return Response({"error": "No quantities to receive"}, status=400)
            
            # Build variant lookup
            variant_ids = [int(ln.get("variant_id")) for ln in receive_lines]
            variants = {v.id: v for v in Variant.objects.filter(id__in=variant_ids, product__tenant=t.tenant)}
            if len(variants) != len(variant_ids):
                return Response({"error": "Invalid variant_id(s)"}, status=400)
            
            # Process receives
            with transaction.atomic():
                for receive_line in receive_lines:
                    variant_id = int(receive_line.get("variant_id"))
                    qty_receive = int(receive_line.get("qty_receive") or 0)
                    
                    if qty_receive <= 0:
                        continue
                    
                    # Find the transfer line
                    try:
                        ln = t.lines.get(variant_id=variant_id)
                    except InventoryTransferLine.DoesNotExist:
                        return Response({"error": f"Variant {variant_id} not in transfer"}, status=400)
                    
                    # Calculate sent quantity (use qty_sent if set, otherwise qty)
                    qty_sent = ln.qty_sent if ln.qty_sent is not None else ln.qty
                    current_received = ln.qty_received or 0
                    qty_remaining = qty_sent - current_received
                    
                    # Validate receive quantity
                    if qty_receive > qty_remaining:
                        return Response({
                            "error": f"Cannot receive {qty_receive} for {ln.variant.sku}: only {qty_remaining} remaining"
                        }, status=400)
                    
                    # Update inventory at destination
                    item, _ = InventoryItem.objects.select_for_update().get_or_create(
                        tenant=t.tenant, store=t.to_store, variant=ln.variant, defaults={"on_hand": 0, "reserved": 0}
                    )
                    current_on_hand = Decimal(item.on_hand or 0)
                    item.on_hand = current_on_hand + Decimal(qty_receive)
                    item.save(update_fields=["on_hand"])
                    item.refresh_from_db(fields=["on_hand"])
                    
                    # Update received quantity
                    ln.qty_received = current_received + qty_receive
                    ln.save(update_fields=["qty_received"])
                    
                    # Write ledger entry
                    StockLedger.objects.create(
                        tenant=t.tenant, store=t.to_store, variant=ln.variant,
                        qty_delta=qty_receive, balance_after=int(float(item.on_hand)),
                        ref_type="TRANSFER_IN", ref_id=t.id, note=f"Transfer #{t.id} from {t.from_store.code}", created_by=request.user
                    )
                
                # Determine new status: check if all lines are fully received
                all_lines = t.lines.all()
                all_received = all(
                    (ln.qty_sent if ln.qty_sent is not None else ln.qty) == (ln.qty_received or 0)
                    for ln in all_lines
                )
                
                if all_received:
                    t.status = "RECEIVED"
                else:
                    t.status = "PARTIAL_RECEIVED"
                # Store user for webhook signal
                t._current_user = request.user
                t.save(update_fields=["status"])
            
            return Response({"ok": True, "status": t.status})


class ReorderSuggestionView(APIView):
    """
    GET /api/v1/inventory/reorder_suggestions?store_id=&category_id=&page=&page_size=
    
    Returns reorder suggestions for items that are at or below their reorder point.
    Query parameters:
    - store_id: Filter by store ID (optional)
    - category_id: Filter by product category ID (optional)
    - page: Page number (default: 1)
    - page_size: Items per page (default: 50)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"results": [], "count": 0}, status=200)

        page = int(request.GET.get("page") or "1")
        page_size = int(request.GET.get("page_size") or "50")
        store_id = request.GET.get("store_id")
        category_id = request.GET.get("category_id")

        default_threshold = tenant_default_reorder_point(tenant)
        threshold_value = Value(default_threshold, output_field=IntegerField())

        # Base queryset: InventoryItems with variants and products
        qs = InventoryItem.objects.filter(tenant=tenant).select_related(
            "store", "variant", "variant__product"
        )

        # Apply filters
        if store_id:
            try:
                qs = qs.filter(store_id=int(store_id))
            except (ValueError, TypeError):
                pass

        if category_id:
            try:
                qs = qs.filter(variant__product__category_id=int(category_id))
            except (ValueError, TypeError):
                pass

        # Annotate with threshold and on_hand as integer
        qs = qs.annotate(
            on_hand_int=Cast("on_hand", IntegerField()),
            threshold=Coalesce(
                F("variant__reorder_point"),
                threshold_value,
                output_field=IntegerField(),
            ),
        )

        # Filter to only items at or below threshold
        qs = qs.filter(on_hand_int__lte=F("threshold"))

        # Order by on_hand ascending (most critical first)
        qs = qs.order_by("on_hand_int", "variant__product__name", "variant__sku")

        total = qs.count()
        start = (page - 1) * page_size
        rows = qs[start:start + page_size]

        suggestions = []
        for item in rows:
            on_hand = int(item.on_hand_int)
            threshold = int(item.threshold)
            
            # Calculate suggested quantity
            # Use variant.reorder_qty if set, otherwise calculate as threshold - on_hand
            if item.variant.reorder_qty is not None:
                suggested_qty = item.variant.reorder_qty
            else:
                # Default: suggest enough to reach threshold
                suggested_qty = max(0, threshold - on_hand)
                # If already at threshold, suggest at least 1 (or threshold if threshold > 0)
                if suggested_qty == 0 and threshold > 0:
                    suggested_qty = threshold

            suggestions.append({
                "variant_id": item.variant_id,
                "product_name": item.variant.product.name if item.variant.product else item.variant.name,
                "sku": item.variant.sku or "",
                "barcode": item.variant.barcode or "",
                "store_id": item.store_id,
                "store_name": item.store.name,
                "store_code": item.store.code,
                "on_hand": on_hand,
                "reorder_point": item.variant.reorder_point,
                "threshold": threshold,  # Effective threshold (variant or tenant default)
                "suggested_qty": suggested_qty,
                "current_vs_threshold": f"{on_hand}/{threshold}",
            })

        return Response({"results": suggestions, "count": total}, status=200)


class StockSummaryView(APIView):
    """
    GET /api/v1/inventory/stock_summary?category_id=&search=
    
    Returns aggregated stock summary per variant across all stores.
    Query parameters:
    - category_id: Filter by product category ID (optional)
    - search: Search by product name, SKU, or barcode (optional)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"results": [], "count": 0}, status=200)

        category_id = request.GET.get("category_id")
        search = (request.GET.get("search") or "").strip()

        # Base queryset: Aggregate inventory items by variant
        qs = InventoryItem.objects.filter(tenant=tenant).select_related("variant__product", "store")

        # Apply filters
        if category_id:
            try:
                qs = qs.filter(variant__product__category_id=int(category_id))
            except (ValueError, TypeError):
                pass

        if search:
            qs = qs.filter(
                Q(variant__product__name__icontains=search) |
                Q(variant__sku__icontains=search) |
                Q(variant__barcode__icontains=search)
            )

        # Aggregate per variant across all stores
        variant_summary = (
            qs.values("variant_id", "variant__sku", "variant__product__name")
            .annotate(
                total_on_hand=Sum(Cast("on_hand", IntegerField())),
            )
            .order_by("variant__product__name", "variant__sku")
        )

        # Build per-store breakdown for each variant
        results = []
        for summary in variant_summary:
            variant_id = summary["variant_id"]
            variant_items = qs.filter(variant_id=variant_id).select_related("store")
            
            per_store = []
            for item in variant_items:
                per_store.append({
                    "store_id": item.store_id,
                    "store_name": item.store.name,
                    "store_code": item.store.code,
                    "on_hand": int(float(item.on_hand or 0)),
                })

            results.append({
                "variant_id": variant_id,
                "product_name": summary["variant__product__name"],
                "sku": summary["variant__sku"] or "",
                "total_on_hand": int(summary["total_on_hand"] or 0),
                "per_store": per_store,
            })

        return Response({
            "results": results,
            "count": len(results),
        }, status=200)
