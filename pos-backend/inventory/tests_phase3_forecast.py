"""
Phase 3 Tests: Forecasting & Predictive Reorder
"""
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APIRequestFactory, force_authenticate

from catalog.models import Product, Variant
from inventory.models import InventoryItem
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


class ForecastingTestBase(TestCase):
    """Base test class for forecasting tests"""
    
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
        self.register = Register.objects.create(
            store=self.store,
            tenant=self.tenant,
            name="Test Register",
            code="REG1",
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
            reorder_point=20,
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


class ForecastingTests(ForecastingTestBase):
    """Tests for forecasting and predictive reorder functionality"""
    
    def test_calculate_sales_velocity_no_sales(self):
        """Test sales velocity calculation with no sales"""
        velocity = calculate_sales_velocity(
            tenant=self.tenant,
            variant_id=self.variant.id,
            store_id=self.store.id,
            days=30,
        )
        
        self.assertEqual(velocity["daily_avg"], 0.0)
        self.assertEqual(velocity["total_qty"], 0)
        self.assertEqual(velocity["days_with_sales"], 0)
        self.assertEqual(velocity["confidence"], 0.0)
    
    def test_calculate_sales_velocity_with_sales(self):
        """Test sales velocity calculation with sales data"""
        # Create completed sales
        sale1 = Sale.objects.create(
            tenant=self.tenant,
            store=self.store,
            register=self.register,
            cashier=self.user,
            status="completed",
            total=Decimal("100.00"),
            created_at=timezone.now() - timedelta(days=5),
        )
        SaleLine.objects.create(
            sale=sale1,
            variant=self.variant,
            qty=10,
            unit_price=Decimal("10.00"),
            line_total=Decimal("100.00"),
        )
        
        sale2 = Sale.objects.create(
            tenant=self.tenant,
            store=self.store,
            register=self.register,
            cashier=self.user,
            status="completed",
            total=Decimal("50.00"),
            created_at=timezone.now() - timedelta(days=2),
        )
        SaleLine.objects.create(
            sale=sale2,
            variant=self.variant,
            qty=5,
            unit_price=Decimal("10.00"),
            line_total=Decimal("50.00"),
        )
        
        velocity = calculate_sales_velocity(
            tenant=self.tenant,
            variant_id=self.variant.id,
            store_id=self.store.id,
            days=30,
        )
        
        # Total: 15 units over 30 days = 0.5 per day
        self.assertAlmostEqual(velocity["daily_avg"], 0.5, places=2)
        self.assertEqual(velocity["total_qty"], 15)
        self.assertEqual(velocity["days_with_sales"], 2)
        self.assertGreater(velocity["confidence"], 0.0)
    
    def test_calculate_predicted_stockout_date(self):
        """Test predicted stockout date calculation"""
        # With 100 units on hand and 5 units/day velocity
        stockout = calculate_predicted_stockout_date(
            tenant=self.tenant,
            variant_id=self.variant.id,
            store_id=self.store.id,
            current_on_hand=100,
            daily_velocity=5.0,
        )
        
        self.assertIsNotNone(stockout["predicted_date"])
        self.assertEqual(stockout["days_until_stockout"], 20)  # 100 / 5 = 20 days
        self.assertTrue(stockout["is_at_risk"])  # 20 days <= 30 days threshold
    
    def test_calculate_predicted_stockout_at_risk(self):
        """Test predicted stockout for at-risk items"""
        # With 50 units on hand and 5 units/day velocity
        stockout = calculate_predicted_stockout_date(
            tenant=self.tenant,
            variant_id=self.variant.id,
            store_id=self.store.id,
            current_on_hand=50,
            daily_velocity=5.0,
        )
        
        self.assertEqual(stockout["days_until_stockout"], 10)  # 50 / 5 = 10 days
        self.assertTrue(stockout["is_at_risk"])  # 10 days <= 30 days threshold
    
    def test_calculate_recommended_order_qty(self):
        """Test recommended order quantity calculation"""
        reorder = calculate_recommended_order_qty(
            tenant=self.tenant,
            variant_id=self.variant.id,
            store_id=self.store.id,
            daily_velocity=5.0,
            lead_time_days=7,
            safety_stock_days=7,
            current_on_hand=20,
        )
        
        # Lead time demand: 5 * 7 = 35
        # Safety stock: 5 * 7 = 35
        # Target stock: 35 + 35 = 70
        # Recommended: 70 - 20 = 50
        self.assertEqual(reorder["recommended_qty"], 50)
        self.assertEqual(reorder["calculation_method"], "velocity_based")
        self.assertIn("lead_time_demand", reorder["factors"])
    
    def test_reorder_forecast_endpoint(self):
        """Test reorder forecast API endpoint"""
        request = self._request("GET", "/api/v1/inventory/reorder_forecast", {
            "variant_id": self.variant.id,
            "store_id": self.store.id,
        })
        response = ReorderForecastView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        
        data = response.data
        self.assertEqual(data["variant_id"], self.variant.id)
        self.assertEqual(data["store_id"], self.store.id)
        self.assertIn("current_on_hand", data)
        self.assertIn("sales_velocity", data)
        self.assertIn("predicted_stockout_date", data)
        self.assertIn("recommended_order_qty", data)
        self.assertIn("confidence_score", data)
        self.assertIn("is_at_risk", data)
    
    def test_reorder_forecast_endpoint_tenant_isolation(self):
        """Test that reorder forecast respects tenant isolation"""
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
        
        # Try to access other tenant's variant
        request = self._request("GET", "/api/v1/inventory/reorder_forecast", {
            "variant_id": self.variant.id,
            "store_id": other_store.id,
        })
        response = ReorderForecastView.as_view()(request)
        # Should fail because store doesn't belong to tenant
        self.assertEqual(response.status_code, 404)
        self.assertIn("Store not found", response.data.get("error", ""))
    
    def test_at_risk_items_endpoint(self):
        """Test at-risk items API endpoint"""
        request = self._request("GET", "/api/v1/inventory/at_risk_items", {
            "store_id": self.store.id,
            "limit": 10,
        })
        response = AtRiskItemsView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        
        self.assertIn("results", response.data)
        self.assertIn("count", response.data)
        self.assertIsInstance(response.data["results"], list)

