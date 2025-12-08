"""
Phase 3 Tests: Reservations & Backorders
"""
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APIRequestFactory, force_authenticate

from catalog.models import Product, Variant
from inventory.models import InventoryItem, StockLedger
from inventory.models_reservations import Reservation
from inventory.reservations import (
    reserve_stock,
    release_reservation,
    commit_reservation,
    ReservationError,
    InsufficientStockError,
)
from inventory.api_reservations import (
    ReservationListView,
    ReservationCreateView,
    ReservationReleaseView,
    ReservationCommitView,
)
from inventory.api_channels import (
    AvailabilityView,
    ChannelReserveView,
    ChannelReleaseView,
    ChannelCommitView,
    _validate_channel,
)
from stores.models import Store, Register
from tenants.models import Tenant, TenantUser
from orders.models import Sale, SaleLine
from analytics.forecast import (
    calculate_sales_velocity,
    calculate_predicted_stockout_date,
    calculate_recommended_order_qty,
    get_reorder_forecast,
)
from inventory.api_forecast import (
    ReorderForecastView,
    AtRiskItemsView,
)


class Phase3ReservationTestBase(TestCase):
    """Base test class for Phase 3 reservation tests"""
    
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
            allow_backorders=False,  # Default: no backorders
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
        self.item = InventoryItem.objects.create(
            tenant=self.tenant,
            store=self.store,
            variant=self.variant,
            on_hand=Decimal("100"),
            reserved=Decimal("0"),
        )
        TenantUser.objects.create(tenant=self.tenant, user=self.user, role="owner")

    def _request(self, method, path, data=None, user=None):
        """Helper to create authenticated API request"""
        user = user or self.user
        if method == "GET":
            request = self.factory.get(path, data or {})
        elif method == "POST":
            request = self.factory.post(path, data or {}, format="json")
        else:
            raise ValueError(f"Unsupported method: {method}")
        force_authenticate(request, user=user)
        request.tenant = self.tenant
        return request


class ReservationServiceTests(Phase3ReservationTestBase):
    """Tests for reservation service functions"""
    
    def test_reserve_stock_updates_reserved_not_on_hand(self):
        """Test that reserving stock updates reserved but not on_hand"""
        reservation = reserve_stock(
            tenant=self.tenant,
            store_id=self.store.id,
            variant_id=self.variant.id,
            qty=50,
            ref_type="POS_CART",
            ref_id=123,
            channel="POS",
            user=self.user,
        )
        
        self.assertEqual(reservation.status, "ACTIVE")
        self.assertEqual(reservation.quantity, 50)
        
        # Check inventory: reserved increased, on_hand unchanged
        self.item.refresh_from_db()
        self.assertEqual(self.item.reserved, Decimal("50"))
        self.assertEqual(self.item.on_hand, Decimal("100"))
    
    def test_reserve_stock_insufficient_stock_without_backorders(self):
        """Test that reserving more than available fails when backorders not allowed"""
        # Try to reserve more than available (100 on_hand, 0 reserved = 100 available)
        with self.assertRaises(InsufficientStockError):
            reserve_stock(
                tenant=self.tenant,
                store_id=self.store.id,
                variant_id=self.variant.id,
                qty=150,
                ref_type="POS_CART",
                ref_id=123,
                channel="POS",
                user=self.user,
            )
        
        # Check inventory unchanged
        self.item.refresh_from_db()
        self.assertEqual(self.item.reserved, Decimal("0"))
        self.assertEqual(self.item.on_hand, Decimal("100"))
    
    def test_reserve_stock_allows_backorders_when_enabled(self):
        """Test that backorders are allowed when tenant.allow_backorders=True"""
        self.tenant.allow_backorders = True
        self.tenant.save()
        
        # Reserve more than available
        reservation = reserve_stock(
            tenant=self.tenant,
            store_id=self.store.id,
            variant_id=self.variant.id,
            qty=150,
            ref_type="POS_CART",
            ref_id=123,
            channel="POS",
            user=self.user,
        )
        
        self.assertEqual(reservation.status, "ACTIVE")
        self.assertEqual(reservation.quantity, 150)
        
        # Check reserved increased
        self.item.refresh_from_db()
        self.assertEqual(self.item.reserved, Decimal("150"))
    
    def test_release_reservation_decrements_reserved(self):
        """Test that releasing a reservation decrements reserved"""
        # Create reservation
        reservation = reserve_stock(
            tenant=self.tenant,
            store_id=self.store.id,
            variant_id=self.variant.id,
            qty=50,
            ref_type="POS_CART",
            ref_id=123,
            channel="POS",
            user=self.user,
        )
        
        self.item.refresh_from_db()
        self.assertEqual(self.item.reserved, Decimal("50"))
        
        # Release reservation
        released = release_reservation(reservation.id, tenant=self.tenant, user=self.user)
        
        self.assertEqual(released.status, "RELEASED")
        self.assertIsNotNone(released.released_at)
        
        # Check reserved decremented, on_hand unchanged
        self.item.refresh_from_db()
        self.assertEqual(self.item.reserved, Decimal("0"))
        self.assertEqual(self.item.on_hand, Decimal("100"))
        
        # Check ledger entry created
        ledger = StockLedger.objects.filter(
            tenant=self.tenant,
            store=self.store,
            variant=self.variant,
            ref_type="RESERVATION_RELEASE",
            ref_id=reservation.id,
        ).first()
        self.assertIsNotNone(ledger)
        self.assertEqual(ledger.qty_delta, 0)  # No change to on_hand
    
    def test_commit_reservation_decrements_both_reserved_and_on_hand(self):
        """Test that committing a reservation decrements both reserved and on_hand"""
        # Create reservation
        reservation = reserve_stock(
            tenant=self.tenant,
            store_id=self.store.id,
            variant_id=self.variant.id,
            qty=50,
            ref_type="POS_CART",
            ref_id=123,
            channel="POS",
            user=self.user,
        )
        
        self.item.refresh_from_db()
        self.assertEqual(self.item.reserved, Decimal("50"))
        self.assertEqual(self.item.on_hand, Decimal("100"))
        
        # Commit reservation
        committed, item = commit_reservation(reservation.id, tenant=self.tenant, user=self.user)
        
        self.assertEqual(committed.status, "COMMITTED")
        self.assertIsNotNone(committed.committed_at)
        
        # Check both reserved and on_hand decremented
        self.item.refresh_from_db()
        self.assertEqual(self.item.reserved, Decimal("0"))
        self.assertEqual(self.item.on_hand, Decimal("50"))
        
        # Check ledger entry created
        ledger = StockLedger.objects.filter(
            tenant=self.tenant,
            store=self.store,
            variant=self.variant,
            ref_type="RESERVATION_COMMIT",
            ref_id=reservation.id,
        ).first()
        self.assertIsNotNone(ledger)
        self.assertEqual(ledger.qty_delta, -50)  # Negative delta (sale/fulfillment)
        self.assertEqual(ledger.balance_after, 50)
    
    def test_commit_reservation_allows_negative_on_hand_with_backorders(self):
        """Test that committing a reservation can result in negative on_hand when backorders enabled"""
        self.tenant.allow_backorders = True
        self.tenant.save()
        
        # Reserve more than available
        reservation = reserve_stock(
            tenant=self.tenant,
            store_id=self.store.id,
            variant_id=self.variant.id,
            qty=150,
            ref_type="WEB_ORDER",
            ref_id=456,
            channel="WEB",
            user=self.user,
        )
        
        # Commit reservation
        committed, item = commit_reservation(reservation.id, tenant=self.tenant, user=self.user)
        
        # Check on_hand can go negative
        self.item.refresh_from_db()
        self.assertEqual(self.item.reserved, Decimal("0"))
        self.assertEqual(self.item.on_hand, Decimal("-50"))  # 100 - 150 = -50
        
        # Check ledger entry
        ledger = StockLedger.objects.filter(
            tenant=self.tenant,
            store=self.store,
            variant=self.variant,
            ref_type="RESERVATION_COMMIT",
            ref_id=reservation.id,
        ).first()
        self.assertEqual(ledger.balance_after, -50)


class ReservationAPITests(Phase3ReservationTestBase):
    """Tests for reservation API endpoints"""
    
    def test_create_reservation_via_api(self):
        """Test creating a reservation via API"""
        request = self._request("POST", "/api/v1/inventory/reservations/reserve", {
            "store_id": self.store.id,
            "variant_id": self.variant.id,
            "quantity": 50,
            "ref_type": "POS_CART",
            "ref_id": 123,
            "channel": "POS",
        })
        response = ReservationCreateView.as_view()(request)
        self.assertEqual(response.status_code, 201)
        
        reservation = Reservation.objects.get(id=response.data["id"])
        self.assertEqual(reservation.status, "ACTIVE")
        self.assertEqual(reservation.quantity, 50)
        
        # Check inventory updated
        self.item.refresh_from_db()
        self.assertEqual(self.item.reserved, Decimal("50"))
    
    def test_list_reservations_via_api(self):
        """Test listing reservations via API"""
        # Create some reservations
        reserve_stock(
            tenant=self.tenant,
            store_id=self.store.id,
            variant_id=self.variant.id,
            qty=30,
            ref_type="POS_CART",
            ref_id=123,
            channel="POS",
            user=self.user,
        )
        reserve_stock(
            tenant=self.tenant,
            store_id=self.store.id,
            variant_id=self.variant.id,
            qty=20,
            ref_type="WEB_ORDER",
            ref_id=456,
            channel="WEB",
            user=self.user,
        )
        
        request = self._request("GET", "/api/v1/inventory/reservations")
        response = ReservationListView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(len(response.data["results"]), 2)
    
    def test_release_reservation_via_api(self):
        """Test releasing a reservation via API"""
        reservation = reserve_stock(
            tenant=self.tenant,
            store_id=self.store.id,
            variant_id=self.variant.id,
            qty=50,
            ref_type="POS_CART",
            ref_id=123,
            channel="POS",
            user=self.user,
        )
        
        request = self._request("POST", f"/api/v1/inventory/reservations/{reservation.id}/release")
        response = ReservationReleaseView.as_view()(request, pk=reservation.id)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "RELEASED")
        
        # Check inventory
        self.item.refresh_from_db()
        self.assertEqual(self.item.reserved, Decimal("0"))
    
    def test_commit_reservation_via_api(self):
        """Test committing a reservation via API"""
        reservation = reserve_stock(
            tenant=self.tenant,
            store_id=self.store.id,
            variant_id=self.variant.id,
            qty=50,
            ref_type="POS_CART",
            ref_id=123,
            channel="POS",
            user=self.user,
        )
        
        request = self._request("POST", f"/api/v1/inventory/reservations/{reservation.id}/commit")
        response = ReservationCommitView.as_view()(request, pk=reservation.id)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "COMMITTED")
        self.assertEqual(response.data["on_hand_after"], 50)
        self.assertEqual(response.data["reserved_after"], 0)
        
        # Check inventory
        self.item.refresh_from_db()
        self.assertEqual(self.item.on_hand, Decimal("50"))
        self.assertEqual(self.item.reserved, Decimal("0"))


class MultiChannelAPITests(Phase3ReservationTestBase):
    """Tests for multi-channel inventory API"""
    
    def test_availability_endpoint(self):
        """Test availability endpoint returns correct data"""
        # Set up inventory
        self.item.on_hand = Decimal("100")
        self.item.reserved = Decimal("30")
        self.item.save()
        
        request = self._request("GET", "/api/v1/inventory/availability", {
            "variant_id": self.variant.id,
            "store_id": self.store.id,
        })
        response = AvailabilityView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        
        data = response.data
        self.assertEqual(data["variant_id"], self.variant.id)
        self.assertEqual(data["store_id"], self.store.id)
        self.assertEqual(data["on_hand"], 100)
        self.assertEqual(data["reserved"], 30)
        self.assertEqual(data["available"], 70)  # 100 - 30
        self.assertEqual(data["in_transit"], 0)  # No transfers in transit
    
    def test_availability_endpoint_with_in_transit(self):
        """Test availability endpoint includes in_transit quantity"""
        from inventory.models import InventoryTransfer, InventoryTransferLine
        
        # Create another store for transfer
        store2 = Store.objects.create(
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
        
        # Create a transfer in transit TO store1
        transfer = InventoryTransfer.objects.create(
            tenant=self.tenant,
            from_store=store2,
            to_store=self.store,
            status="IN_TRANSIT",
            created_by=self.user,
        )
        InventoryTransferLine.objects.create(
            transfer=transfer,
            variant=self.variant,
            qty=25,
            qty_sent=25,
            qty_received=0,
        )
        
        request = self._request("GET", "/api/v1/inventory/availability", {
            "variant_id": self.variant.id,
            "store_id": self.store.id,
        })
        response = AvailabilityView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        
        # Should show in_transit quantity
        self.assertEqual(response.data["in_transit"], 25)
    
    def test_channel_reserve_validates_channel(self):
        """Test that channel reserve validates channel parameter"""
        # Try with invalid channel
        request = self._request("POST", "/api/v1/inventory/reserve", {
            "store_id": self.store.id,
            "variant_id": self.variant.id,
            "quantity": 5,
            "ref_type": "TEST",
            "channel": "INVALID_CHANNEL",
        })
        response = ChannelReserveView.as_view()(request)
        self.assertEqual(response.status_code, 400)
        self.assertIn("Invalid channel", response.data.get("error", ""))
    
    def test_channel_reserve_with_valid_channel(self):
        """Test channel reserve with valid channel"""
        request = self._request("POST", "/api/v1/inventory/reserve", {
            "store_id": self.store.id,
            "variant_id": self.variant.id,
            "quantity": 5,
            "ref_type": "WEB_ORDER",
            "channel": "WEB",
        })
        response = ChannelReserveView.as_view()(request)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["channel"], "WEB")
        
        # Verify reservation was created with correct channel
        reservation = Reservation.objects.get(id=response.data["id"])
        self.assertEqual(reservation.channel, "WEB")
    
    def test_channel_validate_function(self):
        """Test channel validation function"""
        # Valid channels
        self.assertEqual(_validate_channel("POS"), "POS")
        self.assertEqual(_validate_channel("WEB"), "WEB")
        self.assertEqual(_validate_channel("marketplace"), "MARKETPLACE")  # Case insensitive
        
        # Invalid channel
        with self.assertRaises(ValueError):
            _validate_channel("INVALID")
        
        # None defaults to POS
        self.assertEqual(_validate_channel(None), "POS")
    
    def test_channel_release_via_api(self):
        """Test channel release endpoint"""
        reservation = reserve_stock(
            tenant=self.tenant,
            store_id=self.store.id,
            variant_id=self.variant.id,
            qty=50,
            ref_type="WEB_ORDER",
            ref_id=123,
            channel="WEB",
            user=self.user,
        )
        
        request = self._request("POST", "/api/v1/inventory/release", {
            "reservation_id": reservation.id,
        })
        response = ChannelReleaseView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "RELEASED")
        self.assertEqual(response.data["channel"], "WEB")
    
    def test_channel_commit_via_api(self):
        """Test channel commit endpoint"""
        reservation = reserve_stock(
            tenant=self.tenant,
            store_id=self.store.id,
            variant_id=self.variant.id,
            qty=50,
            ref_type="WEB_ORDER",
            ref_id=123,
            channel="WEB",
            user=self.user,
        )
        
        request = self._request("POST", "/api/v1/inventory/commit", {
            "reservation_id": reservation.id,
        })
        response = ChannelCommitView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "COMMITTED")
        self.assertEqual(response.data["channel"], "WEB")
    
    def test_availability_endpoint_tenant_isolation(self):
        """Test that availability endpoint respects tenant isolation"""
        # Create another tenant
        other_tenant = Tenant.objects.create(
            name="Other Tenant",
            code="other",
            currency_code="USD",
        )
        other_store = Store.objects.create(
            tenant=other_tenant,
            name="Other Store",
            code="OS1",
            timezone="UTC",
            region="",
            street="1 Other St",
            city="Austin",
            state="TX",
            postal_code="73301",
            country="USA",
        )
        
        # Try to access other tenant's store
        request = self._request("GET", "/api/v1/inventory/availability", {
            "variant_id": self.variant.id,
            "store_id": other_store.id,
        })
        response = AvailabilityView.as_view()(request)
        # Should fail because store doesn't belong to tenant
        self.assertEqual(response.status_code, 404)
        self.assertIn("Store not found", response.data.get("error", ""))

