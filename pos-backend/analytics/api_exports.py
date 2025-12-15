# analytics/api_exports.py
"""
API endpoints for inventory data exports and report exports.
"""
import os
import tempfile
from io import BytesIO
from datetime import datetime, time, timedelta
from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
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
from analytics.reports.base import validate_store_access
from analytics.metrics import _tenant_timezone
from analytics.api_reports import BaseReportView
from analytics.reports.sales_reports import calculate_sales_summary
from analytics.reports.product_reports import calculate_product_performance
from analytics.reports.financial_reports import calculate_financial_summary
from analytics.reports.customer_reports import calculate_customer_analytics
from analytics.reports.employee_reports import calculate_employee_performance
from analytics.reports.returns_reports import calculate_returns_analysis
from analytics.reports.export_helpers import (
    export_report_to_csv,
    export_report_to_excel,
    export_report_to_pdf,
)
from orders.models import Sale, AuditLog
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


class ReportExportView(BaseReportView):
    """
    POST /api/v1/analytics/reports/export
    
    Export report data in PDF, Excel, or CSV format.
    
    Body: {
        "report_type": "sales" | "products" | "financial" | "customers" | "employees" | "returns",
        "format": "pdf" | "excel" | "csv",
        "params": {
            "store_id": <optional>,
            "date_from": "YYYY-MM-DD",
            "date_to": "YYYY-MM-DD",
            "limit": <optional, for products/customers/employees>,
            "sort_by": <optional, for products>,
            "group_by": <optional, for sales>,
            "status": <optional, for sales detail>,
            "page": <optional, for sales detail>,
            "page_size": <optional, for sales detail>,
        }
    }
    
    Returns:
    - File download (PDF/Excel/CSV)
    
    Security:
    - Requires authentication
    - Owner/Admin only
    - Tenant-scoped
    - Rate limited (via BaseReportView)
    - Audit logged
    """
    def post(self, request):
        tenant, error_response = self.get_tenant(request)
        if error_response:
            return error_response

        # Validate request body
        report_type = request.data.get("report_type", "").lower()
        export_format = request.data.get("format", "").lower()
        params = request.data.get("params", {})
        
        # Validate report_type
        valid_report_types = ["sales", "products", "financial", "customers", "employees", "returns"]
        if report_type not in valid_report_types:
            return Response(
                {"error": f"report_type must be one of: {', '.join(valid_report_types)}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate format
        valid_formats = ["pdf", "excel", "csv"]
        if export_format not in valid_formats:
            return Response(
                {"error": f"format must be one of: {', '.join(valid_formats)}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate and parse date range
        tz = _tenant_timezone(request)
        date_from_param = params.get("date_from")
        date_to_param = params.get("date_to")

        d_from = parse_date(date_from_param) if date_from_param else None
        d_to = parse_date(date_to_param) if date_to_param else None

        # Default to last 30 days if not provided
        if not d_from or not d_to:
            now = timezone.now()
            end_date = timezone.localtime(now, tz).date()
            start_date = end_date - timedelta(days=29)
            start_dt = timezone.make_aware(datetime.combine(start_date, time.min), tz)
            end_dt = timezone.make_aware(datetime.combine(end_date, time.max), tz)
        else:
            if d_from > d_to:
                return Response(
                    {"error": "date_from must be before or equal to date_to"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            start_dt = timezone.make_aware(datetime.combine(d_from, time.min), tz)
            end_dt = timezone.make_aware(datetime.combine(d_to, time.max), tz)
        
        # Validate store if provided
        store_id_param = params.get("store_id")
        if store_id_param not in (None, "", "null"):
            store, error_msg = validate_store_access(store_id_param, tenant)
            if error_msg:
                return Response(
                    {"error": error_msg},
                    status=status.HTTP_400_BAD_REQUEST
                )
            store_id = store.id if store else None
        else:
            store_id = None
        
        try:
            # Fetch report data based on type
            report_data = None
            
            if report_type == "sales":
                group_by = params.get("group_by", "day")
                report_data = calculate_sales_summary(
                    tenant=tenant,
                    store_id=store_id,
                    date_from=start_dt,
                    date_to=end_dt,
                    group_by=group_by,
                    tz=tz,
                )

                detail_required = export_format in ["csv", "excel", "pdf"]
                detail_results = None

                if detail_required:
                    from orders.serializers import SaleListSerializer
                    from django.db.models import F, Sum, Count, Value, DecimalField
                    from django.db.models.functions import Coalesce

                    sale_qs = Sale.objects.filter(
                        tenant=tenant,
                        created_at__gte=start_dt,
                        created_at__lte=end_dt,
                    )
                    if store_id:
                        sale_qs = sale_qs.filter(store_id=store_id)

                    status_filter = params.get("status")
                    if status_filter:
                        sale_qs = sale_qs.filter(status=status_filter)

                    zero = Value(0, output_field=DecimalField(max_digits=12, decimal_places=2))
                    sale_qs = (
                        sale_qs.annotate(
                            lines_count=Coalesce(Count("lines", distinct=True), 0),
                            subtotal=Coalesce(
                                Sum(
                                    F("lines__line_total")
                                    + F("lines__discount")
                                    - F("lines__tax")
                                    - F("lines__fee"),
                                    output_field=DecimalField(max_digits=12, decimal_places=2),
                                ),
                                zero,
                            ),
                            discount_total=Coalesce(
                                Sum("lines__discount", output_field=DecimalField(max_digits=12, decimal_places=2)), zero
                            ),
                            tax_total=Coalesce(Sum("lines__tax", output_field=DecimalField(max_digits=12, decimal_places=2)), zero),
                        )
                        .order_by("-created_at", "-id")
                        .select_related("store", "cashier")
                    )

                    max_rows = min(int(params.get("page_size", 1000)), 10000)
                    sales_list = list(sale_qs[:max_rows])
                    serializer = SaleListSerializer(sales_list, many=True, context={"request": request})
                    detail_results = serializer.data

                if export_format in ["csv", "excel"]:
                    report_data = {"results": detail_results or []}
                elif detail_results:
                    report_data["results"] = detail_results
            
            elif report_type == "products":
                limit = min(int(params.get("limit", 50)), 500)
                sort_by = params.get("sort_by", "revenue")
                report_data = calculate_product_performance(
                    tenant=tenant,
                    store_id=store_id,
                    date_from=start_dt,
                    date_to=end_dt,
                    limit=limit,
                    sort_by=sort_by,
                )
            
            elif report_type == "financial":
                report_data = calculate_financial_summary(
                    tenant=tenant,
                    store_id=store_id,
                    date_from=start_dt,
                    date_to=end_dt,
                )
            
            elif report_type == "customers":
                limit = min(int(params.get("limit", 50)), 500)
                report_data = calculate_customer_analytics(
                    tenant=tenant,
                    store_id=store_id,
                    date_from=start_dt,
                    date_to=end_dt,
                    limit=limit,
                )
            
            elif report_type == "employees":
                limit = min(int(params.get("limit", 50)), 500)
                report_data = calculate_employee_performance(
                    tenant=tenant,
                    store_id=store_id,
                    date_from=start_dt,
                    date_to=end_dt,
                    limit=limit,
                )
            
            elif report_type == "returns":
                report_data = calculate_returns_analysis(
                    tenant=tenant,
                    store_id=store_id,
                    date_from=start_dt,
                    date_to=end_dt,
                    tz=tz,
                )
            
            if not report_data:
                return Response(
                    {"error": f"No data available for {report_type} report"},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Add currency info if not present
            if "currency" not in report_data:
                report_data["currency"] = {
                    "code": getattr(tenant, "resolved_currency", None) or getattr(tenant, "currency_code", "USD"),
                    "symbol": getattr(tenant, "currency_symbol", None),
                    "precision": getattr(tenant, "currency_precision", 2),
                }
            
            # Generate export file
            tenant_name = getattr(tenant, "name", "") or getattr(tenant, "code", "Tenant")
            date_range_str = f"{d_from or start_dt.date()} to {d_to or end_dt.date()}"
            
            if export_format == "csv":
                content = export_report_to_csv(report_data, report_type)
                content_type = "text/csv"
                file_extension = "csv"
            
            elif export_format == "excel":
                content = export_report_to_excel(report_data, report_type, tenant_name)
                content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                file_extension = "xlsx"
            
            else:  # pdf
                content = export_report_to_pdf(report_data, report_type, tenant_name, date_range_str)
                content_type = "application/pdf"
                file_extension = "pdf"
            
            # Generate filename
            timestamp = timezone.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{tenant.code or 'tenant'}_{report_type}_report_{timestamp}.{file_extension}"
            
            # Log export to audit log
            try:
                AuditLog.record(
                    tenant=tenant,
                    action=f"report_export_{report_type}",
                    user=request.user,
                    severity="info",
                    metadata={
                        "report_type": report_type,
                        "format": export_format,
                        "date_from": str(d_from or start_dt.date()),
                        "date_to": str(d_to or end_dt.date()),
                        "store_id": store_id,
                    }
                )
            except Exception as e:
                # Log error but don't fail the export
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"Failed to log export to audit log: {e}")
            
            # Return file as download
            response = HttpResponse(content, content_type=content_type)
            response["Content-Disposition"] = f'attachment; filename="{filename}"'
            return response
            
        except ImportError as e:
            return Response(
                {"error": f"Export format not supported: {str(e)}"},
                status=status.HTTP_501_NOT_IMPLEMENTED
            )
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(
                f"Error exporting report: {type(e).__name__}: {str(e)}",
                exc_info=True,
                extra={
                    "user_id": request.user.id if request.user else None,
                    "tenant_id": tenant.id,
                    "report_type": report_type,
                    "format": export_format,
                }
            )
            return Response(
                {"error": f"An error occurred while generating the export: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
