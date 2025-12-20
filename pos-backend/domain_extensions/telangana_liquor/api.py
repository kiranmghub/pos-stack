# domain_extensions/telangana_liquor/api.py
"""
API endpoints for Telangana Liquor ICDC invoice processing.
"""

import logging
import os
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.conf import settings
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework import parsers
from decimal import Decimal

from tenants.models import Tenant, TenantDoc
from stores.models import Store
from purchasing.models import Vendor
from domain_extensions.models import ICDCInvoice, ICDCInvoiceLine
from domain_extensions.registry import get_active_extension, is_extension_enabled
from common.permissions import IsOwnerOrAdmin
from domain_extensions.telangana_liquor.services import (
    parse_icdc_pdf,
    match_product_and_variant,
    get_or_create_category,
    check_duplicate_icdc,
    handle_duplicate,
    validate_calculation,
    calculate_unit_rate,
    calculate_line_total,
    update_invoice_status,
    create_purchase_order_from_icdc,
    post_inventory_from_icdc,
    reverse_icdc_invoice,
)

logger = logging.getLogger(__name__)


def _resolve_request_tenant(request):
    """Resolve tenant from request"""
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


def _check_extension_enabled(tenant):
    """Check if Telangana Liquor extension is enabled for tenant"""
    if not tenant:
        return False
    return is_extension_enabled(tenant, "telangana_liquor")


class ICDCParseView(APIView):
    """
    POST /api/v1/domain-extensions/telangana-liquor/icdc/parse
    
    Parse an ICDC PDF file and return extracted data.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser]

    def post(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=status.HTTP_400_BAD_REQUEST)

        if not _check_extension_enabled(tenant):
            return Response(
                {"error": "Telangana Liquor extension is not enabled for this tenant"},
                status=status.HTTP_403_FORBIDDEN
            )

        # Validate file
        if "file" not in request.FILES:
            return Response(
                {"error": "No file provided"},
                status=status.HTTP_400_BAD_REQUEST
            )

        pdf_file = request.FILES["file"]
        
        # Validate file type
        if not pdf_file.name.lower().endswith(".pdf"):
            return Response(
                {"error": "File must be a PDF"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate file size (max 10MB)
        max_size = 10 * 1024 * 1024  # 10MB
        if pdf_file.size > max_size:
            return Response(
                {"error": "File size exceeds 10MB limit"},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # Save file temporarily
            temp_path = os.path.join(settings.MEDIA_ROOT, "temp", f"icdc_{tenant.id}_{pdf_file.name}")
            os.makedirs(os.path.dirname(temp_path), exist_ok=True)
            
            with open(temp_path, "wb") as f:
                for chunk in pdf_file.chunks():
                    f.write(chunk)
            
            # Parse PDF
            parsed_data = parse_icdc_pdf(temp_path)
            
            # Clean up temp file
            try:
                os.remove(temp_path)
            except Exception:
                pass
            
            # Extract metadata from parsed_data for top-level response
            metadata = parsed_data.pop("metadata", {})
            
            # Check if parsing failed critically
            parsing_method = metadata.get("parsing_method", "unknown")
            errors = metadata.get("errors", [])
            lines = parsed_data.get("lines", [])
            line_count = len(lines) if lines else 0
            
            logger.info(f"PDF parsing completed: method={parsing_method}, lines_found={line_count}, errors={len(errors)}")
            
            # If parsing method is "failed" or we have critical errors with no data, return error
            if parsing_method == "failed" or (errors and not lines):
                # Build error message from errors if available
                error_message = "Failed to parse PDF"
                if errors:
                    error_message = errors[0] if len(errors) == 1 else f"Failed to parse PDF: {errors[0]}"
                elif parsing_method == "failed":
                    error_message = "PDF parsing failed. Please check the file format and try again."
                
                logger.warning(f"PDF parsing failed: {error_message}")
                return Response({
                    "success": False,
                    "error": error_message,
                    "data": parsed_data,  # May be empty
                    "metadata": metadata,  # Contains errors
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # If OCR succeeded but no lines were found, still return error
            if parsing_method in ("ocr", "ocr_geometry", "doctr_ocr") and line_count == 0:
                logger.warning("OCR extraction succeeded but no line items were found in the PDF")
                return Response({
                    "success": False,
                    "error": "No line items found in PDF. The PDF may not contain valid ICDC invoice data, or the format is not recognized.",
                    "data": parsed_data,
                    "metadata": metadata,
                }, status=status.HTTP_400_BAD_REQUEST)
            
            return Response({
                "success": True,
                "data": parsed_data,  # header, lines, totals
                "metadata": metadata,  # parser_version, parsing_method, confidence, errors, warnings
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Error parsing ICDC PDF: {e}", exc_info=True)
            return Response(
                {"error": f"Failed to parse PDF: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ICDCSaveDraftView(APIView):
    """
    POST /api/v1/domain-extensions/telangana-liquor/icdc/save-draft
    
    Save an ICDC invoice as draft.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=status.HTTP_400_BAD_REQUEST)

        if not _check_extension_enabled(tenant):
            return Response(
                {"error": "Telangana Liquor extension is not enabled"},
                status=status.HTTP_403_FORBIDDEN
            )

        payload = request.data or {}
        
        # Required fields
        icdc_number = payload.get("icdc_number")
        invoice_date = payload.get("invoice_date")
        store_id = payload.get("store_id")
        vendor_id = payload.get("vendor_id")
        pdf_file_id = payload.get("pdf_file_id")
        
        if not all([icdc_number, invoice_date, store_id, vendor_id, pdf_file_id]):
            return Response(
                {"error": "Missing required fields: icdc_number, invoice_date, store_id, vendor_id, pdf_file_id"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate tenant scope
        store = get_object_or_404(Store, id=store_id, tenant=tenant)
        vendor = get_object_or_404(Vendor, id=vendor_id, tenant=tenant)
        pdf_file = get_object_or_404(TenantDoc, id=pdf_file_id, tenant=tenant)

        # Check for duplicate
        existing = check_duplicate_icdc(tenant, icdc_number)
        if existing:
            duplicate_info = handle_duplicate(tenant, icdc_number, existing)
            
            if duplicate_info["action"] == "block":
                return Response({
                    "error": duplicate_info["message"],
                    "duplicate_info": duplicate_info,
                }, status=status.HTTP_400_BAD_REQUEST)
            
            elif duplicate_info["action"] == "auto_open":
                # Return existing invoice
                return Response({
                    "id": existing.id,
                    "icdc_number": existing.icdc_number,
                    "status": existing.status,
                    "duplicate_info": duplicate_info,
                    "message": "Existing invoice found",
                }, status=status.HTTP_200_OK)
            
            elif duplicate_info["action"] == "allow_reupload":
                # Set is_reupload flag
                payload["is_reupload"] = True

        try:
            with transaction.atomic():
                # Create or update invoice
                invoice, created = ICDCInvoice.objects.get_or_create(
                    tenant=tenant,
                    icdc_number=icdc_number,
                    defaults={
                        "store": store,
                        "vendor": vendor,
                        "invoice_date": invoice_date,
                        "pdf_file": pdf_file,
                        "status": "DRAFT",
                        "raw_extraction": payload.get("raw_extraction", {}),
                        "canonical_data": payload.get("canonical_data", {}),
                        "parsing_errors": payload.get("parsing_errors", []),
                        "calculation_discrepancies": payload.get("calculation_discrepancies", []),
                        "parsing_metadata": payload.get("parsing_metadata", {}),
                        "is_reupload": payload.get("is_reupload", False),
                        "created_by": request.user,
                    }
                )
                
                if not created:
                    # Update existing
                    invoice.store = store
                    invoice.vendor = vendor
                    invoice.invoice_date = invoice_date
                    invoice.pdf_file = pdf_file
                    invoice.raw_extraction = payload.get("raw_extraction", {})
                    invoice.canonical_data = payload.get("canonical_data", {})
                    invoice.parsing_errors = payload.get("parsing_errors", [])
                    invoice.calculation_discrepancies = payload.get("calculation_discrepancies", [])
                    invoice.parsing_metadata = payload.get("parsing_metadata", {})
                    invoice.is_reupload = payload.get("is_reupload", False)
                    invoice.save()
                
                # Create/update lines
                lines_data = payload.get("lines", [])
                existing_line_ids = set()
                
                for line_data in lines_data:
                    line_number = line_data.get("line_number")
                    if not line_number:
                        continue
                    
                    line, _ = ICDCInvoiceLine.objects.get_or_create(
                        invoice=invoice,
                        line_number=line_number,
                        defaults={
                            "brand_number": line_data.get("brand_number", ""),
                            "brand_name": line_data.get("brand_name", ""),
                            "product_type": line_data.get("product_type", ""),
                            "pack_qty": line_data.get("pack_qty", 0),
                            "size_ml": line_data.get("size_ml", 0),
                            "cases_delivered": line_data.get("cases_delivered", 0),
                            "bottles_delivered": line_data.get("bottles_delivered", 0),
                            "unit_rate": Decimal(str(line_data.get("unit_rate", 0))),
                            "btl_rate": Decimal(str(line_data.get("btl_rate", 0))),
                            "total": Decimal(str(line_data.get("total", 0))),
                            "calculated_total": Decimal(str(line_data.get("calculated_total", 0))),
                            "has_discrepancy": line_data.get("has_discrepancy", False),
                            "discrepancy_reason": line_data.get("discrepancy_reason", ""),
                            "raw_data": line_data.get("raw_data", {}),
                        }
                    )
                    existing_line_ids.add(line.id)
                
                # Delete lines not in payload
                invoice.lines.exclude(id__in=existing_line_ids).delete()
                
                # Update status to REVIEW if was DRAFT
                if invoice.status == "DRAFT":
                    update_invoice_status(invoice, "REVIEW", user=request.user, save=True)
                
                return Response({
                    "id": invoice.id,
                    "icdc_number": invoice.icdc_number,
                    "status": invoice.status,
                    "duplicate_info": None,
                }, status=status.HTTP_200_OK if created else status.HTTP_200_OK)
                
        except Exception as e:
            logger.error(f"Error saving ICDC draft: {e}", exc_info=True)
            return Response(
                {"error": f"Failed to save draft: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ICDCSubmitView(APIView):
    """
    POST /api/v1/domain-extensions/telangana-liquor/icdc/{id}/submit
    
    Submit an ICDC invoice (create PO and post inventory).
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=status.HTTP_400_BAD_REQUEST)

        if not _check_extension_enabled(tenant):
            return Response(
                {"error": "Telangana Liquor extension is not enabled"},
                status=status.HTTP_403_FORBIDDEN
            )

        invoice = get_object_or_404(ICDCInvoice, id=pk, tenant=tenant)

        if invoice.status not in ["DRAFT", "REVIEW"]:
            return Response(
                {"error": f"Cannot submit invoice with status {invoice.status}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Get extension config
        extension = get_active_extension(tenant)
        config = extension.get_config(tenant) if extension else {}

        payload = request.data or {}
        update_variant_cost = payload.get("update_variant_cost", False)

        try:
            with transaction.atomic():
                # Match products/variants if not already matched
                for line in invoice.lines.all():
                    if not line.product or not line.variant:
                        product, variant = match_product_and_variant(
                            tenant,
                            line.brand_number,
                            line.brand_name,
                            line.size_ml
                        )
                        line.product = product
                        line.variant = variant
                        line.save(update_fields=["product", "variant"])
                
                # Validate all lines have matched variants
                unmatched_lines = invoice.lines.filter(variant__isnull=True)
                if unmatched_lines.exists():
                    return Response(
                        {"error": f"{unmatched_lines.count()} line(s) have unmatched variants"},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                
                # Update status to RECEIVED
                update_invoice_status(invoice, "RECEIVED", user=request.user, save=True)
                
                # Create Purchase Order
                po = create_purchase_order_from_icdc(invoice, request.user)
                
                # Post inventory
                ledger_entries, warnings = post_inventory_from_icdc(
                    invoice,
                    request.user,
                    update_variant_cost=update_variant_cost
                )
                
                return Response({
                    "success": True,
                    "invoice_id": invoice.id,
                    "purchase_order_id": po.id,
                    "warnings": warnings,
                }, status=status.HTTP_200_OK)
                
        except Exception as e:
            logger.error(f"Error submitting ICDC invoice: {e}", exc_info=True)
            return Response(
                {"error": f"Failed to submit invoice: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ICDCListView(APIView):
    """
    GET /api/v1/domain-extensions/telangana-liquor/icdc/
    
    List ICDC invoices.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"results": [], "count": 0}, status=status.HTTP_200_OK)

        if not _check_extension_enabled(tenant):
            return Response(
                {"error": "Telangana Liquor extension is not enabled"},
                status=status.HTTP_403_FORBIDDEN
            )

        page = int(request.GET.get("page") or "1")
        page_size = int(request.GET.get("page_size") or "24")
        status_f = (request.GET.get("status") or "").strip().upper()
        store_id = request.GET.get("store_id")

        qs = ICDCInvoice.objects.filter(tenant=tenant).select_related(
            "store", "vendor", "created_by", "purchase_order"
        ).prefetch_related("lines").order_by("-created_at")

        if status_f:
            qs = qs.filter(status=status_f)
        if store_id:
            try:
                qs = qs.filter(store_id=int(store_id))
            except (ValueError, TypeError):
                pass

        total = qs.count()
        rows = qs[(page - 1) * page_size : page * page_size]

        data = []
        for invoice in rows:
            data.append({
                "id": invoice.id,
                "icdc_number": invoice.icdc_number,
                "invoice_date": invoice.invoice_date.isoformat() if invoice.invoice_date else None,
                "status": invoice.status,
                "store": {"id": invoice.store_id, "name": invoice.store.name},
                "vendor": {"id": invoice.vendor_id, "name": invoice.vendor.name},
                "purchase_order_id": invoice.purchase_order_id,
                "created_at": invoice.created_at.isoformat() if invoice.created_at else None,
                "received_at": invoice.received_at.isoformat() if invoice.received_at else None,
                "line_count": invoice.lines.count(),
            })

        return Response({"results": data, "count": total}, status=status.HTTP_200_OK)


class ICDCDetailView(APIView):
    """
    GET /api/v1/domain-extensions/telangana-liquor/icdc/{id}/
    PUT /api/v1/domain-extensions/telangana-liquor/icdc/{id}/
    DELETE /api/v1/domain-extensions/telangana-liquor/icdc/{id}/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=status.HTTP_400_BAD_REQUEST)

        if not _check_extension_enabled(tenant):
            return Response(
                {"error": "Telangana Liquor extension is not enabled"},
                status=status.HTTP_403_FORBIDDEN
            )

        invoice = get_object_or_404(
            ICDCInvoice.objects.select_related("store", "vendor", "purchase_order", "pdf_file"),
            id=pk,
            tenant=tenant
        )

        lines = invoice.lines.select_related("product", "variant").order_by("line_number")

        return Response({
            "id": invoice.id,
            "icdc_number": invoice.icdc_number,
            "invoice_date": invoice.invoice_date.isoformat() if invoice.invoice_date else None,
            "status": invoice.status,
            "store": {"id": invoice.store_id, "name": invoice.store.name},
            "vendor": {"id": invoice.vendor_id, "name": invoice.vendor.name},
            "purchase_order_id": invoice.purchase_order_id,
            "purchase_order": {
                "id": invoice.purchase_order.id,
                "po_number": invoice.purchase_order.po_number,
            } if invoice.purchase_order else None,
            "raw_extraction": invoice.raw_extraction,
            "canonical_data": invoice.canonical_data,
            "parsing_errors": invoice.parsing_errors,
            "calculation_discrepancies": invoice.calculation_discrepancies,
            "parsing_metadata": invoice.parsing_metadata,
            "is_reupload": invoice.is_reupload,
            "created_at": invoice.created_at.isoformat() if invoice.created_at else None,
            "received_at": invoice.received_at.isoformat() if invoice.received_at else None,
            "lines": [{
                "id": line.id,
                "line_number": line.line_number,
                "brand_number": line.brand_number,
                "brand_name": line.brand_name,
                "product_type": line.product_type,
                "pack_qty": line.pack_qty,
                "size_ml": line.size_ml,
                "cases_delivered": line.cases_delivered,
                "bottles_delivered": line.bottles_delivered,
                "unit_rate": str(line.unit_rate),
                "btl_rate": str(line.btl_rate),
                "total": str(line.total),
                "calculated_total": str(line.calculated_total),
                "has_discrepancy": line.has_discrepancy,
                "discrepancy_reason": line.discrepancy_reason,
                "product_id": line.product_id,
                "variant_id": line.variant_id,
                "product": {"id": line.product.id, "name": line.product.name} if line.product else None,
                "variant": {"id": line.variant.id, "name": line.variant.name, "sku": line.variant.sku} if line.variant else None,
            } for line in lines],
        }, status=status.HTTP_200_OK)

    def put(self, request, pk):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=status.HTTP_400_BAD_REQUEST)

        if not _check_extension_enabled(tenant):
            return Response(
                {"error": "Telangana Liquor extension is not enabled"},
                status=status.HTTP_403_FORBIDDEN
            )

        invoice = get_object_or_404(ICDCInvoice, id=pk, tenant=tenant)

        # Only allow updates if DRAFT or REVIEW
        if invoice.status not in ["DRAFT", "REVIEW"]:
            return Response(
                {"error": f"Cannot update invoice with status {invoice.status}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        payload = request.data or {}

        try:
            with transaction.atomic():
                # Update fields
                if "store_id" in payload:
                    invoice.store = get_object_or_404(Store, id=payload["store_id"], tenant=tenant)
                if "vendor_id" in payload:
                    invoice.vendor = get_object_or_404(Vendor, id=payload["vendor_id"], tenant=tenant)
                if "invoice_date" in payload:
                    invoice.invoice_date = payload["invoice_date"]
                if "canonical_data" in payload:
                    invoice.canonical_data = payload["canonical_data"]
                
                invoice.save()
                
                # Update status to REVIEW if was DRAFT
                if invoice.status == "DRAFT":
                    update_invoice_status(invoice, "REVIEW", user=request.user, save=True)
                
                return Response({
                    "id": invoice.id,
                    "status": invoice.status,
                }, status=status.HTTP_200_OK)
                
        except Exception as e:
            logger.error(f"Error updating ICDC invoice: {e}", exc_info=True)
            return Response(
                {"error": f"Failed to update invoice: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def delete(self, request, pk):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=status.HTTP_400_BAD_REQUEST)

        if not _check_extension_enabled(tenant):
            return Response(
                {"error": "Telangana Liquor extension is not enabled"},
                status=status.HTTP_403_FORBIDDEN
            )

        invoice = get_object_or_404(ICDCInvoice, id=pk, tenant=tenant)

        # Only allow deletion if DRAFT or REVIEW
        if invoice.status not in ["DRAFT", "REVIEW"]:
            return Response(
                {"error": f"Cannot delete invoice with status {invoice.status}. Use cancellation instead."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            invoice.delete()
            return Response({"success": True}, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"Error deleting ICDC invoice: {e}", exc_info=True)
            return Response(
                {"error": f"Failed to delete invoice: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ICDCReversalView(APIView):
    """
    POST /api/v1/domain-extensions/telangana-liquor/icdc/{id}/reverse
    
    Reverse an ICDC invoice (with approval check).
    Requires OWNER or ADMIN role.
    """
    permission_classes = [IsAuthenticated, IsOwnerOrAdmin]

    def post(self, request, pk):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=status.HTTP_400_BAD_REQUEST)

        if not _check_extension_enabled(tenant):
            return Response(
                {"error": "Telangana Liquor extension is not enabled"},
                status=status.HTTP_403_FORBIDDEN
            )

        invoice = get_object_or_404(ICDCInvoice, id=pk, tenant=tenant)

        if invoice.status != "RECEIVED":
            return Response(
                {"error": f"Cannot reverse invoice with status {invoice.status}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        payload = request.data or {}
        reason = payload.get("reason", "")

        # Approval check is handled by IsOwnerOrAdmin permission class

        try:
            ledger_entries, warnings = reverse_icdc_invoice(invoice, request.user, reason=reason)
            
            return Response({
                "success": True,
                "invoice_id": invoice.id,
                "warnings": warnings,
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Error reversing ICDC invoice: {e}", exc_info=True)
            return Response(
                {"error": f"Failed to reverse invoice: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

