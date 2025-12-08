"""
Tests for vendor analytics and scorecard functionality.
"""
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APIRequestFactory, force_authenticate

from tenants.models import Tenant, TenantUser
from stores.models import Store
from catalog.models import Product, Variant
from purchasing.models import Vendor, PurchaseOrder, PurchaseOrderLine
from analytics.vendor_analytics import (
    calculate_on_time_percentage,
    calculate_average_lead_time,
    calculate_fill_rate,
    calculate_cost_variance,
    get_vendor_scorecard,
)
from analytics.api_vendor import VendorScorecardView


class VendorAnalyticsTestBase(TestCase):
    """Base test class for vendor analytics tests"""
    
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
            lead_time_days=7,
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
        else:
            raise ValueError(f"Unsupported method: {method}")
        force_authenticate(request, user=user)
        request.tenant = self.tenant
        return request


class VendorAnalyticsTests(VendorAnalyticsTestBase):
    """Tests for vendor analytics calculations"""
    
    def test_calculate_on_time_percentage_no_orders(self):
        """Test on-time percentage with no orders"""
        result = calculate_on_time_percentage(
            tenant=self.tenant,
            vendor_id=self.vendor.id,
            days_back=90,
        )
        
        self.assertEqual(result["on_time_percentage"], 0.0)
        self.assertEqual(result["total_orders"], 0)
        self.assertEqual(result["confidence"], 0.0)
    
    def test_calculate_on_time_percentage_with_orders(self):
        """Test on-time percentage calculation"""
        # Create a purchase order submitted 10 days ago, received 5 days ago (on time)
        submitted_date = timezone.now() - timedelta(days=10)
        received_date = submitted_date + timedelta(days=5)  # 5 days after submitted
        
        po = PurchaseOrder.objects.create(
            tenant=self.tenant,
            store=self.store,
            vendor=self.vendor,
            status="RECEIVED",
            submitted_at=submitted_date,
        )
        # Note: updated_at is auto-updated, so we can't directly set it
        # In a real system, we'd have a received_at field
        # For this test, we'll accept that updated_at will be current time
        # The calculation uses updated_at as proxy, so we need to account for that
        # Since vendor lead_time_days is 7, and we received in 5 days, it should be on time
        # But updated_at will be now(), so the calculation will use (now() - submitted_at) days
        # Let's adjust: submitted 10 days ago, so lead time check is: now() - 10 days <= submitted + 7 days
        # That's: now() <= submitted + 17 days, which is true since submitted was 10 days ago
        # Actually, the logic checks: received_date <= expected_date
        # expected_date = submitted_at + lead_time_days (7 days)
        # received_date = updated_at (which is now, ~10 days after submitted)
        # So: now() <= (submitted_at + 7 days) = (now() - 10 days + 7 days) = now() - 3 days
        # This is False, so it will be marked as late
        
        # To make it on-time, we need submitted_at to be more recent
        # Let's submit 3 days ago, so received (now) is within 7 day lead time
        po.submitted_at = timezone.now() - timedelta(days=3)
        po.save(update_fields=["submitted_at"])
        
        result = calculate_on_time_percentage(
            tenant=self.tenant,
            vendor_id=self.vendor.id,
            days_back=90,
        )
        
        self.assertEqual(result["total_orders"], 1)
        # Should be on time since received (now) is within 7 days of submitted (3 days ago)
        self.assertEqual(result["on_time_orders"], 1)
        self.assertEqual(result["late_orders"], 0)
        self.assertEqual(result["on_time_percentage"], 100.0)
    
    def test_calculate_average_lead_time(self):
        """Test average lead time calculation"""
        # Create purchase orders with different lead times using received_at for accuracy
        
        # PO1: submitted 10 days ago, received 5 days ago (lead time = 5 days)
        submitted1 = timezone.now() - timedelta(days=10)
        received1 = submitted1 + timedelta(days=5)
        po1 = PurchaseOrder.objects.create(
            tenant=self.tenant,
            store=self.store,
            vendor=self.vendor,
            status="RECEIVED",
            submitted_at=submitted1,
            received_at=received1,
        )
        
        # PO2: submitted 10 days ago, received 3 days ago (lead time = 7 days)
        submitted2 = timezone.now() - timedelta(days=10)
        received2 = submitted2 + timedelta(days=7)
        po2 = PurchaseOrder.objects.create(
            tenant=self.tenant,
            store=self.store,
            vendor=self.vendor,
            status="RECEIVED",
            submitted_at=submitted2,
            received_at=received2,
        )
        
        result = calculate_average_lead_time(
            tenant=self.tenant,
            vendor_id=self.vendor.id,
            days_back=90,
        )
        
        self.assertEqual(result["orders_count"], 2)
        # Average: (5 + 7) / 2 = 6 days
        self.assertEqual(result["average_lead_time_days"], 6.0)
        self.assertEqual(result["min_lead_time_days"], 5)
        self.assertEqual(result["max_lead_time_days"], 7)
    
    def test_calculate_fill_rate(self):
        """Test fill rate calculation"""
        # Create purchase order with lines
        po = PurchaseOrder.objects.create(
            tenant=self.tenant,
            store=self.store,
            vendor=self.vendor,
            status="RECEIVED",
            submitted_at=timezone.now() - timedelta(days=5),
        )
        PurchaseOrderLine.objects.create(
            purchase_order=po,
            variant=self.variant,
            qty_ordered=100,
            qty_received=95,
            unit_cost=Decimal("10.00"),
        )
        PurchaseOrderLine.objects.create(
            purchase_order=po,
            variant=self.variant,
            qty_ordered=50,
            qty_received=50,
            unit_cost=Decimal("5.00"),
        )
        
        result = calculate_fill_rate(
            tenant=self.tenant,
            vendor_id=self.vendor.id,
            days_back=90,
        )
        
        self.assertEqual(result["total_ordered"], 150)
        self.assertEqual(result["total_received"], 145)
        # Fill rate: 145/150 = 96.67%
        self.assertAlmostEqual(result["fill_rate_percentage"], 96.67, places=1)
    
    def test_calculate_cost_variance(self):
        """Test cost variance calculation"""
        # Create purchase orders with different unit costs
        po1 = PurchaseOrder.objects.create(
            tenant=self.tenant,
            store=self.store,
            vendor=self.vendor,
            status="RECEIVED",
            submitted_at=timezone.now() - timedelta(days=10),
        )
        PurchaseOrderLine.objects.create(
            purchase_order=po1,
            variant=self.variant,
            qty_ordered=10,
            qty_received=10,
            unit_cost=Decimal("10.00"),
        )
        
        po2 = PurchaseOrder.objects.create(
            tenant=self.tenant,
            store=self.store,
            vendor=self.vendor,
            status="RECEIVED",
            submitted_at=timezone.now() - timedelta(days=5),
        )
        PurchaseOrderLine.objects.create(
            purchase_order=po2,
            variant=self.variant,
            qty_ordered=10,
            qty_received=10,
            unit_cost=Decimal("12.00"),
        )
        
        result = calculate_cost_variance(
            tenant=self.tenant,
            vendor_id=self.vendor.id,
            days_back=90,
        )
        
        self.assertEqual(result["orders_count"], 2)
        self.assertEqual(result["average_unit_cost"], 11.0)  # (10 + 12) / 2
        self.assertEqual(result["min_unit_cost"], 10.0)
        self.assertEqual(result["max_unit_cost"], 12.0)
        self.assertGreater(result["cost_variance"], 0)
    
    def test_get_vendor_scorecard(self):
        """Test comprehensive vendor scorecard"""
        # Create some purchase orders with received_at for accurate tracking
        submitted_date = timezone.now() - timedelta(days=10)
        received_date = submitted_date + timedelta(days=5)
        po = PurchaseOrder.objects.create(
            tenant=self.tenant,
            store=self.store,
            vendor=self.vendor,
            status="RECEIVED",
            submitted_at=submitted_date,
            received_at=received_date,
        )
        
        PurchaseOrderLine.objects.create(
            purchase_order=po,
            variant=self.variant,
            qty_ordered=100,
            qty_received=100,
            unit_cost=Decimal("10.00"),
        )
        
        scorecard = get_vendor_scorecard(
            tenant=self.tenant,
            vendor_id=self.vendor.id,
            days_back=90,
        )
        
        self.assertIsNotNone(scorecard)
        self.assertEqual(scorecard["vendor_id"], self.vendor.id)
        self.assertEqual(scorecard["vendor_name"], self.vendor.name)
        self.assertIn("on_time_performance", scorecard)
        self.assertIn("lead_time", scorecard)
        self.assertIn("fill_rate", scorecard)
        self.assertIn("cost_variance", scorecard)
        self.assertIn("overall_score", scorecard)
        self.assertGreaterEqual(scorecard["overall_score"], 0)
        self.assertLessEqual(scorecard["overall_score"], 100)
    
    def test_vendor_scorecard_endpoint(self):
        """Test vendor scorecard API endpoint"""
        request = self._request("GET", f"/api/v1/analytics/vendors/{self.vendor.id}/scorecard")
        response = VendorScorecardView.as_view()(request, id=self.vendor.id)
        self.assertEqual(response.status_code, 200)
        
        data = response.data
        self.assertEqual(data["vendor_id"], self.vendor.id)
        self.assertIn("on_time_performance", data)
        self.assertIn("lead_time", data)
        self.assertIn("fill_rate", data)
        self.assertIn("cost_variance", data)
        self.assertIn("overall_score", data)
    
    def test_vendor_scorecard_endpoint_tenant_isolation(self):
        """Test that vendor scorecard respects tenant isolation"""
        # Create another tenant
        other_tenant = Tenant.objects.create(
            name="Other Tenant",
            code="other",
            currency_code="USD",
        )
        other_vendor = Vendor.objects.create(
            tenant=other_tenant,
            name="Other Vendor",
            code="OTHER1",
        )
        
        # Try to access other tenant's vendor
        request = self._request("GET", f"/api/v1/analytics/vendors/{other_vendor.id}/scorecard")
        response = VendorScorecardView.as_view()(request, id=other_vendor.id)
        # Should fail because vendor doesn't belong to tenant
        self.assertEqual(response.status_code, 404)
        self.assertIn("Vendor not found", response.data.get("error", ""))

