# Documents Management UI Implementation Plan

## Overview
This document outlines the implementation plan for a production-grade, tenant-scoped Documents Management UI accessible via the `/documents` route. This feature will allow tenants to view, search, filter, and manage all their uploaded documents (TenantDoc model instances), including vendor invoices, licenses, and other business documents.

**Status**: All Phases Complete ✅  
**Created**: 2025-12-10  
**Completed**: 2025-12-11  
**Target**: Standalone page at `/documents` route (✅ Achieved)

---

## 1. Requirements Summary

### 1.1 Functional Requirements
- **FR1**: List all tenant documents with pagination
- **FR2**: Filter documents by document type (e.g., `VENDOR_INVOICE`, `LICENSE`, `GST`, `PAN`, `OTHER`)
- **FR3**: Search documents by label/description
- **FR4**: View document metadata (upload date, uploaded by user, related vendor/invoice number from metadata)
- **FR5**: Download/view documents (open in new tab)
- **FR6**: Sort documents by upload date (newest/oldest), label (A-Z/Z-A)
- **FR7**: Display file size and file type/extension
- **FR8**: Link documents to related entities (e.g., link to Purchase Order if document is a vendor invoice)
- **FR9**: Tenant-scoped access (users can only see documents from their tenant)
- **FR10**: Role-based permissions (appropriate access control)

### 1.2 Non-Functional Requirements
- **NFR1**: Production-grade error handling and validation
- **NFR2**: Security: tenant isolation, file access controls
- **NFR3**: Performance: efficient pagination, optimized queries
- **NFR4**: Responsive UI matching existing design patterns
- **NFR5**: Comprehensive logging for audit trails

---

## 2. Current State Analysis

### 2.1 What Exists

#### Backend
- **Model**: `TenantDoc` model in `pos-backend/tenants/models.py`
  - Fields: `tenant`, `subject_user`, `uploaded_by`, `label`, `doc_type`, `file`, `description`, `metadata`
  - Indexes on `(tenant, doc_type)`, `(tenant, label)`, `(tenant, subject_user)`
  - Default ordering: `["-created_at", "label"]`
  - File upload path: `tenants/{tenant_code}/docs/{id}_{sanitized_filename}.{ext}`
- **Admin**: Django admin registered in `pos-backend/tenants/admin.py` with basic list/filter/search
- **File Upload**: Two-step save process implemented in `ExternalPOReceiveView` (creates TenantDoc with invoice documents)
- **File Serving**: Files served via Django `FileField.url` (uses `MEDIA_URL` or S3 if configured)

#### Frontend
- **PO Detail View**: Displays `invoice_document_url` link for Purchase Orders (`pos-frontend/src/features/inventory/operations/purchase-orders/PODetail.tsx`)
- **File Download Pattern**: Uses `<a href={url} target="_blank">` for opening files in new tab
- **Routing**: Standalone routes follow pattern: Route component wrapping AppShell (see `CatalogRoute`, `SalesRoute`, etc.)

### 2.2 What's Missing

#### Backend
- **API Endpoints**: No REST API for listing/retrieving TenantDoc instances
- **Serializer**: No DRF serializer for TenantDoc
- **ViewSet/Views**: No API views for CRUD operations on TenantDoc
- **Permissions**: No specific permissions class (can reuse existing patterns)
- **URL Routes**: No API routes under `/api/v1/tenant_admin/documents/` or similar

#### Frontend
- **Page Component**: No Documents page component
- **Route**: No `/documents` route in `main.tsx`
- **API Functions**: No API functions for documents CRUD
- **React Query Hooks**: No hooks for documents data fetching
- **UI Components**: No documents table/list component

---

## 3. Architecture & Design

### 3.1 Backend Architecture

#### API Endpoint Structure
```
GET    /api/v1/tenant_admin/documents/          - List documents (paginated, filtered, searchable)
GET    /api/v1/tenant_admin/documents/{id}/     - Retrieve single document
GET    /api/v1/tenant_admin/documents/{id}/file - Download file (redirect or serve)
POST   /api/v1/tenant_admin/documents/          - Upload new document (optional for future)
PATCH  /api/v1/tenant_admin/documents/{id}/     - Update document metadata (optional for future)
DELETE /api/v1/tenant_admin/documents/{id}/     - Delete document (optional for future)
```

#### Query Parameters (for List endpoint)
- `page`: Page number (default: 1)
- `page_size`: Items per page (default: 25, max: 100)
- `search`: Search query (searches `label` and `description`)
- `doc_type`: Filter by document type (exact match)
- `ordering`: Sort field (`created_at`, `-created_at`, `label`, `-label`)

#### Response Format (List)
```json
{
  "count": 42,
  "results": [
    {
      "id": 1,
      "label": "Invoice: INV-2024-001",
      "doc_type": "VENDOR_INVOICE",
      "description": "Vendor invoice for ABC Corp",
      "file_url": "https://...",
      "file_name": "Invoice_INV_2024_001.pdf",
      "file_size": 245760,
      "file_type": "application/pdf",
      "uploaded_by": {
        "id": 5,
        "username": "john_doe",
        "email": "john@example.com"
      },
      "subject_user": null,
      "metadata": {
        "vendor_id": 10,
        "vendor_invoice_number": "INV-2024-001",
        "external_po_number": "PO-EXT-001"
      },
      "related_pos": [  // Array of related Purchase Orders
        {
          "id": 123,
          "po_number": "PO-001",
          "status": "RECEIVED",
          "link_type": "direct"  // or "metadata" for fallback
        }
      ],
      "created_at": "2024-12-10T10:30:00Z",
      "updated_at": "2024-12-10T10:30:00Z"
    }
  ]
}
```

### 3.2 Frontend Architecture

#### Component Structure
```
pos-frontend/src/features/documents/
├── DocumentsRoute.tsx          # Route wrapper (uses AppShell)
├── DocumentsPage.tsx           # Main page component
├── components/
│   ├── DocumentsTable.tsx      # Data table component
│   ├── DocumentFilters.tsx     # Filter/search UI
│   └── DocumentDetailModal.tsx # Modal for viewing document details (optional)
├── api/
│   └── documents.ts            # API functions
└── hooks/
    └── useDocuments.ts         # React Query hooks
```

#### Routing
- Add route to `pos-frontend/src/main.tsx`:
  ```tsx
  {
    path: "/documents",
    element: (
      <ProtectedRoute>
        <OwnerOrAdmin>  // Or appropriate role gate
          <DocumentsRoute />
        </OwnerOrAdmin>
      </ProtectedRoute>
    ),
  }
  ```

---

## 4. Implementation Details

### 4.1 Backend Implementation

#### Step 1: Create Serializer (`pos-backend/tenant_admin/serializers.py`)
- **File**: Add to existing `tenant_admin/serializers.py`
- **Class**: `TenantDocSerializer`
- **Fields**:
  - Read: `id`, `label`, `doc_type`, `description`, `file_url` (via SerializerMethodField), `file_name` (extracted from file path), `file_size` (from file.size), `file_type` (from file.content_type or extension), `uploaded_by` (nested UserLiteSerializer), `subject_user` (optional, nested), `metadata`, `created_at`, `updated_at`
  - Optional: `related_pos` (array of related Purchase Orders via FK relationship + metadata fallback)
- **Methods**:
  - `get_file_url()`: Returns proxied download URL: `/api/v1/tenant_admin/documents/{id}/file`
  - `get_file_name()`: Extracts filename from `file.name`
  - `get_file_size()`: Returns `file.size` if available
  - `get_file_type()`: Returns `file.content_type` or infers from extension
  - `get_related_pos()`: Returns array of related Purchase Orders (via FK + metadata lookup)

#### Step 2: Create API Views (`pos-backend/tenant_admin/api.py` or new `tenant_admin/documents_api.py`)
- **Option A**: Add to existing `tenant_admin/api.py`
- **Option B**: Create new `tenant_admin/documents_api.py` for cleaner separation
- **Views**:
  - `TenantDocumentListView`: ListAPIView with pagination, filtering, search
  - `TenantDocumentDetailView`: RetrieveAPIView (optional, for future detail view)
  - `TenantDocumentFileView`: APIView for **proxied file download** (REQUIRED for security)
- **Permissions**: Create `IsOwnerOrAdmin` permission class (Owners and Admins only)
- **Filtering**:
  - Use `TenantScopedMixin` pattern (filter by `tenant=request.tenant`)
  - Search: `label__icontains` OR `description__icontains`
  - Filter: `doc_type=request.GET.get('doc_type')` if provided
  - Ordering: Support `created_at`, `-created_at`, `label`, `-label`
- **Pagination**: Manual pagination (matching pattern from `SalesListView`):
  ```python
  page_size = int(request.GET.get("page_size") or 25)
  page = int(request.GET.get("page") or 1)
  total = qs.count()
  start = (page - 1) * page_size
  rows = qs[start:start + page_size]
  return Response({"count": total, "results": serializer.data})
  ```

#### Step 3: Add URL Routes (`pos-backend/tenant_admin/urls.py`)
- Add direct paths (recommended for clarity):
  ```python
  path("documents", TenantDocumentListView.as_view(), name="documents-list"),
  path("documents/<int:pk>", TenantDocumentDetailView.as_view(), name="documents-detail"),
  path("documents/<int:pk>/file", TenantDocumentFileView.as_view(), name="documents-file"),
  ```

#### Step 4: Proxied File Download Endpoint (SECURITY CRITICAL)
- **Implementation**: Create `TenantDocumentFileView` APIView
- **Security Requirements**:
  - ✅ Tenant isolation: Filter by `tenant=request.tenant`
  - ✅ Permission checks: `IsOwnerOrAdmin` required
  - ✅ Access logging: Log all file access attempts
  - ✅ File existence verification: Check file exists in storage
  - ✅ For S3: Generate presigned URLs with expiration (5-15 minutes)
  - ✅ For local: Stream file via `FileResponse` with proper headers
- **Response**: 
  - For S3: Return JSON with signed URL: `{"file_url": "...", "expires_in": 300}`
  - For local: Stream file directly via `FileResponse`

### 4.2 Frontend Implementation

#### Step 1: API Functions (`pos-frontend/src/features/documents/api/documents.ts`)
- **Functions**:
  - `listDocuments(params)`: GET `/api/v1/tenant_admin/documents/`
    - Params: `page`, `page_size`, `search`, `doc_type`, `ordering`
    - Returns: `{ count: number, results: Document[] }`
  - `getDocument(id)`: GET `/api/v1/tenant_admin/documents/{id}/`
    - Returns: `Document`
- **Types**:
  ```typescript
  export interface Document {
    id: number;
    label: string;
    doc_type: string;
    description: string;
    file_url: string;
    file_name: string;
    file_size?: number;
      file_type?: string;
      uploaded_by: {
        id: number;
        username: string;
        email?: string;
      };
      subject_user?: {
        id: number;
        username: string;
      } | null;
      metadata: Record<string, any>;
      related_pos?: Array<{
        id: number;
        po_number: string;
        status: string;
        link_type: "direct" | "metadata";
      }>;
      created_at: string;
      updated_at: string;
  }
  ```

#### Step 2: React Query Hooks (`pos-frontend/src/features/documents/hooks/useDocuments.ts`)
- **Hooks**:
  - `useDocuments(queryParams)`: Query hook for listing
  - `useDocument(id)`: Query hook for single document
- **Options**: Enable pagination, caching, refetch on mount

#### Step 3: DocumentsTable Component (`pos-frontend/src/features/documents/components/DocumentsTable.tsx`)
- **Pattern**: Similar to `SalesTable` or reuse `DataTable` from `pos-frontend/src/features/admin/components/DataTable.tsx`
- **Columns**:
  - Label (link to view/download)
  - Document Type (badge/chip)
  - File Name
  - File Size (formatted: "245 KB", "2.3 MB")
  - Uploaded By (username)
  - Upload Date (formatted)
  - Actions (View/Download button)
- **Features**:
  - Clickable rows or action buttons to open file via proxied download endpoint
  - Display related Purchase Order links if `related_pos` array has items
  - Multiple PO links if document is linked to multiple POs
  - Responsive layout

#### Step 4: DocumentFilters Component (`pos-frontend/src/features/documents/components/DocumentFilters.tsx`)
- **Filters**:
  - Search input (debounced)
  - Document type dropdown (populated from existing `doc_type` values in DB)
  - Sort dropdown (created_at, label)
- **Pattern**: Similar to filters in `SalesPage` or `ProductTable`

#### Step 5: DocumentsPage Component (`pos-frontend/src/features/documents/DocumentsPage.tsx`)
- **Structure**:
  - `PageHeading` with title "Documents" and subtitle
  - `DocumentFilters` component
  - `DocumentsTable` component
  - Pagination controls (if not in table)
- **State Management**:
  - `page`, `pageSize`, `search`, `docType`, `ordering`
  - Use React Query for data fetching

#### Step 6: DocumentsRoute Component (`pos-frontend/src/features/documents/DocumentsRoute.tsx`)
- **Pattern**: Follow `CatalogRoute` pattern
- **Wraps**: `AppShell` with `DocumentsPage` as children
- **Config**: `title="Documents"`, `contained={true}`

#### Step 7: Add Route to Router (`pos-frontend/src/main.tsx`)
- **Location**: Add after `/tenant_admin` route
- **Role Gate**: Use `OwnerOrAdmin` or `IsInTenant` equivalent
- **Import**: `import DocumentsRoute from "@/features/documents/DocumentsRoute"`

### 4.3 Security Considerations

#### Backend
- **Tenant Scoping**: All queries MUST filter by `tenant=request.tenant`
- **Permission Checks**: Use `IsOwnerOrAdmin` (Owners and Admins only)
- **File Access**: **CRITICAL** - Use proxied download endpoint, never expose direct file URLs
  - For S3: Generate presigned URLs with expiration (5-15 minutes)
  - For local: Stream files via authenticated endpoint
- **Access Logging**: Log all file access attempts (document ID, user, tenant, IP, timestamp)
- **Input Validation**: Sanitize search queries, validate pagination parameters
- **Pagination Limits**: Enforce `max_page_size = 100` to prevent large queries
- **File Existence**: Verify file exists in storage before serving
- **Security Headers**: Set appropriate headers (X-Content-Type-Options, CSP)

#### Frontend
- **Route Protection**: Use `ProtectedRoute` and `OwnerOrAdmin` role gate
- **Error Handling**: Handle 403/404/500 gracefully with user-friendly messages
- **File Links**: Use proxied download endpoint, open in new tab with `target="_blank" rel="noopener noreferrer"`
- **Loading States**: Show loading indicators during file download
- **Error Messages**: Display clear error messages for access denied or file not found

### 4.4 Error Handling

#### Backend
- **Validation Errors**: Return 400 with detailed messages
- **Not Found**: Return 404 for invalid document IDs
- **Permission Denied**: Return 403 with clear message
- **Server Errors**: Log errors, return 500 with generic message

#### Frontend
- **API Errors**: Use `useNotify` for error toasts
- **Loading States**: Show loading indicators
- **Empty States**: Show friendly message when no documents found
- **Network Errors**: Retry logic or clear error messages

### 4.5 Testing Considerations

#### Backend Tests
- **Unit Tests**: Serializer validation, URL generation
- **API Tests**: List, retrieve, filtering, pagination, permissions
- **Integration Tests**: Tenant isolation, file access

#### Frontend Tests (Future)
- **Component Tests**: Table rendering, filters, pagination
- **Integration Tests**: Full page workflow
- **E2E Tests**: Upload, view, download flow

---

## 5. Implementation Checklist

### Phase 1: Backend API ✅ COMPLETE
- [x] **B1**: Create `TenantDocSerializer` in `tenant_admin/serializers.py`
- [x] **B2**: Create `TenantDocumentListView` in `tenant_admin/documents_api.py`
- [x] **B3**: Create `TenantDocumentDetailView`
- [x] **B4**: Add URL routes in `tenant_admin/urls.py`
- [x] **B5**: Create `IsOwnerOrAdmin` permission class and apply to all views
- [x] **B6**: Implement filtering, search, ordering logic
- [x] **B7**: Implement pagination (matching existing patterns)
- [x] **B8**: Test API endpoints (tested manually)
- [x] **B9**: Verify tenant isolation (verified in implementation)
- [x] **B10**: Implement proxied file download endpoint (`TenantDocumentFileView`)
- [x] **B11**: Add access logging for file downloads
- [x] **B12**: Test proxied download with local storage (S3 ready)
- [x] **B13**: Implement related PO lookup (FK + metadata fallback)

### Phase 1: Frontend API & Hooks ✅ COMPLETE
- [x] **F1**: Create `documents.ts` API file with `listDocuments()`, `getDocument()`, and `getDocumentFileUrl()`
- [x] **F2**: Define TypeScript interfaces for `Document` and related types
- [x] **F3**: Create `useDocuments.ts` hooks file with React Query hooks
- [x] **F4**: Test API functions (tested in browser)

### Phase 2: Upload Functionality ✅ COMPLETE
- [x] **U1**: Create `TenantDocumentUploadView` API endpoint in `tenant_admin/documents_api.py`
- [x] **U2**: Implement `TenantDocUploadSerializer` for file upload validation
- [x] **U3**: Add file validation (size, MIME type, extension) on backend
- [x] **U4**: Implement image-to-PDF conversion utility (`convert_image_to_pdf()` in `tenant_admin/utils.py`)
- [x] **U5**: Create `DocumentUploadModal.tsx` component
- [x] **U6**: Create `DocumentUploadDropzone.tsx` component for drag-and-drop
- [x] **U7**: Add file validation on frontend (size, type, extension)
- [x] **U8**: Integrate upload modal into `DocumentsPage`
- [x] **U9**: Implement upload success handling with table refresh
- [x] **U10**: Add upload endpoint URL route in `tenant_admin/urls.py`
- [x] **U11**: Test upload functionality with various file types
- [x] **U12**: Test image-to-PDF conversion

### Phase 3: Delete Functionality ✅ COMPLETE
- [x] **D1**: Add soft delete fields to `TenantDoc` model (`deleted_at`, `deleted_by`)
- [x] **D2**: Create `TenantDocManager` custom manager to filter deleted records
- [x] **D3**: Implement `soft_delete()` method on `TenantDoc` model
- [x] **D4**: Implement `is_linked_to_pos()` method for delete constraints
- [x] **D5**: Add `delete()` method to `TenantDocumentDetailView` API endpoint
- [x] **D6**: Implement delete constraints (prevent deletion if linked to POs)
- [x] **D7**: Add audit logging for delete operations
- [x] **D8**: Create `deleteDocument()` API function in frontend
- [x] **D9**: Add delete button to `DocumentsTable` component
- [x] **D10**: Integrate `DeleteConfirmModal` for delete confirmation
- [x] **D11**: Implement table refresh after deletion (refresh key pattern)
- [x] **D12**: Test delete functionality with and without PO constraints
- [x] **D13**: Test soft delete (verify records hidden but not removed from DB)

### Phase 4: Frontend UI Components ✅ COMPLETE
- [x] **F5**: Create `DocumentsTable.tsx` component
- [x] **F6**: Create `DocumentFilters.tsx` component
- [x] **F7**: Create `DocumentsPage.tsx` component
- [x] **F8**: Create `DocumentsRoute.tsx` component
- [x] **F9**: Add route to `main.tsx`
- [x] **F10**: Style components to match existing design
- [x] **F11**: Implement pagination UI
- [x] **F12**: Implement file download/view functionality
- [x] **F13**: Add links to Purchase Orders from `related_pos` array (support multiple POs)
- [x] **F14**: Implement deep linking for PO navigation (URL params: `/inventory?tab=purchase-orders&poId=X`)
- [x] **F15**: Add Documents card to home page (`HomePage.tsx`)

### Phase 5: Testing & Refinement ✅ COMPLETE
- [x] **T1**: Test full workflow: list, filter, search, paginate, view/download
- [x] **T2**: Test with different user roles (owner, admin - verified permissions)
- [x] **T3**: Test with empty state (no documents)
- [x] **T4**: Test with large datasets (pagination verified)
- [x] **T5**: Test file download for different file types (PDF, images - tested)
- [x] **T6**: Verify responsive design (mobile/tablet/desktop - matches existing patterns)
- [x] **T7**: Fix bugs and UX issues (CORS, file download, table refresh, PO navigation)

### Phase 6: Documentation & Cleanup
- [ ] **DOC1**: Add JSDoc comments to API functions (optional enhancement)
- [x] **DOC2**: Add inline comments for complex logic (implemented in critical areas)
- [x] **DOC3**: Update this document with completion status (in progress)
- [x] **DOC4**: Document deviations from plan (see below)

---

## 6. Reusable Patterns & Components

### Backend Patterns to Reuse
1. **TenantScopedMixin** (`common/api_mixins.py`) - For automatic tenant filtering
2. **Pagination Pattern** (`orders/views.py` SalesListView) - Manual pagination with count/results
3. **Permission Classes** (`tenant_admin/permissions.py`) - `IsTenantAdmin`, `IsInTenant`
4. **File URL Generation** (`catalog/api.py` ProductImageUploadView) - `build_absolute_uri()` pattern
5. **SerializerMethodField** - For computed fields like `file_url`, `file_name`

### Frontend Patterns to Reuse
1. **Route Pattern** (`CatalogRoute.tsx`) - AppShell wrapper
2. **Table Component** (`admin/components/DataTable.tsx`) - Reusable table with search/ordering
3. **API Pattern** (`catalog/api.ts`) - `apiFetchJSON()` with query params
4. **React Query Hooks** (`catalog/hooks/useProducts.ts`) - Query hooks pattern
5. **File Download** (`PODetail.tsx`) - `<a href={url} target="_blank">` pattern
6. **PageHeading** - Used across pages for consistent header
7. **useNotify** - For success/error toasts

---

## 7. Decisions & Implementation Strategy

### Q1: Permissions ✅ DECIDED
- **Decision**: **Owners and Admins only** can view documents
- **Implementation**: Create `IsOwnerOrAdmin` permission class
- **Rationale**: Documents contain sensitive business information (invoices, licenses, tax documents)

### Q2: Document Types ✅ DECIDED
- **Phase 1 Decision**: Allow free-form `doc_type` strings (no validation)
- **Phase 2 Decision**: Implement predefined enum (VENDOR_INVOICE, LICENSE, GST, PAN, TAX_RETURN, CONTRACT, OTHER)
- **Rationale**: Phase 1 is view-only, so no new uploads. Phase 2 will enforce strict validation with enum.

### Q3: File Download Method ✅ DECIDED
- **Decision**: **Proxied download endpoint** with authentication (production-grade security)
- **Implementation**: `TenantDocumentFileView` that verifies permissions and serves files
- **Rationale**: 
  - Prevents URL sharing/leakage
  - Provides access logging
  - Enforces tenant isolation
  - Supports signed URLs for S3 (with expiration)

### Q4: Upload Functionality ✅ COMPLETED
- **Original Decision**: **Deferred to Phase 2**
- **Actual Implementation**: **Implemented in Phase 2 (2025-12-11)**
- **Status**: ✅ Complete with file validation, image-to-PDF conversion, production-grade security
- **Note**: Virus scanning is not implemented (deferred to future enhancement)

### Q5: Delete Functionality ✅ COMPLETED
- **Original Decision**: **Deferred to Phase 2**
- **Actual Implementation**: **Implemented in Phase 3 (2025-12-11)**
- **Status**: ✅ Complete with soft delete, audit trails, delete constraints (prevents deletion if linked to POs)

### Q6: Related Entity Links ✅ DECIDED
- **Decision**: **Hybrid approach using direct FK relationship + metadata fallback**
- **Implementation**: 
  - Primary: Use `obj.purchase_orders.all()` (direct FK relationship)
  - Fallback: Query PO by `vendor_invoice_number` from metadata if no FK relationship
- **Rationale**: Leverages existing FK, handles legacy data, most efficient approach

---

## 8. Future Enhancements (Out of Scope - Not Yet Implemented)

- **Edit Metadata**: Update label, description, doc_type
- **Bulk Operations**: Bulk delete, bulk tag/type assignment
- **Document Preview**: In-browser preview for PDFs/images
- **Document Categories/Tags**: More granular organization
- **Versioning**: Track document versions/revisions
- **Access Logs**: Track who viewed/downloaded documents
- **Expiration Dates**: Track document expiration (for licenses, etc.)
- **Notifications**: Notify users when documents expire

---

## 9. Success Criteria

### Phase 1 Complete When: ✅ ALL CRITERIA MET
1. ✅ Backend API returns paginated list of tenant documents
2. ✅ Frontend page displays documents in a table
3. ✅ Users can filter by document type
4. ✅ Users can search by label/description
5. ✅ Users can sort by date/label
6. ✅ Users can click to view/download documents
7. ✅ Documents are properly tenant-scoped
8. ✅ File URLs work correctly (local storage tested, S3 ready)
9. ✅ UI matches existing design patterns
10. ✅ No security vulnerabilities (tenant isolation verified)

---

## 10. Notes & Assumptions

### Assumptions
- Files are stored in `MEDIA_ROOT` or S3 (configured via `USE_S3_MEDIA`)
- Document types are stored as free-form strings in Phase 1 (enum will be enforced in Phase 2)
- Metadata is JSON and may contain references to other entities (POs, vendors)
- Only Owners and Admins have view access (enforced via `IsOwnerOrAdmin` permission)
- File downloads use proxied endpoint (not direct URLs) for security

### Notes
- ✅ Upload and delete functionality have been implemented (originally planned for Phase 2)
- File URLs are generated server-side to ensure proper absolute URLs (especially for S3)
- The implementation follows existing patterns in the codebase for consistency
- Tenant isolation is critical - all queries must filter by `tenant=request.tenant`

---

**Document Version**: 2.0  
**Last Updated**: 2025-12-11  
**Status**: All Phases Complete ✅

## Implementation Completion Summary

**Final Completion Date**: 2025-12-11

### Phase 1: Backend API & Frontend View (Completed: 2025-12-10)
- ✅ Backend API with full CRUD (read-only) support
- ✅ Frontend UI with table, filters, search, and pagination
- ✅ Secure file download with authentication and CORS handling
- ✅ Related Purchase Order linking (direct FK + metadata fallback)
- ✅ Tenant isolation and permission enforcement
- ✅ Access logging for file downloads
- ✅ Production-grade error handling and validation

### Phase 2: Upload Functionality (Completed: 2025-12-11)
- ✅ Backend API endpoint for document upload (`POST /api/v1/tenant_admin/documents/upload/`)
- ✅ Image-to-PDF conversion utility (using Pillow and reportlab)
- ✅ File validation (size, MIME type, extension) on both frontend and backend
- ✅ Frontend upload modal with drag-and-drop support
- ✅ File preview and metadata input
- ✅ Production-grade security measures and error handling

### Phase 3: Delete Functionality (Completed: 2025-12-11)
- ✅ Soft delete implementation (`deleted_at`, `deleted_by` fields)
- ✅ Custom manager to filter deleted records
- ✅ Delete constraints (prevent deletion if linked to Purchase Orders)
- ✅ Audit logging for all delete operations
- ✅ Frontend delete button with confirmation modal
- ✅ Table refresh after deletion (React Query refresh key pattern)

### Additional Enhancements (Completed: 2025-12-11)
- ✅ Home page card for Documents feature (added to `/home` route)
- ✅ Deep linking for Purchase Order navigation (URL params support)
- ✅ Enhanced PO link navigation to Inventory page with auto-selection

### Key Fixes Applied:
- Fixed CORS preflight OPTIONS request handling in middleware
- Fixed file content type detection for Django FieldFile objects
- Fixed authenticated file download using blob URLs
- Fixed URL routing with trailing slashes
- Fixed React Query table refresh after delete (refresh key pattern)
- Fixed `notify` hook usage (changed to `success`/`error` destructuring)
- Fixed PO navigation logout issue (implemented deep linking instead of non-existent route)

### Deviations from Original Plan:

1. **Upload Functionality (Phase 2)**:
   - **Original Plan**: Deferred to future phase
   - **Actual**: Implemented immediately after Phase 1 due to user requirements
   - **Status**: Fully implemented with production-grade security

2. **Delete Functionality (Phase 3)**:
   - **Original Plan**: Deferred to future phase  
   - **Actual**: Implemented immediately after Phase 2 due to user requirements
   - **Status**: Fully implemented with soft delete, constraints, and audit logging

3. **Home Page Card**:
   - **Original Plan**: Not included in plan
   - **Actual**: Added at user request for better discoverability
   - **Status**: Implemented with appropriate permissions (owner/admin only)

4. **Deep Linking for POs**:
   - **Original Plan**: Basic PO links only
   - **Actual**: Enhanced with URL parameter-based deep linking to Inventory page
   - **Status**: Implemented to fix logout issue when clicking PO links

5. **Document Types Enum**:
   - **Original Plan**: Phase 2 would enforce enum validation
   - **Actual**: Still allowing free-form strings (enum enforcement deferred)
   - **Status**: Allows flexibility for existing data

### Future Enhancements (Out of Scope):
- Document types enum enforcement
- Bulk operations (bulk delete, bulk tag/type assignment)
- Document preview (in-browser preview for PDFs/images)
- Document versioning
- Document expiration dates and notifications
- Edit metadata functionality (update label, description, doc_type)
- Access logs UI (track who viewed/downloaded documents)

