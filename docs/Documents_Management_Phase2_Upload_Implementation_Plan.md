# Documents Management - Phase 2: Upload Functionality Implementation Plan

## Overview
This document outlines the implementation plan for Phase 2 of the Documents Management UI: enabling document uploads with production-grade security, validation, and image-to-PDF conversion.

**Status**: Planning Phase  
**Created**: 2025-12-10  
**Target**: Enable secure document uploads with comprehensive validation and security measures

---

## 1. Requirements Summary

### 1.1 Functional Requirements
- **FR1**: Upload documents via drag-and-drop or file picker
- **FR2**: Support PDF, images (JPEG, PNG, GIF, WebP, TIFF, BMP)
- **FR3**: Automatically convert images to PDF during upload
- **FR4**: Validate file size, type, and MIME type
- **FR5**: Sanitize filenames to prevent security issues
- **FR6**: Provide upload progress feedback
- **FR7**: Handle upload errors gracefully with user-friendly messages
- **FR8**: Validate required metadata (label, doc_type) before upload
- **FR9**: Support metadata entry (label, description, doc_type)
- **FR10**: Enforce tenant isolation and permissions (Owners and Admins only)

### 1.2 Non-Functional Requirements
- **NFR1**: Maximum file size: 10MB (configurable)
- **NFR2**: MIME type validation using `python-magic` or similar
- **NFR3**: Filename sanitization to prevent path traversal
- **NFR4**: Image-to-PDF conversion using Pillow + reportlab
- **NFR5**: Comprehensive error handling and logging
- **NFR6**: Production-grade security measures
- **NFR7**: Support for both local and S3 storage

---

## 2. Architecture & Design

### 2.1 Backend Architecture

#### API Endpoint
```
POST /api/v1/tenant_admin/documents/
Content-Type: multipart/form-data

Request Fields:
- file: File (required)
- label: string (required, max 160 chars)
- doc_type: string (optional, max 80 chars)
- description: string (optional)
- metadata: JSON string (optional)

Response:
{
  "id": 123,
  "label": "Invoice ABC-001",
  "doc_type": "VENDOR_INVOICE",
  "file_url": "/api/v1/tenant_admin/documents/123/file/",
  "file_name": "123_invoice_abc_001.pdf",
  "file_size": 245760,
  "file_type": "application/pdf",
  "created_at": "2025-12-10T10:30:00Z"
}
```

#### Upload Flow
1. **Validation Phase**:
   - Check user permissions (IsOwnerOrAdmin)
   - Validate file size (max 10MB)
   - Validate file type (MIME type + extension)
   - Validate required fields (label)
   - Sanitize filename

2. **Processing Phase**:
   - If image → convert to PDF
   - If PDF → use as-is
   - Create TenantDoc instance (two-step save for filename generation)

3. **Storage Phase**:
   - Save file to storage (local or S3)
   - Update TenantDoc with file reference
   - Return document details

### 2.2 Frontend Architecture

#### Component Structure
```
pos-frontend/src/features/documents/
├── components/
│   ├── DocumentUploadModal.tsx    # Main upload modal
│   ├── DocumentUploadDropzone.tsx # Drag-and-drop component
│   └── DocumentUploadProgress.tsx # Upload progress indicator
```

#### Upload Flow
1. User clicks "Upload Document" button
2. Modal opens with file picker/dropzone
3. User selects/drops file
4. Client-side validation (size, type)
5. User fills in metadata (label, doc_type, description)
6. Click "Upload"
7. Show progress indicator
8. Upload file with FormData
9. Handle success/error responses
10. Refresh documents list

---

## 3. Implementation Details

### 3.1 Backend Implementation

#### Step 1: Install Dependencies
```bash
# Add to requirements.txt or install directly
pip install python-magic-bin  # Windows
pip install python-magic      # Linux/Mac
pip install Pillow
pip install reportlab
```

**Note**: For production, consider:
- `python-magic` for MIME type detection (requires `libmagic` system library)
- Alternative: Use `Pillow` for image validation (already available)

#### Step 2: Create Upload Serializer (`pos-backend/tenant_admin/serializers.py`)
```python
class TenantDocUploadSerializer(serializers.Serializer):
    """Serializer for document upload (multipart/form-data)."""
    label = serializers.CharField(max_length=160, required=True)
    doc_type = serializers.CharField(max_length=80, required=False, allow_blank=True)
    description = serializers.CharField(required=False, allow_blank=True)
    metadata = serializers.JSONField(required=False, default=dict)
    file = serializers.FileField(required=True)
    
    def validate_file(self, value):
        """Validate file size and type."""
        # Size validation
        MAX_SIZE = 10 * 1024 * 1024  # 10MB
        if value.size > MAX_SIZE:
            raise serializers.ValidationError(
                f"File size exceeds maximum of {MAX_SIZE / (1024*1024):.0f}MB"
            )
        
        # MIME type validation
        ALLOWED_MIME_TYPES = [
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
            "image/tiff",
            "image/bmp",
        ]
        
        # Check content type
        content_type = value.content_type or ""
        file_extension = (value.name or "").split(".")[-1].lower()
        
        # Extension whitelist
        ALLOWED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "gif", "webp", "tiff", "tif", "bmp"]
        
        is_valid = False
        if content_type in ALLOWED_MIME_TYPES:
            is_valid = True
        elif file_extension in ALLOWED_EXTENSIONS:
            is_valid = True
        
        if not is_valid:
            raise serializers.ValidationError(
                "Invalid file type. Allowed: PDF, JPEG, PNG, GIF, WebP, TIFF, BMP"
            )
        
        return value
```

#### Step 3: Create Image-to-PDF Converter (`pos-backend/tenant_admin/utils.py`)
```python
from io import BytesIO
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.utils import ImageReader
from django.core.files.base import ContentFile

def convert_image_to_pdf(image_file):
    """
    Convert an image file to PDF.
    
    Args:
        image_file: Django UploadedFile (image)
    
    Returns:
        ContentFile: PDF file ready to be saved
    """
    try:
        # Open image with Pillow
        img = Image.open(image_file)
        
        # Convert RGBA to RGB if necessary (for PNG with transparency)
        if img.mode == "RGBA":
            rgb_img = Image.new("RGB", img.size, (255, 255, 255))
            rgb_img.paste(img, mask=img.split()[3])  # Use alpha channel as mask
            img = rgb_img
        elif img.mode != "RGB":
            img = img.convert("RGB")
        
        # Create PDF
        buffer = BytesIO()
        
        # Calculate page size (fit image to page, maintaining aspect ratio)
        img_width, img_height = img.size
        page_width, page_height = A4
        
        # Scale to fit page
        scale_width = page_width / img_width
        scale_height = page_height / img_height
        scale = min(scale_width, scale_height)
        
        scaled_width = img_width * scale
        scaled_height = img_height * scale
        
        # Center image on page
        x_offset = (page_width - scaled_width) / 2
        y_offset = (page_height - scaled_height) / 2
        
        # Create PDF
        pdf = canvas.Canvas(buffer, pagesize=A4)
        
        # Convert PIL image to format reportlab can use
        img_buffer = BytesIO()
        img.save(img_buffer, format="JPEG", quality=95)
        img_buffer.seek(0)
        img_reader = ImageReader(img_buffer)
        
        # Draw image on PDF
        pdf.drawImage(
            img_reader,
            x_offset,
            y_offset,
            width=scaled_width,
            height=scaled_height,
            preserveAspectRatio=True,
        )
        
        pdf.save()
        buffer.seek(0)
        
        # Create ContentFile with .pdf extension
        original_name = image_file.name or "image"
        base_name = ".".join(original_name.split(".")[:-1]) if "." in original_name else original_name
        pdf_filename = f"{base_name}.pdf"
        
        return ContentFile(buffer.read(), name=pdf_filename)
        
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error converting image to PDF: {str(e)}", exc_info=True)
        raise ValueError(f"Failed to convert image to PDF: {str(e)}")
```

#### Step 4: Create Upload View (`pos-backend/tenant_admin/documents_api.py`)
```python
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from django.db import transaction
from django.core.files.base import ContentFile
import logging
import mimetypes
import os

from tenants.models import TenantDoc
from .permissions import IsOwnerOrAdmin
from .serializers import TenantDocUploadSerializer, TenantDocSerializer
from .utils import convert_image_to_pdf
from common.api_mixins import _resolve_request_tenant

logger = logging.getLogger(__name__)

class TenantDocumentUploadView(APIView):
    """
    Upload a new tenant document.
    
    POST /api/v1/tenant_admin/documents/
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
```

#### Step 5: Update URL Routes (`pos-backend/tenant_admin/urls.py`)
```python
from .documents_api import (
    TenantDocumentListView,
    TenantDocumentDetailView,
    TenantDocumentFileView,
    TenantDocumentUploadView,  # NEW
)

urlpatterns = [
    # ... existing patterns ...
    path("documents/", TenantDocumentListView.as_view(), name="documents-list"),
    path("documents/<int:pk>/", TenantDocumentDetailView.as_view(), name="documents-detail"),
    path("documents/<int:pk>/file/", TenantDocumentFileView.as_view(), name="documents-file"),
    path("documents/upload/", TenantDocumentUploadView.as_view(), name="documents-upload"),  # NEW
]
```

**Note**: We can use the same endpoint (`documents/`) with POST method instead of a separate `/upload/` endpoint. Let's use `POST /api/v1/tenant_admin/documents/` for consistency with REST patterns.

### 3.2 Frontend Implementation

#### Step 1: Update API Functions (`pos-frontend/src/features/documents/api/documents.ts`)
```typescript
export interface UploadDocumentParams {
  file: File;
  label: string;
  doc_type?: string;
  description?: string;
  metadata?: Record<string, any>;
}

/**
 * Upload a new document.
 */
export async function uploadDocument(
  params: UploadDocumentParams
): Promise<Document> {
  const formData = new FormData();
  formData.append("file", params.file);
  formData.append("label", params.label);
  if (params.doc_type) {
    formData.append("doc_type", params.doc_type);
  }
  if (params.description) {
    formData.append("description", params.description);
  }
  if (params.metadata) {
    formData.append("metadata", JSON.stringify(params.metadata));
  }

  const response = await apiFetch("/api/v1/tenant_admin/documents/", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { error: errorText };
    }
    throw new Error(errorData.error || errorData.errors || "Failed to upload document");
  }

  return response.json();
}
```

#### Step 2: Create Upload Dropzone Component (`pos-frontend/src/features/documents/components/DocumentUploadDropzone.tsx`)
```typescript
import React, { useCallback } from "react";
import { Upload, File, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DocumentUploadDropzoneProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  onRemove: () => void;
  disabled?: boolean;
  accept?: string;
  maxSize?: number; // in bytes
}

export function DocumentUploadDropzone({
  onFileSelect,
  selectedFile,
  onRemove,
  disabled = false,
  accept = ".pdf,.jpg,.jpeg,.png,.gif,.webp,.tiff,.tif,.bmp",
  maxSize = 10 * 1024 * 1024, // 10MB default
}: DocumentUploadDropzoneProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  const [error, setError] = React.useState<string>("");

  const validateFile = useCallback((file: File): string | null => {
    // Check file size
    if (file.size > maxSize) {
      return `File size exceeds maximum of ${(maxSize / (1024 * 1024)).toFixed(0)}MB`;
    }

    // Check file type
    const extension = file.name.split(".").pop()?.toLowerCase();
    const allowedExtensions = ["pdf", "jpg", "jpeg", "png", "gif", "webp", "tiff", "tif", "bmp"];
    
    if (!extension || !allowedExtensions.includes(extension)) {
      return "Invalid file type. Allowed: PDF, JPEG, PNG, GIF, WebP, TIFF, BMP";
    }

    return null;
  }, [maxSize]);

  const handleFile = useCallback((file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    onFileSelect(file);
  }, [validateFile, onFileSelect]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    if (disabled) return;

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  }, [disabled, handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  return (
    <div className="space-y-2">
      {!selectedFile ? (
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
            isDragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !disabled && document.getElementById("file-input")?.click()}
        >
          <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-sm font-medium mb-1">
            Drag and drop a file here, or click to select
          </p>
          <p className="text-xs text-muted-foreground">
            PDF, JPEG, PNG, GIF, WebP, TIFF, BMP (max {(maxSize / (1024 * 1024)).toFixed(0)}MB)
          </p>
          <input
            id="file-input"
            type="file"
            accept={accept}
            onChange={handleFileInput}
            className="hidden"
            disabled={disabled}
          />
        </div>
      ) : (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card">
          <File className="h-8 w-8 text-primary" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{selectedFile.name}</p>
            <p className="text-xs text-muted-foreground">
              {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
            </p>
          </div>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="p-1 rounded hover:bg-destructive/10 text-destructive disabled:opacity-50"
            aria-label="Remove file"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      {error && (
        <div className="text-sm text-destructive border border-destructive/40 bg-destructive/10 rounded-md px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}
```

#### Step 3: Create Upload Modal Component (`pos-frontend/src/features/documents/components/DocumentUploadModal.tsx`)
```typescript
import React, { useState } from "react";
import { X, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DocumentUploadDropzone } from "./DocumentUploadDropzone";
import { uploadDocument, type UploadDocumentParams } from "../api/documents";
import { useNotify } from "@/lib/notify";

interface DocumentUploadModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const DOC_TYPES = [
  "VENDOR_INVOICE",
  "LICENSE",
  "GST",
  "PAN",
  "TAX_RETURN",
  "CONTRACT",
  "OTHER",
];

export function DocumentUploadModal({
  open,
  onClose,
  onSuccess,
}: DocumentUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [docType, setDocType] = useState("");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const notify = useNotify();

  React.useEffect(() => {
    if (!open) {
      // Reset form when modal closes
      setFile(null);
      setLabel("");
      setDocType("");
      setDescription("");
      setUploading(false);
      setError("");
    }
  }, [open]);

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a file");
      return;
    }

    if (!label.trim()) {
      setError("Label is required");
      return;
    }

    setError("");
    setUploading(true);

    try {
      const params: UploadDocumentParams = {
        file,
        label: label.trim(),
        doc_type: docType || undefined,
        description: description.trim() || undefined,
      };

      await uploadDocument(params);
      notify.success("Document uploaded successfully");
      
      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (err: any) {
      const errorMessage = err?.message || "Failed to upload document";
      setError(errorMessage);
      notify.error(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl rounded-2xl bg-card text-foreground shadow-2xl border border-border max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">Upload Document</h2>
          <button
            className="p-1 rounded hover:bg-white/5"
            onClick={onClose}
            disabled={uploading}
            aria-label="Close"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* File Upload */}
          <div>
            <Label className="text-sm font-medium mb-2 block">File *</Label>
            <DocumentUploadDropzone
              onFileSelect={setFile}
              selectedFile={file}
              onRemove={() => setFile(null)}
              disabled={uploading}
            />
          </div>

          {/* Label */}
          <div>
            <Label htmlFor="label" className="text-sm font-medium">
              Label *
            </Label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., Invoice ABC-001"
              disabled={uploading}
              className="mt-1"
              maxLength={160}
            />
          </div>

          {/* Document Type */}
          <div>
            <Label htmlFor="docType" className="text-sm font-medium">
              Document Type
            </Label>
            <Select value={docType} onValueChange={setDocType} disabled={uploading}>
              <SelectTrigger id="docType" className="mt-1">
                <SelectValue placeholder="Select type (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {DOC_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description" className="text-sm font-medium">
              Description
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              disabled={uploading}
              className="mt-1"
              rows={3}
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-sm text-destructive border border-destructive/40 bg-destructive/10 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={uploading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={uploading || !file || !label.trim()}
          >
            {uploading ? (
              <>
                <Upload className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

#### Step 4: Integrate into DocumentsPage (`pos-frontend/src/features/documents/DocumentsPage.tsx`)
```typescript
// Add import
import { DocumentUploadModal } from "./components/DocumentUploadModal";

// Add state
const [uploadModalOpen, setUploadModalOpen] = useState(false);

// Add button in header (after PageHeading)
<div className="flex items-center justify-between">
  <PageHeading
    title="Documents"
    subtitle="Manage all tenant-related documents, invoices, and files"
  />
  <Button onClick={() => setUploadModalOpen(true)}>
    <Upload className="h-4 w-4 mr-2" />
    Upload Document
  </Button>
</div>

// Add modal at end of component
<DocumentUploadModal
  open={uploadModalOpen}
  onClose={() => setUploadModalOpen(false)}
  onSuccess={() => {
    // Invalidate and refetch documents
    queryClient.invalidateQueries({ queryKey: ["documents"] });
  }}
/>
```

---

## 4. Security Considerations

### 4.1 Backend Security
- ✅ **File Size Limits**: Enforce maximum file size (10MB)
- ✅ **MIME Type Validation**: Validate actual file content (not just extension)
- ✅ **Filename Sanitization**: Use `slugify` and remove dangerous characters
- ✅ **Path Traversal Prevention**: Ensure `upload_to` function prevents `../` attacks
- ✅ **Permission Checks**: Enforce `IsOwnerOrAdmin` on upload endpoint
- ✅ **Tenant Isolation**: Ensure files are saved under tenant-specific paths
- ✅ **Error Handling**: Don't expose internal errors to clients
- ✅ **Logging**: Log all upload attempts for audit trails

### 4.2 Frontend Security
- ✅ **Client-Side Validation**: Validate file size and type before upload
- ✅ **Input Sanitization**: Sanitize label and description fields
- ✅ **Error Handling**: Display user-friendly error messages
- ✅ **Progress Feedback**: Show upload progress to users

### 4.3 Image-to-PDF Security
- ✅ **Memory Limits**: Process images in chunks if large
- ✅ **Exception Handling**: Catch and log conversion errors
- ✅ **File Validation**: Ensure image is valid before conversion

---

## 5. Testing Checklist

### Backend Tests
- [ ] Test file size validation (reject > 10MB)
- [ ] Test file type validation (reject invalid types)
- [ ] Test MIME type validation
- [ ] Test image-to-PDF conversion (JPEG, PNG, GIF)
- [ ] Test PDF upload (no conversion)
- [ ] Test permission enforcement (manager denied)
- [ ] Test tenant isolation (cannot upload to other tenant)
- [ ] Test required fields validation (label)
- [ ] Test filename sanitization
- [ ] Test two-step save process
- [ ] Test error handling and logging

### Frontend Tests
- [ ] Test drag-and-drop file selection
- [ ] Test file picker selection
- [ ] Test client-side file validation
- [ ] Test upload progress feedback
- [ ] Test error message display
- [ ] Test form validation (required fields)
- [ ] Test modal open/close
- [ ] Test document list refresh after upload

### Integration Tests
- [ ] Test full upload flow (select → fill metadata → upload)
- [ ] Test image upload (verify PDF conversion)
- [ ] Test PDF upload (verify no conversion)
- [ ] Test error scenarios (network error, validation error)
- [ ] Test upload cancellation

---

## 6. Dependencies

### Backend Dependencies
```python
# requirements.txt additions
Pillow>=10.0.0  # Image processing
reportlab>=4.0.0  # PDF generation
python-magic>=0.4.27  # MIME type detection (optional, for enhanced validation)
```

### Frontend Dependencies
- No new dependencies required (uses existing UI components)

---

## 7. Success Criteria

Phase 2 is complete when:
1. ✅ Users can upload documents via drag-and-drop or file picker
2. ✅ Images are automatically converted to PDF
3. ✅ File validation (size, type) works correctly
4. ✅ Upload errors are handled gracefully
5. ✅ Upload progress is shown to users
6. ✅ Uploaded documents appear in the documents list
7. ✅ All security measures are implemented
8. ✅ Tenant isolation is enforced
9. ✅ Permissions are enforced (Owners and Admins only)

---

**Document Version**: 1.0  
**Last Updated**: 2025-12-10  
**Status**: Ready for Implementation

