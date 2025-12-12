#!/usr/bin/env python3
"""
Test script for Documents API endpoints.
Run this from the pos-backend directory with: python3 devtools/test_documents_api.py

Requirements:
- Django server should be running
- Or use: python3 manage.py shell < devtools/test_documents_api.py
"""

import os
import sys
import django

# Setup Django
from pathlib import Path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
django.setup()
from django.contrib.auth import get_user_model
from tenants.models import Tenant, TenantUser, TenantDoc
from stores.models import Store
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from common.roles import TenantRole
import json

User = get_user_model()

def print_section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}\n")

def create_test_data():
    """Create test tenant, users, and documents."""
    print_section("Creating Test Data")
    
    # Create or get tenant
    tenant, created = Tenant.objects.get_or_create(
        code="TEST-DOCS",
        defaults={
            "name": "Test Documents Tenant",
            "is_active": True,
        }
    )
    print(f"Tenant: {tenant.code} ({'created' if created else 'exists'})")
    
    # Create owner user
    owner_user, created = User.objects.get_or_create(
        username="test_owner",
        defaults={"email": "owner@test.com", "is_active": True}
    )
    if created:
        owner_user.set_password("testpass123")
        owner_user.save()
    print(f"Owner user: {owner_user.username} ({'created' if created else 'exists'})")
    
    # Create admin user
    admin_user, created = User.objects.get_or_create(
        username="test_admin",
        defaults={"email": "admin@test.com", "is_active": True}
    )
    if created:
        admin_user.set_password("testpass123")
        admin_user.save()
    print(f"Admin user: {admin_user.username} ({'created' if created else 'exists'})")
    
    # Create manager user (should NOT have access)
    manager_user, created = User.objects.get_or_create(
        username="test_manager",
        defaults={"email": "manager@test.com", "is_active": True}
    )
    if created:
        manager_user.set_password("testpass123")
        manager_user.save()
    print(f"Manager user: {manager_user.username} ({'created' if created else 'exists'})")
    
    # Create tenant memberships
    owner_membership, created = TenantUser.objects.get_or_create(
        user=owner_user,
        tenant=tenant,
        defaults={"role": TenantRole.OWNER, "is_active": True}
    )
    print(f"Owner membership: {'created' if created else 'exists'}")
    
    admin_membership, created = TenantUser.objects.get_or_create(
        user=admin_user,
        tenant=tenant,
        defaults={"role": TenantRole.ADMIN, "is_active": True}
    )
    print(f"Admin membership: {'created' if created else 'exists'}")
    
    manager_membership, created = TenantUser.objects.get_or_create(
        user=manager_user,
        tenant=tenant,
        defaults={"role": TenantRole.MANAGER, "is_active": True}
    )
    print(f"Manager membership: {'created' if created else 'exists'}")
    
    # Create test documents (if they don't exist)
    doc_count = TenantDoc.objects.filter(tenant=tenant).count()
    if doc_count == 0:
        # Create a dummy file content for testing
        from django.core.files.base import ContentFile
        from io import BytesIO
        
        # Create test document 1
        test_file1 = ContentFile(b"Test PDF content", name="test_document_1.pdf")
        doc1 = TenantDoc.objects.create(
            tenant=tenant,
            label="Test Invoice 001",
            doc_type="VENDOR_INVOICE",
            description="Test vendor invoice document",
            file=test_file1,
            uploaded_by=owner_user,
            metadata={
                "vendor_invoice_number": "INV-TEST-001",
                "vendor_id": 1,
            }
        )
        print(f"Created test document 1: {doc1.label} (ID: {doc1.id})")
        
        # Create test document 2
        test_file2 = ContentFile(b"Test license content", name="test_license.pdf")
        doc2 = TenantDoc.objects.create(
            tenant=tenant,
            label="Test License",
            doc_type="LICENSE",
            description="Test license document",
            file=test_file2,
            uploaded_by=admin_user,
            metadata={}
        )
        print(f"Created test document 2: {doc2.label} (ID: {doc2.id})")
    else:
        print(f"Test documents already exist ({doc_count} documents)")
    
    return {
        "tenant": tenant,
        "owner_user": owner_user,
        "admin_user": admin_user,
        "manager_user": manager_user,
    }

def create_auth_client(user, tenant):
    """Create authenticated API client."""
    # Create refresh token with tenant info
    refresh = RefreshToken.for_user(user)
    refresh["tenant_id"] = tenant.id
    refresh["tenant_code"] = tenant.code
    
    membership = TenantUser.objects.filter(user=user, tenant=tenant).first()
    if membership:
        refresh["role"] = membership.role
    
    client = APIClient()
    client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}",
        HTTP_X_TENANT_ID=str(tenant.id)
    )
    return client

def test_list_documents(client, user_role):
    """Test GET /api/v1/tenant_admin/documents/"""
    print_section(f"Test 1: List Documents (as {user_role})")
    
    response = client.get("/api/v1/tenant_admin/documents/")
    print(f"Status Code: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        print(f"✅ SUCCESS: Found {data.get('count', 0)} documents")
        return True
    else:
        print(f"Response: {response.content.decode()}")
        print(f"❌ FAILED: Status {response.status_code}")
        return False

def test_list_documents_with_filters(client, user_role):
    """Test GET /api/v1/tenant_admin/documents/ with filters"""
    print_section(f"Test 2: List Documents with Filters (as {user_role})")
    
    # Test search
    response = client.get("/api/v1/tenant_admin/documents/?search=invoice")
    print(f"Search='invoice' - Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"  Found {data.get('count', 0)} documents")
    
    # Test doc_type filter
    response = client.get("/api/v1/tenant_admin/documents/?doc_type=VENDOR_INVOICE")
    print(f"doc_type='VENDOR_INVOICE' - Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"  Found {data.get('count', 0)} documents")
    
    # Test pagination
    response = client.get("/api/v1/tenant_admin/documents/?page=1&page_size=10")
    print(f"Pagination (page=1, page_size=10) - Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"  Count: {data.get('count', 0)}, Results: {len(data.get('results', []))}")
    
    # Test ordering
    response = client.get("/api/v1/tenant_admin/documents/?ordering=-created_at")
    print(f"Ordering='-created_at' - Status: {response.status_code}")
    if response.status_code == 200:
        print(f"  ✅ SUCCESS")
        return True
    else:
        print(f"  ❌ FAILED")
        return False

def test_get_document_detail(client, document_id, user_role):
    """Test GET /api/v1/tenant_admin/documents/{id}/"""
    print_section(f"Test 3: Get Document Detail (as {user_role})")
    
    response = client.get(f"/api/v1/tenant_admin/documents/{document_id}/")
    print(f"Status Code: {response.status_code}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        print(f"✅ SUCCESS: Retrieved document {document_id}")
        return True
    else:
        print(f"Response: {response.content.decode()}")
        print(f"❌ FAILED: Status {response.status_code}")
        return False

def test_download_file(client, document_id, user_role):
    """Test GET /api/v1/tenant_admin/documents/{id}/file"""
    print_section(f"Test 4: Download File (as {user_role})")
    
    response = client.get(f"/api/v1/tenant_admin/documents/{document_id}/file")
    print(f"Status Code: {response.status_code}")
    print(f"Content-Type: {response.get('Content-Type', 'N/A')}")
    print(f"Content-Disposition: {response.get('Content-Disposition', 'N/A')}")
    
    if response.status_code == 200:
        print(f"Response Length: {len(response.content)} bytes")
        print(f"✅ SUCCESS: File download working")
        return True
    else:
        print(f"Response: {response.content.decode()[:200]}")
        print(f"❌ FAILED: Status {response.status_code}")
        return False

def test_permission_denied(client, user_role):
    """Test that non-owner/admin users are denied access"""
    print_section(f"Test 5: Permission Check (as {user_role})")
    
    response = client.get("/api/v1/tenant_admin/documents/")
    print(f"Status Code: {response.status_code}")
    
    if response.status_code == 403:
        print(f"✅ SUCCESS: Permission correctly denied for {user_role}")
        return True
    elif response.status_code == 200:
        print(f"❌ FAILED: {user_role} should not have access but got 200")
        return False
    else:
        print(f"⚠️  UNEXPECTED: Status {response.status_code}")
        return False

def test_tenant_isolation(client1, tenant1, client2, tenant2):
    """Test that users can only see their own tenant's documents"""
    print_section("Test 6: Tenant Isolation")
    
    # Get documents for tenant 1
    response1 = client1.get("/api/v1/tenant_admin/documents/")
    if response1.status_code == 200:
        data1 = response1.json()
        doc_ids_tenant1 = {doc["id"] for doc in data1.get("results", [])}
        print(f"Tenant 1 ({tenant1.code}): {len(doc_ids_tenant1)} documents")
    else:
        print(f"Tenant 1: Failed to get documents (Status: {response1.status_code})")
        return False
    
    # Try to access tenant 1's document with tenant 2's client
    if doc_ids_tenant1:
        test_doc_id = list(doc_ids_tenant1)[0]
        response2 = client2.get(f"/api/v1/tenant_admin/documents/{test_doc_id}/")
        if response2.status_code == 404:
            print(f"✅ SUCCESS: Tenant isolation working - Tenant 2 cannot access Tenant 1's document")
            return True
        else:
            print(f"❌ FAILED: Tenant isolation broken - Tenant 2 accessed Tenant 1's document (Status: {response2.status_code})")
            return False
    else:
        print("⚠️  SKIPPED: No documents in Tenant 1 to test isolation")
        return True

def main():
    print("\n" + "="*60)
    print("  DOCUMENTS API ENDPOINT TEST SUITE")
    print("="*60)
    
    # Create test data
    test_data = create_test_data()
    tenant = test_data["tenant"]
    owner_user = test_data["owner_user"]
    admin_user = test_data["admin_user"]
    manager_user = test_data["manager_user"]
    
    # Get a document ID for detail/file tests
    test_doc = TenantDoc.objects.filter(tenant=tenant).first()
    if not test_doc:
        print("\n❌ ERROR: No documents found. Cannot run all tests.")
        return
    
    test_doc_id = test_doc.id
    
    results = []
    
    # Test 1: Owner can list documents
    owner_client = create_auth_client(owner_user, tenant)
    results.append(("Owner - List Documents", test_list_documents(owner_client, "Owner")))
    
    # Test 2: Filters and pagination
    results.append(("Owner - Filters/Pagination", test_list_documents_with_filters(owner_client, "Owner")))
    
    # Test 3: Get document detail
    results.append(("Owner - Get Detail", test_get_document_detail(owner_client, test_doc_id, "Owner")))
    
    # Test 4: Download file
    results.append(("Owner - Download File", test_download_file(owner_client, test_doc_id, "Owner")))
    
    # Test 5: Admin can access
    admin_client = create_auth_client(admin_user, tenant)
    results.append(("Admin - List Documents", test_list_documents(admin_client, "Admin")))
    
    # Test 6: Manager should be denied
    manager_client = create_auth_client(manager_user, tenant)
    results.append(("Manager - Permission Denied", test_permission_denied(manager_client, "Manager")))
    
    # Test 7: Tenant isolation (if we have another tenant)
    # For now, just test with same tenant but different user
    # In production, you'd want to test with a completely different tenant
    
    # Summary
    print_section("Test Summary")
    passed = sum(1 for _, result in results if result)
    total = len(results)
    print(f"\nPassed: {passed}/{total}")
    print("\nDetailed Results:")
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {status}: {name}")
    
    if passed == total:
        print("\n🎉 All tests passed!")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Please review the output above.")
    
    return passed == total

if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

