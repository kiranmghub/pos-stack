# pos-backend/tenant_admin/documents_api.py
"""
Documents API endpoints for tenant document management.
Provides secure, tenant-scoped access to TenantDoc resources.
"""
import logging
import mimetypes

from django.db import transaction, models
from django.http import FileResponse, Http404
from django.core.files.storage import default_storage
from django.core.files.storage.filesystem import FileSystemStorage
from django.conf import settings
from rest_framework import status
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser

from tenants.models import TenantDoc
from orders.models import AuditLog
from .serializers import TenantDocSerializer, TenantDocUploadSerializer
from .permissions import IsOwnerOrAdmin
from .utils import convert_image_to_pdf

logger = logging.getLogger(__name__)


def _resolve_request_tenant(request):
    """Helper to get tenant from request."""
    return getattr(request, "tenant", None)


class TenantDocumentListView(ListAPIView):
    """
    List tenant documents with pagination, filtering, and search.
    
    GET /api/v1/tenant_admin/documents/?page=1&page_size=25&search=invoice&doc_type=VENDOR_INVOICE&ordering=-created_at
    """
    permission_classes = [IsAuthenticated, IsOwnerOrAdmin]
    serializer_class = TenantDocSerializer
    
    def get_queryset(self):
        """Filter by tenant and apply search/filter/ordering."""
        tenant = _resolve_request_tenant(self.request)
        if not tenant:
            return TenantDoc.objects.none()
        
        # Base queryset with tenant isolation
        qs = TenantDoc.objects.filter(tenant=tenant).select_related(
            "tenant",
            "uploaded_by",
            "subject_user__user",
        ).prefetch_related("purchase_orders")
        
        # Search: search in label and description
        search_query = (self.request.GET.get("search") or "").strip()
        if search_query:
            qs = qs.filter(
                models.Q(label__icontains=search_query) |
                models.Q(description__icontains=search_query)
            )
        
        # Filter by document type
        doc_type = (self.request.GET.get("doc_type") or "").strip()
        if doc_type:
            qs = qs.filter(doc_type=doc_type)
        
        # Ordering
        ordering = (self.request.GET.get("ordering") or "-created_at").strip()
        allowed_ordering = ["created_at", "-created_at", "label", "-label", "updated_at", "-updated_at"]
        if ordering in allowed_ordering:
            qs = qs.order_by(ordering)
        else:
            qs = qs.order_by("-created_at", "label")
        
        return qs
    
    def list(self, request, *args, **kwargs):
        """Override to implement custom pagination matching existing patterns."""
        qs = self.get_queryset()
        
        # Pagination parameters
        page_size = int(request.GET.get("page_size") or 25)
        page = int(request.GET.get("page") or 1)
        
        # Enforce max page size
        max_page_size = 100
        if page_size > max_page_size:
            page_size = max_page_size
        
        # Calculate pagination
        total = qs.count()
        start = (page - 1) * page_size
        rows = qs[start:start + page_size]
        
        # Serialize with request context for URL generation
        serializer = self.get_serializer(rows, many=True, context={"request": request})
        
        return Response({
            "count": total,
            "results": serializer.data,
        })


class TenantDocumentDetailView(RetrieveAPIView):
    """
    Retrieve a single document by ID.
    
    GET /api/v1/tenant_admin/documents/{id}/
    """
    permission_classes = [IsAuthenticated, IsOwnerOrAdmin]
    serializer_class = TenantDocSerializer
    
    def get_queryset(self):
        """Filter by tenant for security."""
        tenant = _resolve_request_tenant(self.request)
        if not tenant:
            return TenantDoc.objects.none()
        return TenantDoc.objects.filter(tenant=tenant).select_related(
            "tenant",
            "uploaded_by",
            "subject_user__user",
        ).prefetch_related("purchase_orders")
    
    def delete(self, request, *args, **kwargs):
        """Delegate DELETE requests to TenantDocumentDeleteView."""
        # Get the document
        doc = self.get_object()
        tenant = _resolve_request_tenant(request)
        
        # Check if already deleted
        if doc.is_deleted:
            return Response(
                {"error": "Document has already been deleted"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if linked to Purchase Orders (constraint)
        if doc.is_linked_to_pos():
            linked_pos_count = doc.purchase_orders.count()
            return Response(
                {
                    "error": f"Cannot delete document. It is linked to {linked_pos_count} purchase order(s). "
                             "Please remove the document from all purchase orders before deleting."
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Perform soft delete
        try:
            with transaction.atomic():
                # Store metadata for audit log
                doc_label = doc.label
                doc_type = doc.doc_type or "N/A"
                
                # Soft delete
                doc.soft_delete(user=request.user)
                
                # Log deletion in audit trail
                try:
                    AuditLog.record(
                        tenant=tenant,
                        user=request.user,
                        action="DOCUMENT_DELETED",
                        severity="info",
                        metadata={
                            "document_id": doc.id,
                            "document_label": doc_label,
                            "document_type": doc_type,
                            "file_name": doc.file.name if doc.file else None,
                        },
                    )
                except Exception as audit_error:
                    # Don't fail deletion if audit logging fails, but log it
                    logger.warning(f"Failed to log document deletion to audit trail: {str(audit_error)}")
                
                logger.info(
                    f"User {request.user.username} soft-deleted document {doc.id} "
                    f"({doc_label}) for tenant {tenant.code}"
                )
                
                return Response(
                    {"message": "Document deleted successfully"},
                    status=status.HTTP_200_OK
                )
                
        except Exception as e:
            logger.error(f"Error deleting document {doc.id}: {str(e)}", exc_info=True)
            return Response(
                {"error": "Failed to delete document. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class TenantDocumentFileView(APIView):
    """
    Proxied file download endpoint with authentication and permission checks.
    This ensures files are only accessible to authorized users.
    
    GET /api/v1/tenant_admin/documents/{id}/file
    """
    permission_classes = [IsAuthenticated, IsOwnerOrAdmin]
    
    def get(self, request, pk):
        """Serve file with tenant isolation and permission checks."""
        tenant = getattr(request, "tenant", None)
        if not tenant:
            return Response(
                {"detail": "Tenant not found"},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Get document with tenant isolation
        try:
            doc = TenantDoc.objects.select_related("tenant", "uploaded_by").get(
                pk=pk,
                tenant=tenant  # ✅ Critical: tenant isolation
            )
        except TenantDoc.DoesNotExist:
            raise Http404("Document not found")
        
        # Verify file exists
        if not doc.file or not doc.file.name:
            raise Http404("File not found")
        
        # ✅ Log access (audit trail)
        logger.info(
            f"Document accessed: id={doc.id}, "
            f"label={doc.label}, "
            f"user={request.user.username}, "
            f"tenant={tenant.code}, "
            f"ip={request.META.get('REMOTE_ADDR', 'unknown')}"
        )
        
        # Handle S3 storage
        if settings.USE_S3_MEDIA:
            try:
                import boto3
                from botocore.config import Config
                from datetime import timedelta
                
                # Generate presigned URL (expires in 5 minutes)
                s3_client = boto3.client(
                    "s3",
                    config=Config(signature_version="s3v4"),
                    region_name=settings.AWS_S3_REGION_NAME,
                )
                
                presigned_url = s3_client.generate_presigned_url(
                    "get_object",
                    Params={
                        "Bucket": settings.AWS_STORAGE_BUCKET_NAME,
                        "Key": doc.file.name,
                    },
                    ExpiresIn=300  # 5 minutes
                )
                
                return Response({
                    "file_url": presigned_url,
                    "expires_in": 300,
                })
            except Exception as e:
                logger.error(f"Error generating S3 presigned URL: {str(e)}")
                # Fall through to local file serving
        
        # Handle local storage (proxied download)
        try:
            # ✅ Security: Verify file actually exists in storage
            if not default_storage.exists(doc.file.name):
                logger.warning(f"File not found in storage: {doc.file.name}")
                raise Http404("File not found in storage")
            
            # Open and serve file
            file_obj = default_storage.open(doc.file.name, "rb")
            
            # Determine content type
            content_type = "application/octet-stream"
            
            # Try to get content type from file storage (if available)
            try:
                # Some storage backends may provide content_type
                if hasattr(doc.file, "content_type") and doc.file.content_type:
                    content_type = doc.file.content_type
            except (AttributeError, ValueError):
                pass
            
            # If still default, infer from file extension
            if content_type == "application/octet-stream":
                ext = doc.file.name.split(".")[-1].lower() if "." in doc.file.name else ""
                mime_map = {
                    "pdf": "application/pdf",
                    "jpg": "image/jpeg",
                    "jpeg": "image/jpeg",
                    "png": "image/png",
                    "gif": "image/gif",
                    "bmp": "image/bmp",
                    "tiff": "image/tiff",
                    "tif": "image/tiff",
                    "doc": "application/msword",
                    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    "xls": "application/vnd.ms-excel",
                    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                }
                content_type = mime_map.get(ext, "application/octet-stream")
            
            # Create file response
            response = FileResponse(
                file_obj,
                content_type=content_type,
            )
            
            # Set filename for download
            filename = doc.file.name.split("/")[-1]
            response["Content-Disposition"] = f'inline; filename="{filename}"'
            
            # Security headers
            response["X-Content-Type-Options"] = "nosniff"
            response["Content-Security-Policy"] = "default-src 'self'"
            
            return response
            
        except Exception as e:
            logger.error(f"Error serving file for document {doc.id}: {str(e)}")
            raise Http404("Error serving file")


class TenantDocumentUploadView(APIView):
    """
    Upload a new tenant document.
    
    POST /api/v1/tenant_admin/documents/upload/
    Content-Type: multipart/form-data
    
    Fields:
    - file: File (required)
    - label: string (required)
    - doc_type: string (optional)
    - description: string (optional)
    - metadata: JSON string (optional)
    """
    permission_classes = [IsAuthenticated, IsOwnerOrAdmin]
    parser_classes = [MultiPartParser, FormParser]
    
    def post(self, request, *args, **kwargs):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response(
                {"error": "Tenant not resolved"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate input
        serializer = TenantDocUploadSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"errors": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        validated_data = serializer.validated_data
        uploaded_file = validated_data["file"]
        
        # Determine if file is an image
        content_type = uploaded_file.content_type or ""
        file_extension = (uploaded_file.name or "").split(".")[-1].lower()
        
        is_image = (
            content_type.startswith("image/") or
            file_extension in ["jpg", "jpeg", "png", "gif", "webp", "tiff", "tif", "bmp"]
        )
        
        # Convert image to PDF if needed
        file_to_save = uploaded_file
        if is_image:
            try:
                file_to_save = convert_image_to_pdf(uploaded_file)
                logger.info(f"Converted image {uploaded_file.name} to PDF")
            except Exception as e:
                logger.error(f"Error converting image to PDF: {str(e)}", exc_info=True)
                return Response(
                    {"error": "Failed to convert image to PDF. Please try again."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
        
        # Two-step save: Create instance first, then assign file
        try:
            with transaction.atomic():
                # Step 1: Create TenantDoc without file
                doc = TenantDoc.objects.create(
                    tenant=tenant,
                    label=validated_data["label"],
                    doc_type=validated_data.get("doc_type", ""),
                    description=validated_data.get("description", ""),
                    metadata=validated_data.get("metadata", {}),
                    uploaded_by=request.user,
                )
                
                # Step 2: Assign file (now doc.id exists for upload_to function)
                doc.file.save(
                    file_to_save.name,
                    file_to_save,
                    save=True
                )
                
                # Refresh to ensure all fields are populated
                doc.refresh_from_db()
                
                # Serialize and return
                response_serializer = TenantDocSerializer(
                    doc,
                    context={"request": request}
                )
                
                logger.info(
                    f"User {request.user.username} uploaded document {doc.id} "
                    f"({doc.label}) for tenant {tenant.code}"
                )
                
                return Response(
                    response_serializer.data,
                    status=status.HTTP_201_CREATED
                )
                
        except Exception as e:
            logger.error(f"Error uploading document: {str(e)}", exc_info=True)
            return Response(
                {"error": "Failed to upload document. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )



