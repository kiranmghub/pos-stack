"""
Django management command to test Documents API endpoints.

Usage:
    python manage.py test_documents_api
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from tenants.models import Tenant, TenantUser, TenantDoc
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from common.roles import TenantRole
import json

User = get_user_model()


class Command(BaseCommand):
    help = "Test Documents API endpoints"

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("\n" + "="*60))
        self.stdout.write(self.style.SUCCESS("  DOCUMENTS API ENDPOINT TEST SUITE"))
        self.stdout.write(self.style.SUCCESS("="*60 + "\n"))

        # Create test data
        test_data = self.create_test_data()
        tenant = test_data["tenant"]
        owner_user = test_data["owner_user"]
        admin_user = test_data["admin_user"]
        manager_user = test_data["manager_user"]

        # Get a document ID for detail/file tests
        test_doc = TenantDoc.objects.filter(tenant=tenant).first()
        if not test_doc:
            self.stdout.write(self.style.ERROR("\n❌ ERROR: No documents found. Cannot run all tests."))
            return

        test_doc_id = test_doc.id

        results = []

        # Test 1: Owner can list documents
        owner_client = self.create_auth_client(owner_user, tenant)
        results.append(("Owner - List Documents", self.test_list_documents(owner_client, "Owner")))

        # Test 2: Filters and pagination
        results.append(("Owner - Filters/Pagination", self.test_list_documents_with_filters(owner_client, "Owner")))

        # Test 3: Get document detail
        results.append(("Owner - Get Detail", self.test_get_document_detail(owner_client, test_doc_id, "Owner")))

        # Test 4: Download file
        results.append(("Owner - Download File", self.test_download_file(owner_client, test_doc_id, "Owner")))

        # Test 5: Admin can access
        admin_client = self.create_auth_client(admin_user, tenant)
        results.append(("Admin - List Documents", self.test_list_documents(admin_client, "Admin")))

        # Test 6: Manager should be denied
        manager_client = self.create_auth_client(manager_user, tenant)
        results.append(("Manager - Permission Denied", self.test_permission_denied(manager_client, "Manager")))

        # Summary
        self.print_section("Test Summary")
        passed = sum(1 for _, result in results if result)
        total = len(results)
        self.stdout.write(f"\nPassed: {passed}/{total}\n")
        self.stdout.write("Detailed Results:\n")
        for name, result in results:
            status = "✅ PASS" if result else "❌ FAIL"
            style = self.style.SUCCESS if result else self.style.ERROR
            self.stdout.write(style(f"  {status}: {name}"))

        if passed == total:
            self.stdout.write(self.style.SUCCESS("\n🎉 All tests passed!\n"))
        else:
            self.stdout.write(self.style.WARNING(f"\n⚠️  {total - passed} test(s) failed. Please review the output above.\n"))

    def print_section(self, title):
        self.stdout.write(f"\n{'='*60}")
        self.stdout.write(f"  {title}")
        self.stdout.write(f"{'='*60}\n")

    def create_test_data(self):
        """Create test tenant, users, and documents."""
        self.print_section("Creating Test Data")

        # Create or get tenant
        tenant, created = Tenant.objects.get_or_create(
            code="TEST-DOCS",
            defaults={
                "name": "Test Documents Tenant",
                "is_active": True,
            }
        )
        self.stdout.write(f"Tenant: {tenant.code} ({'created' if created else 'exists'})")

        # Create owner user
        owner_user, created = User.objects.get_or_create(
            username="test_owner",
            defaults={"email": "owner@test.com", "is_active": True}
        )
        if created:
            owner_user.set_password("testpass123")
            owner_user.save()
        self.stdout.write(f"Owner user: {owner_user.username} ({'created' if created else 'exists'})")

        # Create admin user
        admin_user, created = User.objects.get_or_create(
            username="test_admin",
            defaults={"email": "admin@test.com", "is_active": True}
        )
        if created:
            admin_user.set_password("testpass123")
            admin_user.save()
        self.stdout.write(f"Admin user: {admin_user.username} ({'created' if created else 'exists'})")

        # Create manager user (should NOT have access)
        manager_user, created = User.objects.get_or_create(
            username="test_manager",
            defaults={"email": "manager@test.com", "is_active": True}
        )
        if created:
            manager_user.set_password("testpass123")
            manager_user.save()
        self.stdout.write(f"Manager user: {manager_user.username} ({'created' if created else 'exists'})")

        # Create tenant memberships
        owner_membership, created = TenantUser.objects.get_or_create(
            user=owner_user,
            tenant=tenant,
            defaults={"role": TenantRole.OWNER, "is_active": True}
        )
        self.stdout.write(f"Owner membership: {'created' if created else 'exists'}")

        admin_membership, created = TenantUser.objects.get_or_create(
            user=admin_user,
            tenant=tenant,
            defaults={"role": TenantRole.ADMIN, "is_active": True}
        )
        self.stdout.write(f"Admin membership: {'created' if created else 'exists'}")

        manager_membership, created = TenantUser.objects.get_or_create(
            user=manager_user,
            tenant=tenant,
            defaults={"role": TenantRole.MANAGER, "is_active": True}
        )
        self.stdout.write(f"Manager membership: {'created' if created else 'exists'}")

        # Create test documents (if they don't exist)
        doc_count = TenantDoc.objects.filter(tenant=tenant).count()
        if doc_count == 0:
            # Create a dummy file content for testing
            from django.core.files.base import ContentFile

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
            self.stdout.write(f"Created test document 1: {doc1.label} (ID: {doc1.id})")

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
            self.stdout.write(f"Created test document 2: {doc2.label} (ID: {doc2.id})")
        else:
            self.stdout.write(f"Test documents already exist ({doc_count} documents)")

        return {
            "tenant": tenant,
            "owner_user": owner_user,
            "admin_user": admin_user,
            "manager_user": manager_user,
        }

    def create_auth_client(self, user, tenant):
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

    def test_list_documents(self, client, user_role):
        """Test GET /api/v1/tenant_admin/documents/"""
        self.print_section(f"Test 1: List Documents (as {user_role})")

        response = client.get("/api/v1/tenant_admin/documents/")
        self.stdout.write(f"Status Code: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            self.stdout.write(f"Response count: {data.get('count', 0)}")
            self.stdout.write(f"✅ SUCCESS: Found {data.get('count', 0)} documents")
            return True
        else:
            self.stdout.write(f"Response: {response.content.decode()}")
            self.stdout.write(f"❌ FAILED: Status {response.status_code}")
            return False

    def test_list_documents_with_filters(self, client, user_role):
        """Test GET /api/v1/tenant_admin/documents/ with filters"""
        self.print_section(f"Test 2: List Documents with Filters (as {user_role})")

        # Test search
        response = client.get("/api/v1/tenant_admin/documents/?search=invoice")
        self.stdout.write(f"Search='invoice' - Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            self.stdout.write(f"  Found {data.get('count', 0)} documents")

        # Test doc_type filter
        response = client.get("/api/v1/tenant_admin/documents/?doc_type=VENDOR_INVOICE")
        self.stdout.write(f"doc_type='VENDOR_INVOICE' - Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            self.stdout.write(f"  Found {data.get('count', 0)} documents")

        # Test pagination
        response = client.get("/api/v1/tenant_admin/documents/?page=1&page_size=10")
        self.stdout.write(f"Pagination (page=1, page_size=10) - Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            self.stdout.write(f"  Count: {data.get('count', 0)}, Results: {len(data.get('results', []))}")

        # Test ordering
        response = client.get("/api/v1/tenant_admin/documents/?ordering=-created_at")
        self.stdout.write(f"Ordering='-created_at' - Status: {response.status_code}")
        if response.status_code == 200:
            self.stdout.write(f"  ✅ SUCCESS")
            return True
        else:
            self.stdout.write(f"  ❌ FAILED")
            return False

    def test_get_document_detail(self, client, document_id, user_role):
        """Test GET /api/v1/tenant_admin/documents/{id}/"""
        self.print_section(f"Test 3: Get Document Detail (as {user_role})")

        response = client.get(f"/api/v1/tenant_admin/documents/{document_id}/")
        self.stdout.write(f"Status Code: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            self.stdout.write(f"Document Label: {data.get('label', 'N/A')}")
            self.stdout.write(f"Document Type: {data.get('doc_type', 'N/A')}")
            self.stdout.write(f"File URL: {data.get('file_url', 'N/A')[:80]}...")
            self.stdout.write(f"✅ SUCCESS: Retrieved document {document_id}")
            return True
        else:
            self.stdout.write(f"Response: {response.content.decode()}")
            self.stdout.write(f"❌ FAILED: Status {response.status_code}")
            return False

    def test_download_file(self, client, document_id, user_role):
        """Test GET /api/v1/tenant_admin/documents/{id}/file"""
        self.print_section(f"Test 4: Download File (as {user_role})")

        response = client.get(f"/api/v1/tenant_admin/documents/{document_id}/file")
        self.stdout.write(f"Status Code: {response.status_code}")
        self.stdout.write(f"Content-Type: {response.get('Content-Type', 'N/A')}")
        self.stdout.write(f"Content-Disposition: {response.get('Content-Disposition', 'N/A')}")

        if response.status_code == 200:
            self.stdout.write(f"Response Length: {len(response.content)} bytes")
            self.stdout.write(f"✅ SUCCESS: File download working")
            return True
        else:
            self.stdout.write(f"Response: {response.content.decode()[:200]}")
            self.stdout.write(f"❌ FAILED: Status {response.status_code}")
            return False

    def test_permission_denied(self, client, user_role):
        """Test that non-owner/admin users are denied access"""
        self.print_section(f"Test 5: Permission Check (as {user_role})")

        response = client.get("/api/v1/tenant_admin/documents/")
        self.stdout.write(f"Status Code: {response.status_code}")

        if response.status_code == 403:
            self.stdout.write(f"✅ SUCCESS: Permission correctly denied for {user_role}")
            return True
        elif response.status_code == 200:
            self.stdout.write(f"❌ FAILED: {user_role} should not have access but got 200")
            return False
        else:
            self.stdout.write(f"⚠️  UNEXPECTED: Status {response.status_code}")
            return False

