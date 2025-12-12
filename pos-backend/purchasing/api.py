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
from rest_framework import parsers
import csv
import io
from datetime import datetime
from typing import Dict, List, Optional, Any

from tenants.models import Tenant, TenantDoc
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
                "is_external": po.is_external,
                "external_po_number": po.external_po_number or "",
                "vendor_invoice_number": po.vendor_invoice_number or "",
                "vendor_invoice_date": po.vendor_invoice_date.isoformat() if po.vendor_invoice_date else None,
                "import_source": po.import_source or "",
                "invoice_document_id": po.invoice_document_id,
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
            "is_external": po.is_external,
            "external_po_number": po.external_po_number or "",
            "vendor_invoice_number": po.vendor_invoice_number or "",
            "vendor_invoice_date": po.vendor_invoice_date.isoformat() if po.vendor_invoice_date else None,
            "import_source": po.import_source or "",
            "invoice_document_id": po.invoice_document_id,
            "invoice_document_url": po.invoice_document.file.url if po.invoice_document and po.invoice_document.file else None,
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
            "lead_time_days": v.lead_time_days,
            "safety_stock_days": v.safety_stock_days,
            "is_active": v.is_active,
            "created_at": v.created_at.isoformat() if v.created_at else None,
            "updated_at": v.updated_at.isoformat() if v.updated_at else None,
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

        # Validate lead_time_days and safety_stock_days
        lead_time_days = payload.get("lead_time_days")
        if lead_time_days is not None:
            try:
                lead_time_days = int(lead_time_days)
                if lead_time_days < 0:
                    return Response({"error": "lead_time_days must be a positive integer"}, status=400)
            except (ValueError, TypeError):
                return Response({"error": "lead_time_days must be a valid integer"}, status=400)

        safety_stock_days = payload.get("safety_stock_days")
        if safety_stock_days is not None:
            try:
                safety_stock_days = int(safety_stock_days)
                if safety_stock_days < 0:
                    return Response({"error": "safety_stock_days must be a positive integer"}, status=400)
            except (ValueError, TypeError):
                return Response({"error": "safety_stock_days must be a valid integer"}, status=400)

        vendor = Vendor.objects.create(
            tenant=tenant,
            name=name,
            code=code,
            contact_name=(payload.get("contact_name") or "").strip(),
            email=(payload.get("email") or "").strip(),
            phone=(payload.get("phone") or "").strip(),
            address=(payload.get("address") or "").strip(),
            notes=(payload.get("notes") or "").strip(),
            lead_time_days=lead_time_days,
            safety_stock_days=safety_stock_days,
        )

        return Response({
            "id": vendor.id,
            "name": vendor.name,
            "code": vendor.code or "",
            "contact_name": vendor.contact_name or "",
            "email": vendor.email or "",
            "phone": vendor.phone or "",
            "address": vendor.address or "",
            "notes": vendor.notes or "",
            "lead_time_days": vendor.lead_time_days,
            "safety_stock_days": vendor.safety_stock_days,
            "is_active": vendor.is_active,
            "created_at": vendor.created_at.isoformat() if vendor.created_at else None,
            "updated_at": vendor.updated_at.isoformat() if vendor.updated_at else None,
        }, status=201)


class VendorDetailView(APIView):
    """
    GET    /api/v1/purchasing/vendors/<id>
    PATCH  /api/v1/purchasing/vendors/<id>  { name?, code?, contact_name?, email?, phone?, address?, notes?, lead_time_days?, safety_stock_days?, is_active? }
    DELETE /api/v1/purchasing/vendors/<id>
    """
    permission_classes = [IsAuthenticated]

    def get_object(self, pk, tenant):
        """Get vendor object with tenant scoping"""
        return get_object_or_404(Vendor, pk=pk, tenant=tenant)

    def get(self, request, pk):
        """Retrieve a single vendor"""
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=status.HTTP_400_BAD_REQUEST)

        vendor = self.get_object(pk, tenant)
        return Response({
            "id": vendor.id,
            "name": vendor.name,
            "code": vendor.code or "",
            "contact_name": vendor.contact_name or "",
            "email": vendor.email or "",
            "phone": vendor.phone or "",
            "address": vendor.address or "",
            "notes": vendor.notes or "",
            "lead_time_days": vendor.lead_time_days,
            "safety_stock_days": vendor.safety_stock_days,
            "is_active": vendor.is_active,
            "created_at": vendor.created_at.isoformat() if vendor.created_at else None,
            "updated_at": vendor.updated_at.isoformat() if vendor.updated_at else None,
        }, status=200)

    @transaction.atomic
    def patch(self, request, pk):
        """Update vendor (partial update)"""
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=status.HTTP_400_BAD_REQUEST)

        vendor = self.get_object(pk, tenant)
        payload = request.data or {}
        update_fields = []

        # Update name
        if "name" in payload:
            name = (payload.get("name") or "").strip()
            if not name:
                return Response({"error": "name cannot be empty"}, status=status.HTTP_400_BAD_REQUEST)
            vendor.name = name
            update_fields.append("name")

        # Update code (with duplicate check)
        if "code" in payload:
            code = (payload.get("code") or "").strip()
            if code and Vendor.objects.filter(tenant=tenant, code=code).exclude(pk=vendor.pk).exists():
                return Response({"error": f"Vendor with code '{code}' already exists"}, status=status.HTTP_400_BAD_REQUEST)
            vendor.code = code
            update_fields.append("code")

        # Update contact fields
        if "contact_name" in payload:
            vendor.contact_name = (payload.get("contact_name") or "").strip()
            update_fields.append("contact_name")

        if "email" in payload:
            vendor.email = (payload.get("email") or "").strip()
            update_fields.append("email")

        if "phone" in payload:
            vendor.phone = (payload.get("phone") or "").strip()
            update_fields.append("phone")

        if "address" in payload:
            vendor.address = (payload.get("address") or "").strip()
            update_fields.append("address")

        if "notes" in payload:
            vendor.notes = (payload.get("notes") or "").strip()
            update_fields.append("notes")

        # Update lead_time_days
        if "lead_time_days" in payload:
            lead_time_days = payload.get("lead_time_days")
            if lead_time_days is not None and lead_time_days != "":
                try:
                    lead_time_days = int(lead_time_days)
                    if lead_time_days < 0:
                        return Response({"error": "lead_time_days must be a positive integer"}, status=status.HTTP_400_BAD_REQUEST)
                    vendor.lead_time_days = lead_time_days
                except (ValueError, TypeError):
                    return Response({"error": "lead_time_days must be a valid integer"}, status=status.HTTP_400_BAD_REQUEST)
            else:
                vendor.lead_time_days = None
            update_fields.append("lead_time_days")

        # Update safety_stock_days
        if "safety_stock_days" in payload:
            safety_stock_days = payload.get("safety_stock_days")
            if safety_stock_days is not None and safety_stock_days != "":
                try:
                    safety_stock_days = int(safety_stock_days)
                    if safety_stock_days < 0:
                        return Response({"error": "safety_stock_days must be a positive integer"}, status=status.HTTP_400_BAD_REQUEST)
                    vendor.safety_stock_days = safety_stock_days
                except (ValueError, TypeError):
                    return Response({"error": "safety_stock_days must be a valid integer"}, status=status.HTTP_400_BAD_REQUEST)
            else:
                vendor.safety_stock_days = None
            update_fields.append("safety_stock_days")

        # Update is_active
        if "is_active" in payload:
            is_active = payload.get("is_active")
            if isinstance(is_active, bool):
                vendor.is_active = is_active
                update_fields.append("is_active")
            elif isinstance(is_active, str):
                vendor.is_active = is_active.lower() in ("true", "1", "yes")
                update_fields.append("is_active")

        if update_fields:
            vendor.save(update_fields=update_fields)

        return Response({
            "id": vendor.id,
            "name": vendor.name,
            "code": vendor.code or "",
            "contact_name": vendor.contact_name or "",
            "email": vendor.email or "",
            "phone": vendor.phone or "",
            "address": vendor.address or "",
            "notes": vendor.notes or "",
            "lead_time_days": vendor.lead_time_days,
            "safety_stock_days": vendor.safety_stock_days,
            "is_active": vendor.is_active,
            "created_at": vendor.created_at.isoformat() if vendor.created_at else None,
            "updated_at": vendor.updated_at.isoformat() if vendor.updated_at else None,
        }, status=200)

    @transaction.atomic
    def delete(self, request, pk):
        """Delete vendor (with constraint check)"""
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=status.HTTP_400_BAD_REQUEST)

        vendor = self.get_object(pk, tenant)

        # Check if vendor is linked to any purchase orders
        # Since Vendor has on_delete=PROTECT in PurchaseOrder, Django will raise ProtectedError
        # But we want to provide a user-friendly error message
        try:
            po_count = vendor.purchase_orders.count()
            if po_count > 0:
                return Response(
                    {
                        "error": f"Cannot delete vendor. This vendor is linked to {po_count} purchase order(s). "
                                "Please remove the vendor from all purchase orders or deactivate it instead."
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )
            vendor.delete()
            return Response({"message": "Vendor deleted successfully"}, status=status.HTTP_200_OK)
        except Exception as e:
            # Check if it's a ProtectedError (Django's protection on CASCADE/PROTECT relationships)
            from django.db.models.deletion import ProtectedError
            if isinstance(e, ProtectedError):
                return Response(
                    {
                        "error": "Cannot delete vendor. This vendor is linked to one or more purchase orders. "
                                "Please remove the vendor from all purchase orders or deactivate it instead."
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error deleting vendor {pk}: {str(e)}", exc_info=True)
            return Response(
                {"error": "Failed to delete vendor. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ExternalPOReceiveView(APIView):
    """
    POST /api/v1/purchasing/pos/external-receive
    Content-Type: multipart/form-data
    
    Receives inventory from external purchase orders (goods received outside the system).
    Creates a PurchaseOrder with is_external=True and updates inventory using mode=add.
    
    Request body (form-data):
    - file: CSV file (optional if manual entry via 'lines' JSON)
    - store_id: int (required)
    - vendor_id: int (required)
    - external_po_number: str (optional)
    - vendor_invoice_number: str (required if file provided, optional for manual)
    - vendor_invoice_date: str (YYYY-MM-DD, optional)
    - invoice_file: file (optional, PDF/Image for invoice document)
    - notes: str (optional)
    - lines: JSON array (optional if CSV file provided)
      [{variant_id: int, qty: int, unit_cost: decimal}, ...]
    
    CSV Format (if file provided):
    - Required columns: sku, quantity (or qty)
    - Optional columns: unit_cost (or cost), notes
    - First row is header, subsequent rows are data
    
    Security & Validation:
    - All operations are tenant-scoped
    - Validates vendor belongs to tenant
    - Validates variants belong to tenant
    - Enforces unique vendor_invoice_number per tenant (if provided)
    - Validates file size (max 10MB) and type (CSV, PDF, images)
    - Atomic transaction: all-or-nothing creation
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser, parsers.JSONParser]

    # CSV column mappings (case-insensitive)
    CSV_COLUMNS = {
        "sku": ["sku", "product_sku", "variant_sku", "item_sku"],
        "quantity": ["quantity", "qty", "qty_received", "amount"],
        "unit_cost": ["unit_cost", "cost", "price", "unit_price"],
        "notes": ["notes", "note", "description"],
    }

    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
    ALLOWED_CSV_TYPES = ["text/csv", "application/csv", "text/plain"]
    ALLOWED_INVOICE_TYPES = [
        "application/pdf",
        "image/jpeg", "image/jpg", "image/png", "image/gif",
        "image/webp", "image/tiff", "image/bmp",
    ]

    def post(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=status.HTTP_400_BAD_REQUEST)

        # Parse form data
        store_id = request.data.get("store_id")
        vendor_id = request.data.get("vendor_id")
        external_po_number = (request.data.get("external_po_number") or "").strip()
        vendor_invoice_number = (request.data.get("vendor_invoice_number") or "").strip()
        vendor_invoice_date_str = (request.data.get("vendor_invoice_date") or "").strip()
        notes = (request.data.get("notes") or "").strip()
        invoice_file = request.FILES.get("invoice_file")
        csv_file = request.FILES.get("file")
        lines_json = request.data.get("lines")  # JSON array if manual entry

        # Validation
        if not store_id:
            return Response({"error": "store_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        if not vendor_id:
            return Response({"error": "vendor_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        if not csv_file and not lines_json:
            return Response({"error": "Either 'file' (CSV) or 'lines' (JSON array) is required"}, status=status.HTTP_400_BAD_REQUEST)
        if csv_file and not vendor_invoice_number:
            return Response({"error": "vendor_invoice_number is required when uploading CSV file"}, status=status.HTTP_400_BAD_REQUEST)

        # Validate store and vendor
        try:
            store = Store.objects.get(id=int(store_id), tenant=tenant)
        except (Store.DoesNotExist, ValueError, TypeError):
            return Response({"error": "Invalid store_id"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            vendor = Vendor.objects.get(id=int(vendor_id), tenant=tenant)
        except (Vendor.DoesNotExist, ValueError, TypeError):
            return Response({"error": "Invalid vendor_id"}, status=status.HTTP_400_BAD_REQUEST)

        # Validate invoice number uniqueness
        if vendor_invoice_number:
            if PurchaseOrder.objects.filter(tenant=tenant, vendor_invoice_number=vendor_invoice_number).exists():
                return Response({
                    "error": f"Invoice number '{vendor_invoice_number}' already exists for this tenant"
                }, status=status.HTTP_400_BAD_REQUEST)

        # Validate and parse invoice date
        vendor_invoice_date = None
        if vendor_invoice_date_str:
            try:
                vendor_invoice_date = datetime.strptime(vendor_invoice_date_str, "%Y-%m-%d").date()
            except ValueError:
                return Response({"error": "vendor_invoice_date must be in YYYY-MM-DD format"}, status=status.HTTP_400_BAD_REQUEST)

        # Validate invoice file
        invoice_doc = None
        if invoice_file:
            # Check file size
            if invoice_file.size > self.MAX_FILE_SIZE:
                return Response({"error": f"Invoice file exceeds maximum size of {self.MAX_FILE_SIZE / (1024*1024):.0f}MB"}, status=status.HTTP_400_BAD_REQUEST)
            
            # Check file type
            content_type = invoice_file.content_type or ""
            file_extension = (invoice_file.name or "").split(".")[-1].lower()
            
            is_allowed = False
            if content_type in self.ALLOWED_INVOICE_TYPES:
                is_allowed = True
            elif file_extension in ["pdf", "jpg", "jpeg", "png", "gif", "webp", "tiff", "bmp"]:
                is_allowed = True
            
            if not is_allowed:
                return Response({
                    "error": f"Invalid invoice file type. Allowed: PDF, JPEG, PNG, GIF, WebP, TIFF, BMP"
                }, status=status.HTTP_400_BAD_REQUEST)

        # Parse lines from CSV or JSON
        lines_data = []
        errors = []

        if csv_file:
            # Validate CSV file
            if csv_file.size > self.MAX_FILE_SIZE:
                return Response({"error": f"CSV file exceeds maximum size of {self.MAX_FILE_SIZE / (1024*1024):.0f}MB"}, status=status.HTTP_400_BAD_REQUEST)
            
            try:
                raw = csv_file.read()
                try:
                    text = raw.decode("utf-8-sig")  # Handle BOM
                except UnicodeDecodeError:
                    try:
                        text = raw.decode("latin-1")
                    except UnicodeDecodeError:
                        text = raw.decode("utf-8", errors="ignore")
                
                sio = io.StringIO(text, newline="")
                reader = csv.DictReader(sio)
                
                if not reader.fieldnames:
                    return Response({"error": "CSV file is empty or invalid"}, status=status.HTTP_400_BAD_REQUEST)

                # Normalize column names (case-insensitive)
                normalized_headers = {}
                for header in reader.fieldnames:
                    header_lower = header.strip().lower()
                    normalized_headers[header_lower] = header

                # Find required columns
                sku_col = None
                qty_col = None
                for sku_key in self.CSV_COLUMNS["sku"]:
                    if sku_key in normalized_headers:
                        sku_col = normalized_headers[sku_key]
                        break
                for qty_key in self.CSV_COLUMNS["quantity"]:
                    if qty_key in normalized_headers:
                        qty_col = normalized_headers[qty_key]
                        break

                if not sku_col:
                    return Response({"error": f"CSV missing required column: sku (or: {', '.join(self.CSV_COLUMNS['sku'])})"}, status=status.HTTP_400_BAD_REQUEST)
                if not qty_col:
                    return Response({"error": f"CSV missing required column: quantity (or: {', '.join(self.CSV_COLUMNS['quantity'])})"}, status=status.HTTP_400_BAD_REQUEST)

                # Find optional columns
                cost_col = None
                notes_col = None
                for cost_key in self.CSV_COLUMNS["unit_cost"]:
                    if cost_key in normalized_headers:
                        cost_col = normalized_headers[cost_key]
                        break
                for notes_key in self.CSV_COLUMNS["notes"]:
                    if notes_key in normalized_headers:
                        notes_col = normalized_headers[notes_key]
                        break

                # Parse rows
                row_num = 1
                for row in reader:
                    row_num += 1
                    
                    # Skip commented rows
                    if any(str(v).strip().startswith("#") for v in row.values() if v):
                        continue
                    
                    sku = (row.get(sku_col) or "").strip()
                    qty_str = (row.get(qty_col) or "").strip()
                    cost_str = (row.get(cost_col) or "0").strip() if cost_col else "0"
                    line_notes = (row.get(notes_col) or "").strip() if notes_col else ""

                    if not sku:
                        errors.append({"row": row_num, "message": "SKU is required"})
                        continue
                    
                    try:
                        qty = int(float(qty_str))
                        if qty <= 0:
                            errors.append({"row": row_num, "message": f"Quantity must be positive, got: {qty_str}"})
                            continue
                    except (ValueError, TypeError):
                        errors.append({"row": row_num, "message": f"Invalid quantity: {qty_str}"})
                        continue

                    try:
                        cost = Decimal(str(cost_str)) if cost_str else Decimal("0")
                        if cost < 0:
                            errors.append({"row": row_num, "message": f"Unit cost cannot be negative, got: {cost_str}"})
                            continue
                    except (ValueError, TypeError, Exception):
                        errors.append({"row": row_num, "message": f"Invalid unit_cost: {cost_str}"})
                        continue

                    lines_data.append({
                        "sku": sku,
                        "quantity": qty,
                        "unit_cost": cost,
                        "notes": line_notes,
                    })

                if not lines_data and not errors:
                    return Response({"error": "CSV file contains no valid data rows"}, status=status.HTTP_400_BAD_REQUEST)

            except Exception as e:
                return Response({"error": f"Error parsing CSV file: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)

        elif lines_json:
            # Parse JSON lines
            if isinstance(lines_json, str):
                import json
                try:
                    lines_json = json.loads(lines_json)
                except json.JSONDecodeError:
                    return Response({"error": "Invalid JSON in 'lines' field"}, status=status.HTTP_400_BAD_REQUEST)
            
            if not isinstance(lines_json, list):
                return Response({"error": "'lines' must be a JSON array"}, status=status.HTTP_400_BAD_REQUEST)
            
            for idx, line in enumerate(lines_json, start=1):
                variant_id = line.get("variant_id")
                qty = line.get("qty") or line.get("quantity")
                unit_cost = line.get("unit_cost") or line.get("cost") or 0
                line_notes = (line.get("notes") or "").strip()

                if not variant_id:
                    errors.append({"row": idx, "message": "variant_id is required"})
                    continue
                
                try:
                    variant_id = int(variant_id)
                    qty = int(qty)
                    if qty <= 0:
                        errors.append({"row": idx, "message": "Quantity must be positive"})
                        continue
                except (ValueError, TypeError):
                    errors.append({"row": idx, "message": "Invalid variant_id or quantity"})
                    continue

                try:
                    unit_cost = Decimal(str(unit_cost))
                    if unit_cost < 0:
                        errors.append({"row": idx, "message": "Unit cost cannot be negative"})
                        continue
                except (ValueError, TypeError):
                    errors.append({"row": idx, "message": "Invalid unit_cost"})
                    continue

                lines_data.append({
                    "variant_id": variant_id,
                    "quantity": qty,
                    "unit_cost": unit_cost,
                    "notes": line_notes,
                })

        # If we have errors from parsing, return them
        if errors:
            return Response({
                "error": "Validation errors found",
                "errors": errors
            }, status=status.HTTP_400_BAD_REQUEST)

        if not lines_data:
            return Response({"error": "No valid lines to process"}, status=status.HTTP_400_BAD_REQUEST)

        # Validate variants and build lookup
        variant_lookup = {}
        if csv_file:
            # Lookup by SKU
            skus = [line["sku"] for line in lines_data]
            variants = Variant.objects.filter(sku__in=skus, product__tenant=tenant).select_related("product")
            variant_by_sku = {v.sku.upper(): v for v in variants}  # Case-insensitive SKU matching
            
            # Check for missing SKUs
            missing_skus = []
            for line in lines_data:
                sku_upper = line["sku"].upper()
                if sku_upper not in variant_by_sku:
                    missing_skus.append(line["sku"])
                else:
                    variant_lookup[line["sku"]] = variant_by_sku[sku_upper]
            
            if missing_skus:
                return Response({
                    "error": f"SKUs not found: {', '.join(set(missing_skus))}",
                    "missing_skus": list(set(missing_skus))
                }, status=status.HTTP_400_BAD_REQUEST)
        else:
            # Lookup by variant_id
            variant_ids = [line["variant_id"] for line in lines_data]
            variants = Variant.objects.filter(id__in=variant_ids, product__tenant=tenant).select_related("product")
            variant_by_id = {v.id: v for v in variants}
            
            missing_ids = []
            for line in lines_data:
                variant_id = line["variant_id"]
                if variant_id not in variant_by_id:
                    missing_ids.append(variant_id)
                else:
                    variant_lookup[variant_id] = variant_by_id[variant_id]
            
            if missing_ids:
                return Response({
                    "error": f"Variant IDs not found: {', '.join(map(str, set(missing_ids)))}",
                    "missing_variant_ids": list(set(missing_ids))
                }, status=status.HTTP_400_BAD_REQUEST)

        # All validations passed - create PO and update inventory
        with transaction.atomic():
            # Create invoice document if file provided
            # Use two-step save to ensure instance.id exists when file is saved
            invoice_doc = None
            if invoice_file:
                try:
                    # Step 1: Create TenantDoc without file to get an ID
                    invoice_doc = TenantDoc.objects.create(
                        tenant=tenant,
                        label=f"Invoice: {vendor_invoice_number or external_po_number or 'External PO'}",
                        doc_type="VENDOR_INVOICE",
                        uploaded_by=request.user,
                        description=f"Vendor invoice for {vendor.name}",
                        metadata={
                            "vendor_id": vendor.id,
                            "vendor_invoice_number": vendor_invoice_number,
                            "external_po_number": external_po_number,
                            "original_filename": invoice_file.name,  # Preserve original filename
                        }
                    )
                    
                    # Step 2: Assign file and save (now instance.id exists for upload_to function)
                    invoice_doc.file = invoice_file
                    invoice_doc.save(update_fields=["file"])
                    
                    # Refresh to ensure file path is correctly set
                    invoice_doc.refresh_from_db()
                except Exception as e:
                    # If document creation fails, rollback transaction
                    # Log error for debugging but don't expose internal details
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.error(f"Failed to create invoice document: {str(e)}", exc_info=True)
                    return Response({
                        "error": "Failed to save invoice document. Please try again."
                    }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            # Determine import source
            import_source = "MANUAL"
            if csv_file:
                import_source = "CSV"
            elif invoice_file:
                content_type = invoice_file.content_type or ""
                if "pdf" in content_type.lower() or (invoice_file.name and invoice_file.name.lower().endswith(".pdf")):
                    import_source = "PDF"
                elif "image" in content_type.lower():
                    import_source = "IMAGE"

            # Create Purchase Order
            po = PurchaseOrder.objects.create(
                tenant=tenant,
                store=store,
                vendor=vendor,
                notes=notes,
                created_by=request.user,
                is_external=True,
                external_po_number=external_po_number,
                vendor_invoice_number=vendor_invoice_number,
                vendor_invoice_date=vendor_invoice_date,
                import_source=import_source,
                invoice_document=invoice_doc,
                status="RECEIVED",  # External POs are immediately received
                received_at=timezone.now(),
                submitted_at=timezone.now(),  # Treat as submitted when received
            )
            po.assign_po_number()

            # Create PO lines and update inventory
            total_value = Decimal("0")
            for line_data in lines_data:
                if csv_file:
                    variant = variant_lookup[line_data["sku"]]
                else:
                    variant = variant_lookup[line_data["variant_id"]]
                
                qty = line_data["quantity"]
                unit_cost = line_data["unit_cost"]
                line_notes = line_data.get("notes", "")

                # Create PO line
                po_line = PurchaseOrderLine.objects.create(
                    purchase_order=po,
                    variant=variant,
                    qty_ordered=qty,
                    qty_received=qty,  # External POs are fully received
                    unit_cost=unit_cost,
                    notes=line_notes,
                )

                # Update inventory (mode=add)
                item, _ = InventoryItem.objects.select_for_update().get_or_create(
                    tenant=tenant,
                    store=store,
                    variant=variant,
                    defaults={"on_hand": 0, "reserved": 0}
                )
                current_on_hand = Decimal(item.on_hand or 0)
                item.on_hand = current_on_hand + Decimal(qty)
                item.save(update_fields=["on_hand"])
                item.refresh_from_db(fields=["on_hand"])

                # Create ledger entry
                StockLedger.objects.create(
                    tenant=tenant,
                    store=store,
                    variant=variant,
                    qty_delta=qty,
                    balance_after=int(float(item.on_hand)),
                    ref_type="PURCHASE_ORDER_RECEIPT",
                    ref_id=po.id,
                    note=f"External PO #{po.po_number or po.id} - Invoice: {vendor_invoice_number or 'N/A'} from {vendor.name}",
                    created_by=request.user,
                )

                total_value += unit_cost * Decimal(qty)

            # Build response
            lines_response = []
            for line_data in lines_data:
                if csv_file:
                    variant = variant_lookup[line_data["sku"]]
                else:
                    variant = variant_lookup[line_data["variant_id"]]
                
                lines_response.append({
                    "variant_id": variant.id,
                    "sku": variant.sku,
                    "product_name": variant.product.name if variant.product else variant.name,
                    "quantity": line_data["quantity"],
                    "unit_cost": str(line_data["unit_cost"]),
                })

            return Response({
                "id": po.id,
                "po_number": po.po_number,
                "status": po.status,
                "is_external": True,
                "external_po_number": external_po_number,
                "vendor_invoice_number": vendor_invoice_number,
                "invoice_document_id": invoice_doc.id if invoice_doc else None,
                "total_value": str(total_value),
                "lines_count": len(lines_response),
                "lines": lines_response,
                "errors": errors if errors else None,
            }, status=status.HTTP_201_CREATED)

