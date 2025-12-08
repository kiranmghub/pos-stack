"""
Tests for inventory analytics: Shrinkage, Aging, and Cycle Count Coverage.
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
from inventory.models import InventoryItem, StockLedger, InventoryAdjustment, InventoryAdjustmentLine, AdjustmentReason
from inventory.models_counts import CountSession, CountLine
from orders.models import Sale, SaleLine
from stores.models import Register
from analytics.inventory_analytics import (
    calculate_shrinkage,
    calculate_aging,
    calculate_count_coverage,
    get_inventory_health_summary,
)
from analytics.api_inventory_health import (
    ShrinkageReportView,
    AgingReportView,
    CountCoverageView,
    InventoryHealthSummaryView,
)


class InventoryAnalyticsTestBase(TestCase):
    """Base test class for inventory analytics tests"""
    
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
        else:
            raise ValueError(f"Unsupported method: {method}")
        force_authenticate(request, user=user)
        request.tenant = self.tenant
        return request


class ShrinkageAnalyticsTests(InventoryAnalyticsTestBase):
    """Tests for shrinkage analytics"""
    
    def test_calculate_shrinkage_no_data(self):
        """Test shrinkage calculation with no data"""
        result = calculate_shrinkage(
            tenant=self.tenant,
            days_back=90,
        )
        
        self.assertEqual(result["total_shrinkage"], 0)
        self.assertEqual(result["total_entries"], 0)
        self.assertEqual(result["confidence"], 0.0)
    
    def test_calculate_shrinkage_from_adjustments(self):
        """Test shrinkage calculation from adjustments"""
        # Create adjustment reason
        reason = AdjustmentReason.objects.create(
            tenant=self.tenant,
            code="DAMAGE",
            name="Damage",
        )
        
        # Create adjustment with negative delta (shrinkage)
        adjustment = InventoryAdjustment.objects.create(
            tenant=self.tenant,
            store=self.store,
            reason=reason,
            note="Damaged items",
            created_by=self.user,
        )
        InventoryAdjustmentLine.objects.create(
            adjustment=adjustment,
            variant=self.variant,
            delta=-10,  # Negative = shrinkage
        )
        
        # Create ledger entry for adjustment
        StockLedger.objects.create(
            tenant=self.tenant,
            store=self.store,
            variant=self.variant,
            qty_delta=-10,
            balance_after=90,
            ref_type="ADJUSTMENT",
            ref_id=adjustment.id,
            created_by=self.user,
        )
        
        result = calculate_shrinkage(
            tenant=self.tenant,
            days_back=90,
        )
        
        self.assertEqual(result["total_shrinkage"], 10)
        self.assertEqual(len(result["shrinkage_by_reason"]), 1)
        self.assertEqual(result["shrinkage_by_reason"][0]["code"], "DAMAGE")
        self.assertEqual(result["shrinkage_by_reason"][0]["quantity"], 10)
    
    def test_calculate_shrinkage_from_count_reconcile(self):
        """Test shrinkage calculation from cycle count reconciliations"""
        # Create count session
        count_session = CountSession.objects.create(
            tenant=self.tenant,
            store=self.store,
            status="FINALIZED",
            finalized_at=timezone.now(),
            created_by=self.user,
        )
        
        # Create ledger entry for count reconcile (negative delta = shrinkage)
        StockLedger.objects.create(
            tenant=self.tenant,
            store=self.store,
            variant=self.variant,
            qty_delta=-5,
            balance_after=95,
            ref_type="COUNT_RECONCILE",
            ref_id=count_session.id,
            created_by=self.user,
        )
        
        result = calculate_shrinkage(
            tenant=self.tenant,
            days_back=90,
        )
        
        self.assertEqual(result["total_shrinkage"], 5)
        self.assertEqual(result["count_reconciliations"]["quantity"], 5)
        self.assertEqual(len(result["shrinkage_by_reason"]), 1)
        self.assertEqual(result["shrinkage_by_reason"][0]["code"], "COUNT_RECONCILE")
    
    def test_shrinkage_report_endpoint(self):
        """Test shrinkage report API endpoint"""
        request = self._request("GET", "/api/v1/analytics/inventory/shrinkage", {
            "days_back": "90",
        })
        response = ShrinkageReportView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        
        data = response.data
        self.assertIn("total_shrinkage", data)
        self.assertIn("shrinkage_by_reason", data)
        self.assertIn("count_reconciliations", data)
        self.assertIn("adjustments", data)


class AgingAnalyticsTests(InventoryAnalyticsTestBase):
    """Tests for aging inventory analytics"""
    
    def test_calculate_aging_no_sales(self):
        """Test aging calculation for variants with no sales"""
        result = calculate_aging(
            tenant=self.tenant,
            days_no_sales=90,
        )
        
        # Should find variant with inventory but no sales
        self.assertGreaterEqual(result["variant_count"], 1)
        self.assertIn("aging_variants", result)
        self.assertIn("total_aging_value", result)
    
    def test_calculate_aging_with_recent_sales(self):
        """Test aging calculation excludes variants with recent sales"""
        # Create a sale for the variant
        sale = Sale.objects.create(
            tenant=self.tenant,
            store=self.store,
            register=self.register,
            cashier=self.user,
            status="completed",
            total=Decimal("10.00"),
            created_at=timezone.now() - timedelta(days=5),  # Recent sale
        )
        SaleLine.objects.create(
            sale=sale,
            variant=self.variant,
            qty=1,
            unit_price=Decimal("10.00"),
            line_total=Decimal("10.00"),
        )
        
        result = calculate_aging(
            tenant=self.tenant,
            days_no_sales=90,
        )
        
        # Should not include variant with recent sale
        variant_ids = [v["variant_id"] for v in result["aging_variants"]]
        self.assertNotIn(self.variant.id, variant_ids)
    
    def test_aging_report_endpoint(self):
        """Test aging report API endpoint"""
        request = self._request("GET", "/api/v1/analytics/inventory/aging", {
            "days_no_sales": "90",
        })
        response = AgingReportView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        
        data = response.data
        self.assertIn("aging_variants", data)
        self.assertIn("total_aging_value", data)
        self.assertIn("aging_by_category", data)


class CoverageAnalyticsTests(InventoryAnalyticsTestBase):
    """Tests for cycle count coverage analytics"""
    
    def test_calculate_count_coverage_no_counts(self):
        """Test coverage calculation with no count sessions"""
        result = calculate_count_coverage(
            tenant=self.tenant,
            days_back=90,
        )
        
        self.assertEqual(result["coverage_percentage"], 0.0)
        self.assertEqual(result["counted_variants"], 0)
        self.assertEqual(result["count_sessions"], 0)
    
    def test_calculate_count_coverage_with_counts(self):
        """Test coverage calculation with count sessions"""
        # Create finalized count session
        count_session = CountSession.objects.create(
            tenant=self.tenant,
            store=self.store,
            status="FINALIZED",
            finalized_at=timezone.now() - timedelta(days=5),
            created_by=self.user,
        )
        
        # Add count line
        CountLine.objects.create(
            session=count_session,
            variant=self.variant,
            expected_qty=100,
            counted_qty=95,
        )
        
        result = calculate_count_coverage(
            tenant=self.tenant,
            days_back=90,
        )
        
        self.assertGreater(result["coverage_percentage"], 0.0)
        self.assertEqual(result["counted_variants"], 1)
        self.assertEqual(result["count_sessions"], 1)
    
    def test_coverage_report_endpoint(self):
        """Test coverage report API endpoint"""
        request = self._request("GET", "/api/v1/analytics/inventory/coverage", {
            "days_back": "90",
        })
        response = CountCoverageView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        
        data = response.data
        self.assertIn("coverage_percentage", data)
        self.assertIn("total_variants", data)
        self.assertIn("counted_variants", data)
        self.assertIn("count_sessions", data)


class InventoryHealthSummaryTests(InventoryAnalyticsTestBase):
    """Tests for comprehensive inventory health summary"""
    
    def test_get_inventory_health_summary(self):
        """Test comprehensive inventory health summary"""
        summary = get_inventory_health_summary(
            tenant=self.tenant,
            days_back=90,
            aging_days=90,
        )
        
        self.assertIn("shrinkage", summary)
        self.assertIn("aging", summary)
        self.assertIn("coverage", summary)
        self.assertIn("calculated_at", summary)
    
    def test_inventory_health_summary_endpoint(self):
        """Test inventory health summary API endpoint"""
        request = self._request("GET", "/api/v1/analytics/inventory/health", {
            "days_back": "90",
            "aging_days": "90",
        })
        response = InventoryHealthSummaryView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        
        data = response.data
        self.assertIn("shrinkage", data)
        self.assertIn("aging", data)
        self.assertIn("coverage", data)
    
    def test_inventory_health_summary_tenant_isolation(self):
        """Test that inventory health summary respects tenant isolation"""
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
        request = self._request("GET", "/api/v1/analytics/inventory/health", {
            "store_id": other_store.id,
        })
        response = InventoryHealthSummaryView.as_view()(request)
        # Should fail because store doesn't belong to tenant
        self.assertEqual(response.status_code, 404)
        self.assertIn("Store not found", response.data.get("error", ""))

