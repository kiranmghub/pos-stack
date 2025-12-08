"""
Phase 2 Tests: Transfers, Counts, and related functionality
"""
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from catalog.models import Product, Variant
from inventory.models import InventoryItem, StockLedger, InventoryTransfer, InventoryTransferLine
from inventory.models_counts import CountSession, CountLine
from inventory.api import TransferListCreateView, TransferDetailView
from inventory.api_counts import CountSessionListCreateView, CountSessionDetailView, CountVarianceView, CountFinalizeView
from stores.models import Store
from tenants.models import Tenant, TenantUser


class Phase2TestBase(TestCase):
    """Base test class with common setup for Phase 2 tests"""
    
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = get_user_model().objects.create_user(
            username="testuser",
            email="test@example.com",
            password="test-pass",
        )
        self.tenant = Tenant.objects.create(
            name="Test Tenant",
            code="test",
            currency_code="USD",
            default_currency="USD",
            default_reorder_point=5,
        )
        self.store1 = Store.objects.create(
            tenant=self.tenant,
            name="Store 1",
            code="S1",
            timezone="UTC",
            region="",
            street="1 Main St",
            city="Austin",
            state="TX",
            postal_code="73301",
            country="USA",
        )
        self.store2 = Store.objects.create(
            tenant=self.tenant,
            name="Store 2",
            code="S2",
            timezone="UTC",
            region="",
            street="2 Main St",
            city="Austin",
            state="TX",
            postal_code="73302",
            country="USA",
        )
        self.product = Product.objects.create(
            tenant=self.tenant,
            name="Test Product",
            code="test-prod",
        )
        self.variant = Variant.objects.create(
            product=self.product,
            tenant=self.tenant,
            name="Test Variant",
            sku="TEST-001",
            barcode="123456",
            price="10.00",
        )
        TenantUser.objects.create(tenant=self.tenant, user=self.user, role="owner")

    def _request(self, method, path, data=None, user=None):
        """Helper to create authenticated API request"""
        user = user or self.user
        if method == "GET":
            request = self.factory.get(path, data or {})
        elif method == "POST":
            request = self.factory.post(path, data or {}, format="json")
        elif method == "PUT":
            request = self.factory.put(path, data or {}, format="json")
        else:
            raise ValueError(f"Unsupported method: {method}")
        force_authenticate(request, user=user)
        request.tenant = self.tenant
        return request


class TransferTests(Phase2TestBase):
    """Tests for Transfer functionality: send, partial receive, final receive"""
    
    def setUp(self):
        super().setUp()
        # Create inventory at store1
        self.item1 = InventoryItem.objects.create(
            tenant=self.tenant,
            store=self.store1,
            variant=self.variant,
            on_hand=Decimal("100"),
            reserved=0,
        )
        # No inventory at store2 initially
        self.item2, _ = InventoryItem.objects.get_or_create(
            tenant=self.tenant,
            store=self.store2,
            variant=self.variant,
            defaults={"on_hand": Decimal("0"), "reserved": 0},
        )

    def test_create_draft_transfer(self):
        """Test creating a DRAFT transfer"""
        request = self._request("POST", "/api/v1/inventory/transfers", {
            "from_store_id": self.store1.id,
            "to_store_id": self.store2.id,
            "notes": "Test transfer",
            "lines": [{"variant_id": self.variant.id, "qty": 50}],
        })
        response = TransferListCreateView.as_view()(request)
        self.assertEqual(response.status_code, 201)
        
        transfer = InventoryTransfer.objects.get(id=response.data["id"])
        self.assertEqual(transfer.status, "DRAFT")
        self.assertEqual(transfer.lines.count(), 1)
        self.assertEqual(transfer.lines.first().qty, 50)
        
        # Inventory should not change for DRAFT
        self.item1.refresh_from_db()
        self.assertEqual(self.item1.on_hand, Decimal("100"))

    def test_send_transfer(self):
        """Test sending a transfer: status changes, inventory decrements, ledger entry created"""
        # Create DRAFT transfer
        transfer = InventoryTransfer.objects.create(
            tenant=self.tenant,
            from_store=self.store1,
            to_store=self.store2,
            notes="Test",
            created_by=self.user,
        )
        InventoryTransferLine.objects.create(
            transfer=transfer,
            variant=self.variant,
            qty=50,
        )
        
        request = self._request("POST", f"/api/v1/inventory/transfers/{transfer.id}/send")
        response = TransferDetailView.as_view()(request, pk=transfer.id, action="send")
        self.assertEqual(response.status_code, 200)
        
        transfer.refresh_from_db()
        self.assertEqual(transfer.status, "IN_TRANSIT")
        
        # Check qty_sent was set
        line = transfer.lines.first()
        self.assertEqual(line.qty_sent, 50)
        self.assertEqual(line.qty_received, 0)
        
        # Check inventory decremented at source
        self.item1.refresh_from_db()
        self.assertEqual(self.item1.on_hand, Decimal("50"))
        
        # Check ledger entry created
        ledger = StockLedger.objects.filter(
            tenant=self.tenant,
            store=self.store1,
            variant=self.variant,
            ref_type="TRANSFER_OUT",
            ref_id=transfer.id,
        ).first()
        self.assertIsNotNone(ledger)
        self.assertEqual(ledger.qty_delta, -50)
        self.assertEqual(ledger.balance_after, 50)

    def test_partial_receive_transfer(self):
        """Test partial receive: qty_received updates, inventory increments, status changes"""
        # Create and send transfer
        transfer = InventoryTransfer.objects.create(
            tenant=self.tenant,
            from_store=self.store1,
            to_store=self.store2,
            notes="Test",
            created_by=self.user,
            status="IN_TRANSIT",
        )
        line = InventoryTransferLine.objects.create(
            transfer=transfer,
            variant=self.variant,
            qty=50,
            qty_sent=50,
        )
        
        # Receive partial quantity
        request = self._request("POST", f"/api/v1/inventory/transfers/{transfer.id}/receive", {
            "lines": [{"variant_id": self.variant.id, "qty_receive": 30}],
        })
        response = TransferDetailView.as_view()(request, pk=transfer.id, action="receive")
        self.assertEqual(response.status_code, 200)
        
        transfer.refresh_from_db()
        self.assertEqual(transfer.status, "PARTIAL_RECEIVED")
        
        line.refresh_from_db()
        self.assertEqual(line.qty_received, 30)
        self.assertEqual(line.qty_remaining, 20)
        
        # Check inventory incremented at destination
        self.item2.refresh_from_db()
        self.assertEqual(self.item2.on_hand, Decimal("30"))
        
        # Check ledger entry created
        ledger = StockLedger.objects.filter(
            tenant=self.tenant,
            store=self.store2,
            variant=self.variant,
            ref_type="TRANSFER_IN",
            ref_id=transfer.id,
        ).first()
        self.assertIsNotNone(ledger)
        self.assertEqual(ledger.qty_delta, 30)
        self.assertEqual(ledger.balance_after, 30)

    def test_final_receive_transfer(self):
        """Test final receive: completes transfer, status changes to RECEIVED"""
        # Set up initial inventory at destination from previous partial receive
        self.item2.on_hand = Decimal("30")
        self.item2.save()
        
        # Create and send transfer
        transfer = InventoryTransfer.objects.create(
            tenant=self.tenant,
            from_store=self.store1,
            to_store=self.store2,
            notes="Test",
            created_by=self.user,
            status="PARTIAL_RECEIVED",
        )
        line = InventoryTransferLine.objects.create(
            transfer=transfer,
            variant=self.variant,
            qty=50,
            qty_sent=50,
            qty_received=30,
        )
        
        # Create ledger entry for the initial partial receive
        StockLedger.objects.create(
            tenant=self.tenant,
            store=self.store2,
            variant=self.variant,
            qty_delta=30,
            balance_after=30,
            ref_type="TRANSFER_IN",
            ref_id=transfer.id,
            note=f"Transfer #{transfer.id} from {self.store1.code}",
            created_by=self.user,
        )
        
        # Receive remaining quantity
        request = self._request("POST", f"/api/v1/inventory/transfers/{transfer.id}/receive", {
            "lines": [{"variant_id": self.variant.id, "qty_receive": 20}],
        })
        response = TransferDetailView.as_view()(request, pk=transfer.id, action="receive")
        self.assertEqual(response.status_code, 200)
        
        transfer.refresh_from_db()
        self.assertEqual(transfer.status, "RECEIVED")
        
        line.refresh_from_db()
        self.assertEqual(line.qty_received, 50)
        self.assertEqual(line.qty_remaining, 0)
        
        # Check inventory incremented (30 + 20 = 50)
        self.item2.refresh_from_db()
        self.assertEqual(self.item2.on_hand, Decimal("50"))
        
        # Check second ledger entry created
        ledgers = StockLedger.objects.filter(
            tenant=self.tenant,
            store=self.store2,
            variant=self.variant,
            ref_type="TRANSFER_IN",
            ref_id=transfer.id,
        ).order_by("created_at")
        self.assertEqual(ledgers.count(), 2)
        self.assertEqual(ledgers.last().qty_delta, 20)
        self.assertEqual(ledgers.last().balance_after, 50)


class CountTests(Phase2TestBase):
    """Tests for Count functionality: scope enforcement, variance, ledger reconciliation"""
    
    def setUp(self):
        super().setUp()
        self.item = InventoryItem.objects.create(
            tenant=self.tenant,
            store=self.store1,
            variant=self.variant,
            on_hand=Decimal("100"),
            reserved=0,
        )

    def test_full_store_scope_enforcement(self):
        """Test that only one active FULL_STORE count can exist per store"""
        # Create first FULL_STORE count
        session1 = CountSession.objects.create(
            tenant=self.tenant,
            store=self.store1,
            scope="FULL_STORE",
            status="DRAFT",
        )
        
        # Try to create second FULL_STORE count (should fail validation)
        request = self._request("POST", "/api/v1/inventory/counts", {
            "store_id": self.store1.id,
            "scope": "FULL_STORE",
            "note": "Second full store count",
        })
        response = CountSessionListCreateView.as_view()(request)
        self.assertEqual(response.status_code, 400)
        self.assertIn("active", response.data.get("error", "").lower())
        
        # But can create if first is FINALIZED
        session1.status = "FINALIZED"
        session1.save()
        
        request = self._request("POST", "/api/v1/inventory/counts", {
            "store_id": self.store1.id,
            "scope": "FULL_STORE",
            "note": "Second full store count",
        })
        response = CountSessionListCreateView.as_view()(request)
        self.assertEqual(response.status_code, 201)

    def test_zone_counts_can_overlap(self):
        """Test that multiple zone counts can exist simultaneously"""
        # Create first zone count
        session1 = CountSession.objects.create(
            tenant=self.tenant,
            store=self.store1,
            scope="ZONE",
            zone_name="Aisle 1",
            status="IN_PROGRESS",
        )
        
        # Create second zone count (should succeed)
        request = self._request("POST", "/api/v1/inventory/counts", {
            "store_id": self.store1.id,
            "scope": "ZONE",
            "zone_name": "Aisle 2",
            "note": "Second zone count",
        })
        response = CountSessionListCreateView.as_view()(request)
        self.assertEqual(response.status_code, 201)
        
        # Both should exist
        self.assertEqual(CountSession.objects.filter(tenant=self.tenant, store=self.store1, scope="ZONE").count(), 2)

    def test_variance_endpoint(self):
        """Test variance endpoint returns expected vs counted data"""
        session = CountSession.objects.create(
            tenant=self.tenant,
            store=self.store1,
            scope="FULL_STORE",
            status="IN_PROGRESS",
        )
        CountLine.objects.create(
            session=session,
            variant=self.variant,
            expected_qty=100,
            counted_qty=95,
            method="SCAN",
        )
        
        request = self._request("GET", f"/api/v1/inventory/counts/{session.id}/variance")
        response = CountVarianceView.as_view()(request, pk=session.id)
        self.assertEqual(response.status_code, 200)
        
        data = response.data
        self.assertEqual(data["session_id"], session.id)
        self.assertEqual(len(data["lines"]), 1)
        self.assertEqual(data["lines"][0]["expected_qty"], 100)
        self.assertEqual(data["lines"][0]["counted_qty"], 95)
        self.assertEqual(data["lines"][0]["variance"], -5)
        self.assertEqual(data["summary"]["total_variance"], -5)
        self.assertEqual(data["summary"]["lines_with_variance"], 1)

    def test_count_finalize_creates_ledger_entry(self):
        """Test that finalizing a count creates COUNT_RECONCILE ledger entry"""
        session = CountSession.objects.create(
            tenant=self.tenant,
            store=self.store1,
            scope="FULL_STORE",
            status="IN_PROGRESS",
        )
        CountLine.objects.create(
            session=session,
            variant=self.variant,
            expected_qty=100,
            counted_qty=95,
            method="SCAN",
        )
        
        request = self._request("POST", f"/api/v1/inventory/counts/{session.id}/finalize")
        response = CountFinalizeView.as_view()(request, pk=session.id)
        self.assertEqual(response.status_code, 200)
        
        session.refresh_from_db()
        self.assertEqual(session.status, "FINALIZED")
        
        # Check ledger entry created with COUNT_RECONCILE
        ledger = StockLedger.objects.filter(
            tenant=self.tenant,
            store=self.store1,
            variant=self.variant,
            ref_type="COUNT_RECONCILE",
            ref_id=session.id,
        ).first()
        self.assertIsNotNone(ledger)
        self.assertEqual(ledger.qty_delta, -5)  # 95 - 100 = -5
        self.assertEqual(ledger.balance_after, 95)
        
        # Check inventory updated
        self.item.refresh_from_db()
        self.assertEqual(self.item.on_hand, Decimal("95"))


class PurchaseOrderTests(TestCase):
    """Tests for Purchase Order functionality"""
    
    def setUp(self):
        from purchasing.models import Vendor, PurchaseOrder, PurchaseOrderLine
        from purchasing.api import PurchaseOrderListCreateView, PurchaseOrderSubmitView, PurchaseOrderReceiveView
        
        self.factory = APIRequestFactory()
        self.PurchaseOrderListCreateView = PurchaseOrderListCreateView
        self.PurchaseOrderSubmitView = PurchaseOrderSubmitView
        self.PurchaseOrderReceiveView = PurchaseOrderReceiveView
        self.Vendor = Vendor
        self.PurchaseOrder = PurchaseOrder
        self.PurchaseOrderLine = PurchaseOrderLine
        self.user = get_user_model().objects.create_user(
            username="testuser",
            email="test@example.com",
            password="test-pass",
        )
        self.tenant = Tenant.objects.create(
            name="Test Tenant",
            code="test",
            currency_code="USD",
            default_currency="USD",
        )
        self.store = Store.objects.create(
            tenant=self.tenant,
            name="Store 1",
            code="S1",
            timezone="UTC",
            region="",
            street="1 Main St",
            city="Austin",
            state="TX",
            postal_code="73301",
            country="USA",
        )
        self.vendor = Vendor.objects.create(
            tenant=self.tenant,
            name="Test Vendor",
            code="VENDOR1",
        )
        self.product = Product.objects.create(
            tenant=self.tenant,
            name="Test Product",
            code="test-prod",
        )
        self.variant = Variant.objects.create(
            product=self.product,
            tenant=self.tenant,
            name="Test Variant",
            sku="TEST-001",
            price="10.00",
        )
        TenantUser.objects.create(tenant=self.tenant, user=self.user, role="owner")

    def _request(self, method, path, data=None):
        request = self.factory.request()
        if method == "POST":
            request = self.factory.post(path, data or {}, format="json")
        elif method == "GET":
            request = self.factory.get(path, data or {})
        force_authenticate(request, user=self.user)
        request.tenant = self.tenant
        return request

    def test_create_draft_po(self):
        """Test creating a DRAFT purchase order"""
        request = self._request("POST", "/api/v1/purchasing/pos", {
            "store_id": self.store.id,
            "vendor_id": self.vendor.id,
            "notes": "Test PO",
            "lines": [{"variant_id": self.variant.id, "qty_ordered": 50, "unit_cost": "5.00"}],
        })
        response = self.PurchaseOrderListCreateView.as_view()(request)
        self.assertEqual(response.status_code, 201)
        
        po = self.PurchaseOrder.objects.get(id=response.data["id"])
        self.assertEqual(po.status, "DRAFT")
        self.assertEqual(po.lines.count(), 1)
        self.assertEqual(po.lines.first().qty_ordered, 50)

    def test_submit_po(self):
        """Test submitting a DRAFT PO to SUBMITTED"""
        po = self.PurchaseOrder.objects.create(
            tenant=self.tenant,
            store=self.store,
            vendor=self.vendor,
            notes="Test",
            created_by=self.user,
        )
        self.PurchaseOrderLine.objects.create(
            purchase_order=po,
            variant=self.variant,
            qty_ordered=50,
            unit_cost=Decimal("5.00"),
        )
        
        request = self._request("POST", f"/api/v1/purchasing/pos/{po.id}/submit")
        response = self.PurchaseOrderSubmitView.as_view()(request, pk=po.id)
        self.assertEqual(response.status_code, 200)
        
        po.refresh_from_db()
        self.assertEqual(po.status, "SUBMITTED")
        self.assertIsNotNone(po.submitted_at)

    def test_partial_receive_po(self):
        """Test partial receive: updates qty_received, creates ledger entry, updates inventory"""
        po = self.PurchaseOrder.objects.create(
            tenant=self.tenant,
            store=self.store,
            vendor=self.vendor,
            notes="Test",
            created_by=self.user,
            status="SUBMITTED",
        )
        line = self.PurchaseOrderLine.objects.create(
            purchase_order=po,
            variant=self.variant,
            qty_ordered=50,
            unit_cost=Decimal("5.00"),
        )
        
        # Receive partial quantity
        request = self._request("POST", f"/api/v1/purchasing/pos/{po.id}/receive", {
            "lines": [{"line_id": line.id, "qty_receive": 30}],
        })
        response = self.PurchaseOrderReceiveView.as_view()(request, pk=po.id)
        self.assertEqual(response.status_code, 200)
        
        po.refresh_from_db()
        self.assertEqual(po.status, "PARTIAL_RECEIVED")
        # Verify received_at is set on first receive
        self.assertIsNotNone(po.received_at)
        
        line.refresh_from_db()
        self.assertEqual(line.qty_received, 30)
        self.assertEqual(line.qty_remaining, 20)
        
        # Check inventory incremented
        item, _ = InventoryItem.objects.get_or_create(
            tenant=self.tenant,
            store=self.store,
            variant=self.variant,
            defaults={"on_hand": Decimal("0"), "reserved": 0},
        )
        item.refresh_from_db()
        self.assertEqual(item.on_hand, Decimal("30"))
        
        # Check ledger entry created
        ledger = StockLedger.objects.filter(
            tenant=self.tenant,
            store=self.store,
            variant=self.variant,
            ref_type="PURCHASE_ORDER_RECEIPT",
            ref_id=po.id,
        ).first()
        self.assertIsNotNone(ledger)
        self.assertEqual(ledger.qty_delta, 30)
        self.assertEqual(ledger.balance_after, 30)

    def test_full_receive_po(self):
        """Test full receive: completes PO, status changes to RECEIVED"""
        # First, set up initial inventory from partial receive
        item, _ = InventoryItem.objects.get_or_create(
            tenant=self.tenant,
            store=self.store,
            variant=self.variant,
            defaults={"on_hand": Decimal("0"), "reserved": 0},
        )
        item.on_hand = Decimal("30")  # Simulate previous partial receive
        item.save()
        
        po = self.PurchaseOrder.objects.create(
            tenant=self.tenant,
            store=self.store,
            vendor=self.vendor,
            notes="Test",
            created_by=self.user,
            status="PARTIAL_RECEIVED",
        )
        line = self.PurchaseOrderLine.objects.create(
            purchase_order=po,
            variant=self.variant,
            qty_ordered=50,
            qty_received=30,
            unit_cost=Decimal("5.00"),
        )
        
        # Receive remaining quantity
        request = self._request("POST", f"/api/v1/purchasing/pos/{po.id}/receive", {
            "lines": [{"line_id": line.id, "qty_receive": 20}],
        })
        response = self.PurchaseOrderReceiveView.as_view()(request, pk=po.id)
        self.assertEqual(response.status_code, 200)
        
        po.refresh_from_db()
        self.assertEqual(po.status, "RECEIVED")
        # Verify received_at is set
        self.assertIsNotNone(po.received_at)
        
        line.refresh_from_db()
        self.assertEqual(line.qty_received, 50)
        self.assertEqual(line.qty_remaining, 0)
        
        # Check inventory incremented (30 + 20 = 50)
        item.refresh_from_db()
        self.assertEqual(item.on_hand, Decimal("50"))

