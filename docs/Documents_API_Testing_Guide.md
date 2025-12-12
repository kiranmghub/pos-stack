# Documents API Testing Guide

This guide provides instructions for testing the Documents API endpoints.

## Prerequisites

1. Django server must be running (`python manage.py runserver`)
2. You need valid authentication credentials (username/password)
3. You need a tenant with Owner or Admin role

## Quick Test via Django Management Command

Run the automated test suite:

```bash
cd pos-backend
python manage.py test_documents_api
```

This will:
- Create test data (tenant, users, documents)
- Test all endpoints as different user roles
- Verify permissions and tenant isolation
- Report test results

## Manual Testing with curl

### 1. Get Authentication Token

First, obtain an access token:

```bash
curl -X POST http://localhost:8000/api/v1/auth/token/ \
  -H "Content-Type: application/json" \
  -d '{
    "username": "your_username",
    "password": "your_password",
    "tenant_code": "YOUR_TENANT_CODE"
  }'
```

Save the `access` token from the response.

### 2. Test List Documents Endpoint

```bash
curl -X GET "http://localhost:8000/api/v1/tenant_admin/documents/" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "X-Tenant-Id: YOUR_TENANT_ID"
```

**Expected Response (200 OK):**
```json
{
  "count": 2,
  "results": [
    {
      "id": 1,
      "label": "Invoice: INV-001",
      "doc_type": "VENDOR_INVOICE",
      "description": "...",
      "file_url": "http://localhost:8000/api/v1/tenant_admin/documents/1/file",
      "file_name": "invoice_001.pdf",
      "file_size": 245760,
      "file_type": "application/pdf",
      "uploaded_by": {
        "id": 1,
        "username": "admin",
        "email": "admin@example.com"
      },
      "related_pos": [
        {
          "id": 123,
          "po_number": "PO-001",
          "status": "RECEIVED",
          "link_type": "direct"
        }
      ],
      "created_at": "2024-12-10T10:30:00Z",
      "updated_at": "2024-12-10T10:30:00Z"
    }
  ]
}
```

### 3. Test Filtering and Search

**Search:**
```bash
curl -X GET "http://localhost:8000/api/v1/tenant_admin/documents/?search=invoice" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "X-Tenant-Id: YOUR_TENANT_ID"
```

**Filter by Document Type:**
```bash
curl -X GET "http://localhost:8000/api/v1/tenant_admin/documents/?doc_type=VENDOR_INVOICE" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "X-Tenant-Id: YOUR_TENANT_ID"
```

**Pagination:**
```bash
curl -X GET "http://localhost:8000/api/v1/tenant_admin/documents/?page=1&page_size=10" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "X-Tenant-Id: YOUR_TENANT_ID"
```

**Ordering:**
```bash
curl -X GET "http://localhost:8000/api/v1/tenant_admin/documents/?ordering=-created_at" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "X-Tenant-Id: YOUR_TENANT_ID"
```

### 4. Test Get Document Detail

```bash
curl -X GET "http://localhost:8000/api/v1/tenant_admin/documents/1/" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "X-Tenant-Id: YOUR_TENANT_ID"
```

**Expected Response (200 OK):**
```json
{
  "id": 1,
  "label": "Invoice: INV-001",
  "doc_type": "VENDOR_INVOICE",
  ...
}
```

### 5. Test File Download Endpoint

```bash
curl -X GET "http://localhost:8000/api/v1/tenant_admin/documents/1/file" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "X-Tenant-Id: YOUR_TENANT_ID" \
  --output downloaded_file.pdf
```

**Expected Response (200 OK):**
- Content-Type: application/pdf (or appropriate MIME type)
- File content streamed as response body
- Content-Disposition header with filename

### 6. Test Permission Denial (Manager Role)

Use a user with MANAGER role (should be denied):

```bash
curl -X GET "http://localhost:8000/api/v1/tenant_admin/documents/" \
  -H "Authorization: Bearer MANAGER_ACCESS_TOKEN" \
  -H "X-Tenant-Id: YOUR_TENANT_ID"
```

**Expected Response (403 Forbidden):**
```json
{
  "detail": "You do not have permission to perform this action."
}
```

### 7. Test Tenant Isolation

Try accessing a document from a different tenant:

```bash
curl -X GET "http://localhost:8000/api/v1/tenant_admin/documents/1/" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "X-Tenant-Id: DIFFERENT_TENANT_ID"
```

**Expected Response (404 Not Found):**
```json
{
  "detail": "Document not found"
}
```

## Testing Checklist

### Functional Tests
- [ ] List documents returns paginated results
- [ ] Search filters documents correctly
- [ ] Document type filter works
- [ ] Pagination works (page, page_size)
- [ ] Ordering works (created_at, label)
- [ ] Get document detail returns correct document
- [ ] File download returns file content
- [ ] File download sets correct Content-Type
- [ ] Related Purchase Orders are included in response

### Security Tests
- [ ] Owner can access documents
- [ ] Admin can access documents
- [ ] Manager is denied access (403)
- [ ] Cashier is denied access (403)
- [ ] Unauthenticated requests are denied (401)
- [ ] Cross-tenant access is denied (404)
- [ ] File download requires authentication
- [ ] File download respects tenant isolation

### Error Handling Tests
- [ ] Invalid document ID returns 404
- [ ] Invalid page number handled gracefully
- [ ] Invalid page_size limited to max (100)
- [ ] Missing file returns appropriate error
- [ ] Malformed requests return 400

## Testing with Django Test Client

You can also use Django's test framework:

```python
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from tenants.models import Tenant, TenantUser, TenantDoc

class DocumentsAPITest(TestCase):
    def setUp(self):
        # Create test data
        self.client = APIClient()
        # ... setup code ...
    
    def test_list_documents(self):
        # Test implementation
        pass
```

## Notes

- All endpoints require authentication (JWT token)
- All endpoints require tenant context (via JWT claims or X-Tenant-Id header)
- Only Owners and Admins can access documents
- File downloads are proxied through the API for security
- All file access is logged for audit trails

