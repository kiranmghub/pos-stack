# purchasing/api.py
from decimal import Decimal
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from tenants.models import Tenant
from stores.models import Store
from catalog.models import Variant
from inventory.models import InventoryItem, StockLedger
from .models import Vendor, PurchaseOrder, PurchaseOrderLine


def _resolve_request_tenant(request):
    """Resolve tenant from request (reuse pattern from inventory/api.py)"""
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


class PurchaseOrderListCreateView(APIView):
    """
    GET  /api/v1/purchasing/pos?store_id=&status=&vendor_id=&page=&page_size=
    POST /api/v1/purchasing/pos  { store_id, vendor_id, notes?, lines: [{variant_id, qty_ordered, unit_cost, notes?}] }
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"results": [], "count": 0}, status=200)

        page = int(request.GET.get("page") or "1")
        page_size = int(request.GET.get("page_size") or "24")
        status_f = (request.GET.get("status") or "").strip().upper()
        store_id = request.GET.get("store_id")
        vendor_id = request.GET.get("vendor_id")

        qs = PurchaseOrder.objects.filter(tenant=tenant).select_related(
            "store", "vendor", "created_by"
        ).order_by("-created_at")

        if status_f:
            qs = qs.filter(status=status_f)
        if store_id:
            try:
                qs = qs.filter(store_id=int(store_id))
            except (ValueError, TypeError):
                pass
        if vendor_id:
            try:
                qs = qs.filter(vendor_id=int(vendor_id))
            except (ValueError, TypeError):
                pass

        total = qs.count()
        rows = qs[(page - 1) * page_size : page * page_size]

        data = []
        for po in rows:
            lines = po.lines.select_related("variant__product")
            data.append({
                "id": po.id,
                "po_number": po.po_number or "",
                "status": po.status,
                "store": {"id": po.store_id, "code": po.store.code, "name": po.store.name},
                "vendor": {"id": po.vendor_id, "name": po.vendor.name, "code": po.vendor.code or ""},
                "notes": po.notes or "",
                "created_at": po.created_at,
                "submitted_at": po.submitted_at,
                "lines": [{
                    "id": ln.id,
                    "variant_id": ln.variant_id,
                    "sku": ln.variant.sku,
                    "product_name": ln.variant.product.name if ln.variant.product else ln.variant.name,
                    "qty_ordered": ln.qty_ordered,
                    "qty_received": ln.qty_received,
                    "qty_remaining": ln.qty_remaining,
                    "unit_cost": str(ln.unit_cost),
                } for ln in lines],
            })

        return Response({"results": data, "count": total}, status=200)

    def post(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)

        payload = request.data or {}
        store_id = payload.get("store_id")
        vendor_id = payload.get("vendor_id")
        notes = payload.get("notes") or ""
        lines = payload.get("lines") or []

        if not store_id:
            return Response({"error": "store_id required"}, status=400)
        if not vendor_id:
            return Response({"error": "vendor_id required"}, status=400)
        if not lines:
            return Response({"error": "lines required"}, status=400)

        store = get_object_or_404(Store, id=int(store_id), tenant=tenant)
        vendor = get_object_or_404(Vendor, id=int(vendor_id), tenant=tenant)

        # Validate variants
        variant_ids = {int(ln.get("variant_id")) for ln in lines if int(ln.get("qty_ordered") or 0) > 0}
        variants = {v.id: v for v in Variant.objects.filter(id__in=variant_ids, product__tenant=tenant)}
        if len(variants) != len(variant_ids):
            return Response({"error": "Invalid variant_id(s)"}, status=400)

        with transaction.atomic():
            po = PurchaseOrder.objects.create(
                tenant=tenant,
                store=store,
                vendor=vendor,
                notes=notes,
                created_by=request.user,
            )
            po.assign_po_number()

            for ln_data in lines:
                variant_id = int(ln_data.get("variant_id"))
                qty_ordered = int(ln_data.get("qty_ordered") or 0)
                unit_cost = Decimal(str(ln_data.get("unit_cost") or "0"))
                line_notes = (ln_data.get("notes") or "").strip()

                if qty_ordered <= 0:
                    continue

                PurchaseOrderLine.objects.create(
                    purchase_order=po,
                    variant=variants[variant_id],
                    qty_ordered=qty_ordered,
                    unit_cost=unit_cost,
                    notes=line_notes,
                )

        return Response({"id": po.id, "po_number": po.po_number, "status": po.status}, status=201)


class PurchaseOrderDetailView(APIView):
    """
    GET    /api/v1/purchasing/pos/<id>
    PUT    /api/v1/purchasing/pos/<id>  { notes?, lines: [...] }  (only if DRAFT)
    DELETE /api/v1/purchasing/pos/<id>  (only if DRAFT)
    """
    permission_classes = [IsAuthenticated]

    def get_obj(self, request, pk):
        tenant = _resolve_request_tenant(request)
        return get_object_or_404(PurchaseOrder.objects.select_related("store", "vendor"), id=pk, tenant=tenant)

    def get(self, request, pk):
        po = self.get_obj(request, pk)
        lines = po.lines.select_related("variant__product")
        data = {
            "id": po.id,
            "po_number": po.po_number or "",
            "status": po.status,
            "store": {"id": po.store_id, "code": po.store.code, "name": po.store.name},
            "vendor": {"id": po.vendor_id, "name": po.vendor.name, "code": po.vendor.code or ""},
            "notes": po.notes or "",
            "created_at": po.created_at,
            "submitted_at": po.submitted_at,
            "created_by": po.created_by.username if po.created_by else None,
            "lines": [{
                "id": ln.id,
                "variant_id": ln.variant_id,
                "sku": ln.variant.sku,
                "product_name": ln.variant.product.name if ln.variant.product else ln.variant.name,
                "qty_ordered": ln.qty_ordered,
                "qty_received": ln.qty_received,
                "qty_remaining": ln.qty_remaining,
                "unit_cost": str(ln.unit_cost),
                "notes": ln.notes or "",
            } for ln in lines],
        }
        return Response(data, status=200)

    def put(self, request, pk):
        po = self.get_obj(request, pk)
        if po.status != "DRAFT":
            return Response({"error": "Only DRAFT purchase orders can be updated"}, status=400)

        payload = request.data or {}
        notes = payload.get("notes")
        lines = payload.get("lines")

        with transaction.atomic():
            if notes is not None:
                po.notes = notes
                po.save(update_fields=["notes"])

            if lines is not None:
                # Replace all lines
                po.lines.all().delete()
                variant_ids = {int(ln.get("variant_id")) for ln in lines if int(ln.get("qty_ordered") or 0) > 0}
                variants = {v.id: v for v in Variant.objects.filter(id__in=variant_ids, product__tenant=po.tenant)}
                if len(variants) != len(variant_ids):
                    return Response({"error": "Invalid variant_id(s)"}, status=400)

                for ln_data in lines:
                    variant_id = int(ln_data.get("variant_id"))
                    qty_ordered = int(ln_data.get("qty_ordered") or 0)
                    unit_cost = Decimal(str(ln_data.get("unit_cost") or "0"))
                    line_notes = (ln_data.get("notes") or "").strip()

                    if qty_ordered <= 0:
                        continue

                    PurchaseOrderLine.objects.create(
                        purchase_order=po,
                        variant=variants[variant_id],
                        qty_ordered=qty_ordered,
                        unit_cost=unit_cost,
                        notes=line_notes,
                    )

        return Response({"id": po.id, "status": po.status}, status=200)

    def delete(self, request, pk):
        po = self.get_obj(request, pk)
        if po.status != "DRAFT":
            return Response({"error": "Only DRAFT purchase orders can be deleted"}, status=400)
        po.delete()
        return Response(status=204)


class PurchaseOrderSubmitView(APIView):
    """
    POST /api/v1/purchasing/pos/<id>/submit
    Submit a DRAFT purchase order (changes status to SUBMITTED).
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)

        po = get_object_or_404(PurchaseOrder, id=pk, tenant=tenant)
        if po.status != "DRAFT":
            return Response({"error": "Only DRAFT purchase orders can be submitted"}, status=400)

        if not po.lines.exists():
            return Response({"error": "Purchase order must have at least one line"}, status=400)

        po.status = "SUBMITTED"
        po.submitted_at = timezone.now()
        po.save(update_fields=["status", "submitted_at"])

        return Response({"ok": True, "status": po.status}, status=200)


class PurchaseOrderReceiveView(APIView):
    """
    POST /api/v1/purchasing/pos/<id>/receive
    Body: { lines: [{line_id, qty_receive}, ...] }
    
    Record receipt of items. If no lines specified, receives all remaining quantities.
    Updates inventory and creates StockLedger entries with ref_type="PURCHASE_ORDER_RECEIPT".
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)

        po = get_object_or_404(PurchaseOrder.objects.select_related("store"), id=pk, tenant=tenant)
        if po.status not in ("SUBMITTED", "PARTIAL_RECEIVED"):
            return Response({"error": "Only SUBMITTED or PARTIAL_RECEIVED purchase orders can be received"}, status=400)

        payload = request.data or {}
        receive_lines = payload.get("lines", [])

        if not receive_lines:
            # If no lines specified, receive all remaining quantities
            receive_lines = [
                {"line_id": ln.id, "qty_receive": ln.qty_remaining}
                for ln in po.lines.all()
                if ln.qty_remaining > 0
            ]

        if not receive_lines:
            return Response({"error": "No quantities to receive"}, status=400)

        # Build line lookup
        line_ids = [int(ln.get("line_id")) for ln in receive_lines]
        po_lines = {ln.id: ln for ln in po.lines.select_related("variant").filter(id__in=line_ids)}
        if len(po_lines) != len(line_ids):
            return Response({"error": "Invalid line_id(s)"}, status=400)

        with transaction.atomic():
            for receive_line in receive_lines:
                line_id = int(receive_line.get("line_id"))
                qty_receive = int(receive_line.get("qty_receive") or 0)

                if qty_receive <= 0:
                    continue

                po_line = po_lines[line_id]
                if qty_receive > po_line.qty_remaining:
                    return Response({
                        "error": f"Cannot receive {qty_receive} for {po_line.variant.sku}: only {po_line.qty_remaining} remaining"
                    }, status=400)

                # Update received quantity
                po_line.qty_received = (po_line.qty_received or 0) + qty_receive
                po_line.save(update_fields=["qty_received"])

                # Update inventory
                item, _ = InventoryItem.objects.select_for_update().get_or_create(
                    tenant=tenant,
                    store=po.store,
                    variant=po_line.variant,
                    defaults={"on_hand": 0, "reserved": 0}
                )
                current_on_hand = Decimal(item.on_hand or 0)
                item.on_hand = current_on_hand + Decimal(qty_receive)
                item.save(update_fields=["on_hand"])
                item.refresh_from_db(fields=["on_hand"])

                # Write ledger entry
                StockLedger.objects.create(
                    tenant=tenant,
                    store=po.store,
                    variant=po_line.variant,
                    qty_delta=qty_receive,
                    balance_after=int(float(item.on_hand)),
                    ref_type="PURCHASE_ORDER_RECEIPT",
                    ref_id=po.id,
                    note=f"PO #{po.po_number or po.id} from {po.vendor.name}",
                    created_by=request.user,
                )

            # Determine new status: check if all lines are fully received
            all_lines = po.lines.all()
            all_received = all(ln.qty_received >= ln.qty_ordered for ln in all_lines)

            # Set received_at timestamp (first time receiving)
            if not po.received_at:
                po.received_at = timezone.now()

            if all_received:
                po.status = "RECEIVED"
            else:
                po.status = "PARTIAL_RECEIVED"
            # Store previous status and user for webhook signal
            po._previous_status = po.status  # Will be updated after save
            po._current_user = request.user
            po.save(update_fields=["status", "received_at"])

        return Response({"ok": True, "status": po.status}, status=200)


class VendorListCreateView(APIView):
    """
    GET  /api/v1/purchasing/vendors?q=&page=&page_size=
    POST /api/v1/purchasing/vendors  { name, code?, contact_name?, email?, phone?, address?, notes? }
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"results": [], "count": 0}, status=200)

        page = int(request.GET.get("page") or "1")
        page_size = int(request.GET.get("page_size") or "50")
        q = (request.GET.get("q") or "").strip()

        qs = Vendor.objects.filter(tenant=tenant, is_active=True).order_by("name")
        if q:
            qs = qs.filter(
                Q(name__icontains=q) |
                Q(code__icontains=q) |
                Q(email__icontains=q) |
                Q(contact_name__icontains=q)
            )

        total = qs.count()
        rows = qs[(page - 1) * page_size : page * page_size]

        data = [{
            "id": v.id,
            "name": v.name,
            "code": v.code or "",
            "contact_name": v.contact_name or "",
            "email": v.email or "",
            "phone": v.phone or "",
            "address": v.address or "",
            "notes": v.notes or "",
        } for v in rows]

        return Response({"results": data, "count": total}, status=200)

    def post(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)

        payload = request.data or {}
        name = (payload.get("name") or "").strip()
        if not name:
            return Response({"error": "name required"}, status=400)

        code = (payload.get("code") or "").strip()
        # Check for duplicate code if provided
        if code and Vendor.objects.filter(tenant=tenant, code=code).exists():
            return Response({"error": f"Vendor with code '{code}' already exists"}, status=400)

        vendor = Vendor.objects.create(
            tenant=tenant,
            name=name,
            code=code,
            contact_name=(payload.get("contact_name") or "").strip(),
            email=(payload.get("email") or "").strip(),
            phone=(payload.get("phone") or "").strip(),
            address=(payload.get("address") or "").strip(),
            notes=(payload.get("notes") or "").strip(),
        )

        return Response({
            "id": vendor.id,
            "name": vendor.name,
            "code": vendor.code or "",
        }, status=201)

