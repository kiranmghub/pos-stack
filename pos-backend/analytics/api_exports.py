# analytics/api_exports.py
"""
API endpoints for inventory data exports.
"""
import os
import tempfile
from io import BytesIO
from django.http import HttpResponse
from django.utils import timezone
from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.core.management import call_command
from django.core.management.base import CommandError

from common.api_mixins import IsOwner
from stores.models import Store
from analytics.models import ExportTracking
from analytics.export import (
    export_to_csv, export_to_json,
    prepare_inventory_item_row, prepare_ledger_row,
    prepare_transfer_row, prepare_transfer_line_row,
    prepare_count_session_row, prepare_count_line_row,
    prepare_purchase_order_row, prepare_purchase_order_line_row,
)
from inventory.models import InventoryItem, StockLedger, InventoryTransfer, InventoryTransferLine
from inventory.models_counts import CountSession, CountLine
from purchasing.models import PurchaseOrder, PurchaseOrderLine


def _resolve_request_tenant(request):
    """Resolve tenant from request"""
    from django.shortcuts import get_object_or_404
    from tenants.models import Tenant
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


class ExportSnapshotView(APIView):
    """
    POST /api/v1/analytics/exports/snapshot
    
    Export a complete snapshot of inventory data.
    
    Body: {
        "format": "csv" | "json",
        "store_id": <optional>,
        "include_ledger": true
    }
    
    Security:
    - Requires authentication
    - Owner-only
    - Tenant-scoped
    """
    permission_classes = [IsAuthenticated, IsOwner]

    def post(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)

        payload = request.data or {}
        export_format = payload.get("format", "csv")
        store_id = payload.get("store_id")
        include_ledger = payload.get("include_ledger", True)

        # Validate format
        if export_format not in ["csv", "json"]:
            return Response({"error": "format must be 'csv' or 'json'"}, status=400)

        # Validate store if provided
        if store_id:
            try:
                store = Store.objects.get(id=store_id, tenant=tenant)
            except Store.DoesNotExist:
                return Response({"error": f"Store {store_id} not found"}, status=400)

        # Build export data
        try:
            # Export inventory items
            items_qs = InventoryItem.objects.filter(tenant=tenant).select_related(
                "store", "variant", "variant__product"
            )
            if store_id:
                items_qs = items_qs.filter(store_id=store_id)
            items_data = [prepare_inventory_item_row(item) for item in items_qs]

            # Export stock ledger
            ledger_data = []
            if include_ledger:
                ledger_qs = StockLedger.objects.filter(tenant=tenant).select_related(
                    "store", "variant", "variant__product", "created_by"
                )
                if store_id:
                    ledger_qs = ledger_qs.filter(store_id=store_id)
                ledger_data = [prepare_ledger_row(entry) for entry in ledger_qs]

            # Export transfers
            transfers_qs = InventoryTransfer.objects.filter(tenant=tenant).select_related(
                "from_store", "to_store", "created_by"
            )
            if store_id:
                transfers_qs = transfers_qs.filter(
                    Q(from_store_id=store_id) | Q(to_store_id=store_id)
                )
            transfers_data = [prepare_transfer_row(transfer) for transfer in transfers_qs]

            # Export transfer lines
            transfer_lines_data = []
            if transfers_data:
                transfer_ids = [t["id"] for t in transfers_data]
                transfer_lines_qs = InventoryTransferLine.objects.filter(
                    transfer_id__in=transfer_ids
                ).select_related("variant")
                transfer_lines_data = [prepare_transfer_line_row(line) for line in transfer_lines_qs]

            # Export count sessions
            counts_qs = CountSession.objects.filter(tenant=tenant).select_related(
                "store", "created_by"
            )
            if store_id:
                counts_qs = counts_qs.filter(store_id=store_id)
            counts_data = [prepare_count_session_row(session) for session in counts_qs]

            # Export count lines
            count_lines_data = []
            if counts_data:
                session_ids = [s["id"] for s in counts_data]
                count_lines_qs = CountLine.objects.filter(
                    session_id__in=session_ids
                ).select_related("variant")
                count_lines_data = [prepare_count_line_row(line) for line in count_lines_qs]

            # Export purchase orders
            pos_qs = PurchaseOrder.objects.filter(tenant=tenant).select_related(
                "store", "vendor", "created_by"
            )
            if store_id:
                pos_qs = pos_qs.filter(store_id=store_id)
            pos_data = [prepare_purchase_order_row(po) for po in pos_qs]

            # Export purchase order lines
            po_lines_data = []
            if pos_data:
                po_ids = [p["id"] for p in pos_data]
                po_lines_qs = PurchaseOrderLine.objects.filter(
                    purchase_order_id__in=po_ids
                ).select_related("variant")
                po_lines_data = [prepare_purchase_order_line_row(line) for line in po_lines_qs]

            # Combine all data
            export_data = {
                "inventory_items": items_data,
                "stock_ledger": ledger_data,
                "transfers": transfers_data,
                "transfer_lines": transfer_lines_data,
                "count_sessions": counts_data,
                "count_lines": count_lines_data,
                "purchase_orders": pos_data,
                "purchase_order_lines": po_lines_data,
            }

            # Generate export file
            timestamp = timezone.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{tenant.code}_inventory_snapshot_{timestamp}.{export_format}"

            if export_format == "csv":
                # For CSV, we'll export each section separately or combine
                # For simplicity, let's combine inventory items and ledger
                combined_data = items_data + ledger_data
                content = export_to_csv(combined_data)
                content_type = "text/csv"
            else:
                content = export_to_json(export_data)
                content_type = "application/json"

            # Return file as download
            response = HttpResponse(content, content_type=content_type)
            response["Content-Disposition"] = f'attachment; filename="{filename}"'
            return response

        except Exception as e:
            return Response({"error": str(e)}, status=500)


class ExportDeltaView(APIView):
    """
    POST /api/v1/analytics/exports/delta
    
    Export delta (incremental) inventory data since last export.
    
    Body: {
        "type": "ledger" | "transfers" | "counts" | "purchase_orders",
        "format": "csv" | "json",
        "store_id": <optional>,
        "reset": false
    }
    
    Security:
    - Requires authentication
    - Owner-only
    - Tenant-scoped
    """
    permission_classes = [IsAuthenticated, IsOwner]

    def post(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)

        payload = request.data or {}
        export_type = payload.get("type")
        export_format = payload.get("format", "csv")
        store_id = payload.get("store_id")
        reset = payload.get("reset", False)

        # Validate export type
        valid_types = ["ledger", "transfers", "counts", "purchase_orders"]
        if export_type not in valid_types:
            return Response({"error": f"type must be one of: {', '.join(valid_types)}"}, status=400)

        # Validate format
        if export_format not in ["csv", "json"]:
            return Response({"error": "format must be 'csv' or 'json'"}, status=400)

        # Validate store if provided
        if store_id:
            try:
                store = Store.objects.get(id=store_id, tenant=tenant)
            except Store.DoesNotExist:
                return Response({"error": f"Store {store_id} not found"}, status=400)

        # Get or create export tracking
        tracking, created = ExportTracking.objects.get_or_create(
            tenant=tenant,
            export_type=export_type,
            defaults={"last_exported_id": 0, "records_exported": 0}
        )

        if reset:
            tracking.last_exported_id = 0
            tracking.records_exported = 0
            tracking.save()

        last_id = tracking.last_exported_id

        try:
            # Export based on type
            if export_type == "ledger":
                data, max_id = self._export_ledger_delta(tenant, store_id, last_id)
            elif export_type == "transfers":
                data, max_id = self._export_transfers_delta(tenant, store_id, last_id)
            elif export_type == "counts":
                data, max_id = self._export_counts_delta(tenant, store_id, last_id)
            elif export_type == "purchase_orders":
                data, max_id = self._export_purchase_orders_delta(tenant, store_id, last_id)
            else:
                return Response({"error": f"Unknown export type: {export_type}"}, status=400)

            if not data:
                return Response({
                    "message": "No new records to export",
                    "last_exported_id": last_id
                }, status=200)

            # Generate export file
            timestamp = timezone.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{tenant.code}_{export_type}_delta_{timestamp}.{export_format}"

            if export_format == "csv":
                content = export_to_csv(data)
                content_type = "text/csv"
            else:
                content = export_to_json(data)
                content_type = "application/json"

            # Update tracking
            tracking.last_exported_id = max_id
            tracking.records_exported = len(data)
            tracking.last_exported_at = timezone.now()
            tracking.save()

            # Return file as download
            response = HttpResponse(content, content_type=content_type)
            response["Content-Disposition"] = f'attachment; filename="{filename}"'
            return response

        except Exception as e:
            return Response({"error": str(e)}, status=500)

    def _export_ledger_delta(self, tenant, store_id, last_id):
        """Export stock ledger entries since last_id"""
        qs = StockLedger.objects.filter(
            tenant=tenant,
            id__gt=last_id
        ).select_related("store", "variant", "variant__product", "created_by")
        
        if store_id:
            qs = qs.filter(store_id=store_id)
        
        qs = qs.order_by("id")
        data = [prepare_ledger_row(entry) for entry in qs]
        max_id = max([entry.id for entry in qs]) if qs.exists() else last_id
        
        return data, max_id

    def _export_transfers_delta(self, tenant, store_id, last_id):
        """Export transfers and their lines since last_id"""
        transfers_qs = InventoryTransfer.objects.filter(
            tenant=tenant,
            id__gt=last_id
        ).select_related("from_store", "to_store", "created_by")
        
        if store_id:
            transfers_qs = transfers_qs.filter(
                Q(from_store_id=store_id) | Q(to_store_id=store_id)
            )
        
        transfers_qs = transfers_qs.order_by("id")
        transfers_data = [prepare_transfer_row(transfer) for transfer in transfers_qs]
        
        # Include transfer lines
        if transfers_data:
            transfer_ids = [t["id"] for t in transfers_data]
            transfer_lines_qs = InventoryTransferLine.objects.filter(
                transfer_id__in=transfer_ids
            ).select_related("variant")
            
            transfer_lines_data = [prepare_transfer_line_row(line) for line in transfer_lines_qs]
            
            # Combine transfers and lines
            data = []
            for transfer in transfers_data:
                data.append({"type": "transfer", **transfer})
                # Add lines for this transfer
                for line in transfer_lines_data:
                    if line["transfer_id"] == transfer["id"]:
                        data.append({"type": "transfer_line", **line})
        else:
            data = []
        
        max_id = max([t.id for t in transfers_qs]) if transfers_qs.exists() else last_id
        
        return data, max_id

    def _export_counts_delta(self, tenant, store_id, last_id):
        """Export count sessions and their lines since last_id"""
        counts_qs = CountSession.objects.filter(
            tenant=tenant,
            id__gt=last_id
        ).select_related("store", "created_by")
        
        if store_id:
            counts_qs = counts_qs.filter(store_id=store_id)
        
        counts_qs = counts_qs.order_by("id")
        counts_data = [prepare_count_session_row(session) for session in counts_qs]
        
        # Include count lines
        if counts_data:
            session_ids = [s["id"] for s in counts_data]
            count_lines_qs = CountLine.objects.filter(
                session_id__in=session_ids
            ).select_related("variant")
            
            count_lines_data = [prepare_count_line_row(line) for line in count_lines_qs]
            
            # Combine sessions and lines
            data = []
            for session in counts_data:
                data.append({"type": "count_session", **session})
                # Add lines for this session
                for line in count_lines_data:
                    if line["session_id"] == session["id"]:
                        data.append({"type": "count_line", **line})
        else:
            data = []
        
        max_id = max([s.id for s in counts_qs]) if counts_qs.exists() else last_id
        
        return data, max_id

    def _export_purchase_orders_delta(self, tenant, store_id, last_id):
        """Export purchase orders and their lines since last_id"""
        pos_qs = PurchaseOrder.objects.filter(
            tenant=tenant,
            id__gt=last_id
        ).select_related("store", "vendor", "created_by")
        
        if store_id:
            pos_qs = pos_qs.filter(store_id=store_id)
        
        pos_qs = pos_qs.order_by("id")
        pos_data = [prepare_purchase_order_row(po) for po in pos_qs]
        
        # Include purchase order lines
        if pos_data:
            po_ids = [p["id"] for p in pos_data]
            po_lines_qs = PurchaseOrderLine.objects.filter(
                purchase_order_id__in=po_ids
            ).select_related("variant")
            
            po_lines_data = [prepare_purchase_order_line_row(line) for line in po_lines_qs]
            
            # Combine POs and lines
            data = []
            for po in pos_data:
                data.append({"type": "purchase_order", **po})
                # Add lines for this PO
                for line in po_lines_data:
                    if line["purchase_order_id"] == po["id"]:
                        data.append({"type": "purchase_order_line", **line})
        else:
            data = []
        
        max_id = max([p.id for p in pos_qs]) if pos_qs.exists() else last_id
        
        return data, max_id


class ExportTrackingListView(APIView):
    """
    GET /api/v1/analytics/exports/tracking
    
    List export tracking information for delta exports.
    
    Security:
    - Requires authentication
    - Owner-only
    - Tenant-scoped
    """
    permission_classes = [IsAuthenticated, IsOwner]

    def get(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"results": [], "count": 0}, status=200)

        tracking_list = ExportTracking.objects.filter(tenant=tenant).order_by("-last_exported_at")
        
        data = [{
            "id": t.id,
            "export_type": t.export_type,
            "last_exported_id": t.last_exported_id,
            "last_exported_at": t.last_exported_at,
            "records_exported": t.records_exported,
        } for t in tracking_list]
        
        return Response({"results": data, "count": len(data)}, status=200)

