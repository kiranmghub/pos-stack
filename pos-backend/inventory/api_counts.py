# inventory/api_counts.py
from django.utils import timezone
from datetime import datetime
from django.db import transaction
from django.db.models import Sum, Value, IntegerField, Q
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import serializers, status

from tenants.models import Tenant
from stores.models import Store
from catalog.models import Variant
from inventory.models import InventoryItem, AdjustmentReason, InventoryAdjustment, InventoryAdjustmentLine, StockLedger
from .models_counts import CountSession, CountLine

# ---- tenant resolver to match your existing behavior ----
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


# ------------ serializers (simple) ------------
class CountLineSer(serializers.Serializer):
    id = serializers.IntegerField()
    variant_id = serializers.IntegerField()
    sku = serializers.CharField(allow_null=True)
    product_name = serializers.CharField()
    expected_qty = serializers.IntegerField(allow_null=True)
    counted_qty = serializers.IntegerField()
    method = serializers.CharField()
    location = serializers.CharField(allow_blank=True)


class CountSessionSer(serializers.Serializer):
    id = serializers.IntegerField()
    code = serializers.CharField(allow_blank=True)
    status = serializers.CharField()
    note = serializers.CharField(allow_blank=True)
    store = serializers.DictField()
    created_at = serializers.DateTimeField()
    started_at = serializers.DateTimeField(allow_null=True)
    finalized_at = serializers.DateTimeField(allow_null=True)
    lines = CountLineSer(many=True)


# ------------ views ------------
class CountSessionListCreateView(APIView):
    """
    GET  /api/v1/inventory/counts?store_id=&status=&q=&page=&page_size=
    POST /api/v1/inventory/counts  { store_id, note?, code? }
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"results": [], "count": 0}, status=200)
        q = (request.GET.get("q") or "").strip()
        status_f = (request.GET.get("status") or "").strip()
        store_id = request.GET.get("store_id")
        page = int(request.GET.get("page") or "1")
        page_size = int(request.GET.get("page_size") or "24")

        # qs = CountSession.objects.filter(tenant=tenant).select_related("store").order_by("-created_at")
        # if store_id:
        #     qs = qs.filter(store_id=store_id)
        # if status_f:
        #     qs = qs.filter(status=status_f)
        # if q:
        #     qs = qs.filter(Q(code__icontains=q) | Q(note__icontains=q))
        #
        # total = qs.count()
        # ... existing code above ...
        qs = CountSession.objects.filter(tenant=tenant).select_related("store").order_by("-created_at")
        if store_id:
            qs = qs.filter(store_id=store_id)
        if status_f:
            qs = qs.filter(status=status_f)

        # --- broadened search ---
        q = (request.GET.get("q") or "").strip()
        if q:
            # treat "#5" or "5" as ID search
            qid = q[1:] if q.startswith("#") else q
            id_filter = Q()
            if qid.isdigit():
                id_filter = Q(id=int(qid))

            # OPTIONAL: avoid over-filtering on 1-character non-ID searches
            if len(q) < 2 and not qid.isdigit():
                pass  # ignore this tiny query
            else:
                qs = qs.filter(
                    id_filter |
                    Q(code__icontains=q) |
                    Q(note__icontains=q) |
                    Q(store__code__icontains=q) |
                    Q(store__name__icontains=q)
                )
        # --- end broadened search ---
        total = qs.count()

        start = (page - 1) * page_size
        rows = qs[start:start + page_size]
        data = [{
            "id": s.id,
            "code": s.code or "",
            "status": s.status,
            "scope": s.scope,
            "zone_name": s.zone_name or "",
            "note": s.note or "",
            "store": {"id": s.store_id, "code": s.store.code, "name": s.store.name},
            "created_at": s.created_at,
            "started_at": s.started_at,
            "finalized_at": s.finalized_at,
            "lines": [],
        } for s in rows]
        return Response({"results": data, "count": total}, status=200)

    def post(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)
        store_id = request.data.get("store_id")
        if not store_id:
            return Response({"error": "store_id required"}, status=400)
        store = get_object_or_404(Store, id=store_id, tenant=tenant)
        code = (request.data.get("code") or "").strip()
        note = request.data.get("note") or ""
        scope = (request.data.get("scope") or "FULL_STORE").strip().upper()
        zone_name = (request.data.get("zone_name") or "").strip()
        
        # Validate scope
        if scope not in ("FULL_STORE", "ZONE"):
            return Response({"error": "scope must be FULL_STORE or ZONE"}, status=400)
        
        # Zone scope requires zone_name
        if scope == "ZONE" and not zone_name:
            return Response({"error": "zone_name required when scope is ZONE"}, status=400)
        
        # Validate only one active FULL_STORE session per store
        if scope == "FULL_STORE":
            active_full_store = CountSession.objects.filter(
                tenant=tenant,
                store=store,
                scope="FULL_STORE",
                status__in=("DRAFT", "IN_PROGRESS")
            ).exclude(id=None)  # Exclude self if updating
            if active_full_store.exists():
                existing = active_full_store.first()
                return Response({
                    "error": f"An active full-store count session already exists (ID: {existing.id}, Status: {existing.status})"
                }, status=400)
        
        s = CountSession.objects.create(
            tenant=tenant, store=store, code=code, note=note, scope=scope, zone_name=zone_name, created_by=request.user
        )
        if not s.code:
            s.code = f"COUNT-{s.id:05d}"
            s.save(update_fields=["code"])

        return Response({"id": s.id}, status=201)


class CountSessionDetailView(APIView):
    """
    GET    /api/v1/inventory/counts/<id>
    DELETE /api/v1/inventory/counts/<id>   (allowed if not FINALIZED)
    """
    permission_classes = [IsAuthenticated]

    def get_obj(self, request, pk):
        tenant = _resolve_request_tenant(request)
        return get_object_or_404(CountSession, id=pk, tenant=tenant)

    def get(self, request, pk):
        s = self.get_obj(request, pk)
        lines = (
            CountLine.objects
            .filter(session=s)
            .select_related("variant__product")
            .order_by("variant__product__name", "variant__sku")
        )
        data = {
            "id": s.id,
            "code": s.code or "",
            "status": s.status,
            "scope": s.scope,
            "zone_name": s.zone_name or "",
            "note": s.note or "",
            "store": {"id": s.store_id, "code": s.store.code, "name": s.store.name},
            "created_at": s.created_at,
            "started_at": s.started_at,
            "finalized_at": s.finalized_at,
            "lines": [{
                "id": ln.id,
                "variant_id": ln.variant_id,
                "sku": ln.variant.sku,
                "product_name": ln.variant.product.name,
                "expected_qty": ln.expected_qty,
                "counted_qty": ln.counted_qty,
                "method": ln.method or "SCAN",
                "location": ln.location or "",
            } for ln in lines],
        }
        return Response(data, status=200)

    def delete(self, request, pk):
        s = self.get_obj(request, pk)
        if s.status == "FINALIZED":
            return Response({"error": "Cannot delete finalized count"}, status=400)
        s.delete()
        return Response(status=204)


class CountScanView(APIView):
    """
    POST /api/v1/inventory/counts/<id>/scan
      { barcode? , sku? , variant_id? , qty?=1, location? }
    Creates/updates CountLine and increases counted_qty.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)
        s = get_object_or_404(CountSession, id=pk, tenant=tenant)
        if s.status == "FINALIZED":
            return Response({"error": "Finalized counts are read-only"}, status=400)

        payload = request.data or {}
        qty = int(payload.get("qty") or 1)
        location = (payload.get("location") or "").strip()

        v = None
        if payload.get("variant_id"):
            v = get_object_or_404(Variant, id=int(payload["variant_id"]), product__tenant=tenant)
        elif payload.get("barcode"):
            v = get_object_or_404(Variant, barcode=str(payload["barcode"]), product__tenant=tenant)
        elif payload.get("sku"):
            v = get_object_or_404(Variant, sku=str(payload["sku"]), product__tenant=tenant)
        else:
            return Response({"error": "Provide variant_id or barcode or sku"}, status=400)

        # ensure there's a line
        line, _ = CountLine.objects.get_or_create(session=s, variant=v, defaults={"expected_qty": None})
        # lazily capture expected from inventory at first touch
        if line.expected_qty is None:
            inv = InventoryItem.objects.filter(tenant=tenant, store=s.store, variant=v).first()
            line.expected_qty = int(getattr(inv, "on_hand", 0) or 0)

        line.counted_qty = (line.counted_qty or 0) + qty
        if location:
            line.location = location
        line.method = "SCAN"
        line.last_scanned_barcode = v.barcode or ""
        line.save(update_fields=["expected_qty", "counted_qty", "location", "method", "last_scanned_barcode"])

        if s.status == "DRAFT":
            s.status = "IN_PROGRESS"
            s.started_at = timezone.now()
            s.save(update_fields=["status", "started_at"])

        return Response({"ok": True, "line_id": line.id, "counted_qty": line.counted_qty}, status=200)


class CountSetQtyView(APIView):
    """
    POST /api/v1/inventory/counts/<id>/set_qty
      { variant_id, counted_qty, location? }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)
        s = get_object_or_404(CountSession, id=pk, tenant=tenant)
        if s.status == "FINALIZED":
            return Response({"error": "Finalized counts are read-only"}, status=400)

        vid = int(request.data.get("variant_id") or 0)
        counted_qty = int(request.data.get("counted_qty") or 0)
        location = (request.data.get("location") or "").strip()

        v = get_object_or_404(Variant, id=vid, product__tenant=tenant)
        line, _ = CountLine.objects.get_or_create(session=s, variant=v, defaults={"expected_qty": None})
        if line.expected_qty is None:
            inv = InventoryItem.objects.filter(tenant=tenant, store=s.store, variant=v).first()
            line.expected_qty = int(getattr(inv, "on_hand", 0) or 0)
        line.counted_qty = counted_qty
        if location:
            line.location = location
        line.method = "KEYED"
        line.save(update_fields=["expected_qty", "counted_qty", "location", "method"])

        if s.status == "DRAFT":
            s.status = "IN_PROGRESS"
            s.started_at = timezone.now()
            s.save(update_fields=["status", "started_at"])

        return Response({"ok": True}, status=200)


class CountFinalizeView(APIView):
    """
    POST /api/v1/inventory/counts/<id>/finalize
    Creates an InventoryAdjustment (reason COUNT) for non-zero deltas and ledger rows.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)
        s = get_object_or_404(CountSession, id=pk, tenant=tenant)
        if s.status == "FINALIZED":
            return Response({"error": "Already finalized"}, status=400)

        reason = AdjustmentReason.objects.filter(tenant=tenant, code="COUNT").first()
        if not reason:
            reason = AdjustmentReason.objects.create(tenant=tenant, code="COUNT", name="Cycle Count")

        # Collect only deltas != 0
        lines = (
            CountLine.objects.filter(session=s)
            .select_related("variant")
            .order_by("variant__product__name", "variant__sku")
        )
        non_zero = [(ln.variant, int((ln.counted_qty or 0) - (ln.expected_qty or 0))) for ln in lines]
        non_zero = [(v, d) for (v, d) in non_zero if d != 0]

        summary = {"created": 0, "zero": len(lines) - len(non_zero), "adjusted": len(non_zero)}

        with transaction.atomic():
            if non_zero:
                adj = InventoryAdjustment.objects.create(
                    tenant=tenant, store=s.store, reason=reason, note=f"Cycle count #{s.id}", created_by=request.user
                )
                for v, delta in non_zero:
                    InventoryAdjustmentLine.objects.create(adjustment=adj, variant=v, delta=delta)
                    # mutate item
                    item, _ = InventoryItem.objects.select_for_update().get_or_create(
                        tenant=tenant, store=s.store, variant=v, defaults={"on_hand": 0}
                    )
                    item.on_hand = (item.on_hand or 0) + delta
                    item.save(update_fields=["on_hand"])
                    item.refresh_from_db(fields=["on_hand"])
                    # ledger - use COUNT_RECONCILE ref_type (Phase 2, Increment 1)
                    StockLedger.objects.create(
                        tenant=tenant, store=s.store, variant=v,
                        qty_delta=delta, balance_after=int(float(item.on_hand)),
                        ref_type="COUNT_RECONCILE", ref_id=s.id, note=f"Cycle count #{s.id}",
                        created_by=request.user,
                    )
                summary["created"] = 1

            s.status = "FINALIZED"
            s.finalized_at = timezone.now()
            # Store previous status for webhook signal
            s._previous_status = "IN_PROGRESS"  # Default if not set
            s.save(update_fields=["status", "finalized_at"])

        return Response({"ok": True, "summary": summary}, status=200)


class CountVarianceView(APIView):
    """
    GET /api/v1/inventory/counts/<id>/variance
    Returns variance preview (expected vs counted) before finalization.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)
        s = get_object_or_404(CountSession, id=pk, tenant=tenant)
        
        lines = (
            CountLine.objects.filter(session=s)
            .select_related("variant__product")
            .order_by("variant__product__name", "variant__sku")
        )
        
        variance_data = []
        total_expected = 0
        total_counted = 0
        total_variance = 0
        
        for ln in lines:
            expected = ln.expected_qty or 0
            counted = ln.counted_qty or 0
            variance = counted - expected
            
            total_expected += expected
            total_counted += counted
            total_variance += variance
            
            variance_data.append({
                "variant_id": ln.variant_id,
                "sku": ln.variant.sku,
                "product_name": ln.variant.product.name,
                "expected_qty": expected,
                "counted_qty": counted,
                "variance": variance,
                "location": ln.location or "",
            })
        
        return Response({
            "session_id": s.id,
            "session_code": s.code or "",
            "status": s.status,
            "scope": s.scope,
            "zone_name": s.zone_name or "",
            "store": {"id": s.store_id, "code": s.store.code, "name": s.store.name},
            "lines": variance_data,
            "summary": {
                "total_lines": len(variance_data),
                "lines_with_variance": len([l for l in variance_data if l["variance"] != 0]),
                "total_expected": total_expected,
                "total_counted": total_counted,
                "total_variance": total_variance,
            }
        }, status=200)
