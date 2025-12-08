from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from catalog.models import Product, Variant
from inventory.api import InventoryOverviewView, StockByStoreListView
from inventory.views import LowStockView
from inventory.models import InventoryItem
from stores.models import Store
from tenants.models import Tenant, TenantUser


class LowStockThresholdTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = get_user_model().objects.create_user(
            username="cashier",
            email="cashier@example.com",
            password="test-pass",
        )
        self.tenant = Tenant.objects.create(
            name="Acme",
            code="acme",
            currency_code="USD",
            default_currency="USD",
            default_reorder_point=5,
        )
        self.store = Store.objects.create(
            tenant=self.tenant,
            name="Main Store",
            code="main",
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
            name="Widget",
            code="widget",
        )
        self.variant_override = Variant.objects.create(
            product=self.product,
            tenant=self.tenant,
            name="Widget Blue",
            sku="SKU-1",
            barcode="111",
            price="10.00",
            reorder_point=2,
        )
        self.variant_default = Variant.objects.create(
            product=self.product,
            tenant=self.tenant,
            name="Widget Red",
            sku="SKU-2",
            barcode="222",
            price="12.00",
        )
        InventoryItem.objects.create(
            tenant=self.tenant,
            store=self.store,
            variant=self.variant_override,
            on_hand=Decimal("1"),
            reserved=0,
        )
        InventoryItem.objects.create(
            tenant=self.tenant,
            store=self.store,
            variant=self.variant_default,
            on_hand=Decimal("4"),
            reserved=0,
        )
        TenantUser.objects.create(tenant=self.tenant, user=self.user, role="manager")

    def _request(self, path: str, params=None):
        request = self.factory.get(path, params or {})
        force_authenticate(request, user=self.user)
        request.tenant = self.tenant
        return request

    def test_stock_endpoint_uses_variant_and_tenant_thresholds(self):
        response = StockByStoreListView.as_view()(
            self._request("/api/v1/inventory/stock", {"store_id": self.store.id})
        )
        self.assertEqual(response.status_code, 200)
        rows = {row["sku"]: row for row in response.data["results"]}
        self.assertEqual(rows["SKU-1"]["low_stock_threshold"], 2)
        self.assertTrue(rows["SKU-1"]["low_stock"])
        self.assertEqual(rows["SKU-2"]["low_stock_threshold"], 5)
        self.assertTrue(rows["SKU-2"]["low_stock"])

    def test_overview_counts_respect_effective_threshold(self):
        response = InventoryOverviewView.as_view()(
            self._request("/api/v1/inventory/overview", {"store_id": self.store.id})
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["low_stock_count"], 2)
        self.assertEqual(response.data["low_stock_threshold_default"], 5)

    def test_low_stock_feed_includes_threshold_field(self):
        response = LowStockView.as_view()(
            self._request("/api/v1/inventory/low_stock", {"limit": 5})
        )
        self.assertEqual(response.status_code, 200)
        payload = {row["sku"]: row for row in response.data}
        self.assertEqual(payload["SKU-1"]["low_stock_threshold"], 2)
        self.assertEqual(payload["SKU-2"]["low_stock_threshold"], 5)
