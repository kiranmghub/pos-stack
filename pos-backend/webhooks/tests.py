"""
Tests for webhook functionality.
"""
from unittest.mock import patch, MagicMock
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from tenants.models import Tenant, TenantUser
from stores.models import Store
from catalog.models import Product, Variant
from inventory.models import InventoryItem, StockLedger
from inventory.models_counts import CountSession, CountLine
from inventory.models import InventoryTransfer, InventoryTransferLine
from purchasing.models import Vendor, PurchaseOrder, PurchaseOrderLine
from stores.models import Register
from webhooks.models import WebhookSubscription, WebhookDelivery
from webhooks.services import publish_webhook_event, deliver_webhook_sync
from webhooks.events import (
    build_stock_changed_event,
    build_transfer_sent_event,
    build_transfer_received_event,
    build_count_finalized_event,
    build_purchase_order_received_event,
)
from webhooks.api import (
    WebhookSubscriptionListCreateView,
    WebhookSubscriptionDetailView,
    WebhookDeliveryListView,
)


class WebhookTestBase(TestCase):
    """Base test class for webhook tests"""
    
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
            on_hand=100,
            reserved=0,
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
        elif method == "DELETE":
            request = self.factory.delete(path)
        else:
            raise ValueError(f"Unsupported method: {method}")
        force_authenticate(request, user=user)
        request.tenant = self.tenant
        return request


class WebhookSubscriptionTests(WebhookTestBase):
    """Tests for webhook subscription management"""
    
    def test_create_webhook_subscription(self):
        """Test creating a webhook subscription"""
        request = self._request("POST", "/api/v1/webhooks/subscriptions", {
            "url": "https://example.com/webhook",
            "event_types": ["inventory.stock_changed"],
            "description": "Test webhook",
        })
        response = WebhookSubscriptionListCreateView.as_view()(request)
        self.assertEqual(response.status_code, 201)
        
        data = response.data
        self.assertIn("id", data)
        self.assertEqual(data["url"], "https://example.com/webhook")
        self.assertEqual(data["event_types"], ["inventory.stock_changed"])
        self.assertIn("secret", data)  # Secret should be returned on creation
    
    def test_list_webhook_subscriptions(self):
        """Test listing webhook subscriptions"""
        # Create a subscription
        WebhookSubscription.objects.create(
            tenant=self.tenant,
            url="https://example.com/webhook",
            event_types=["inventory.stock_changed"],
        )
        
        request = self._request("GET", "/api/v1/webhooks/subscriptions")
        response = WebhookSubscriptionListCreateView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        
        data = response.data
        self.assertEqual(data["count"], 1)
        self.assertEqual(len(data["results"]), 1)
    
    def test_webhook_subscription_tenant_isolation(self):
        """Test that webhook subscriptions are tenant-isolated"""
        other_tenant = Tenant.objects.create(
            name="Other Tenant",
            code="other",
            currency_code="USD",
        )
        WebhookSubscription.objects.create(
            tenant=other_tenant,
            url="https://other.com/webhook",
            event_types=["inventory.stock_changed"],
        )
        
        request = self._request("GET", "/api/v1/webhooks/subscriptions")
        response = WebhookSubscriptionListCreateView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        
        # Should only see our tenant's subscription
        data = response.data
        self.assertEqual(data["count"], 0)


class WebhookEventPublishingTests(WebhookTestBase):
    """Tests for webhook event publishing"""
    
    def test_publish_webhook_event(self):
        """Test publishing a webhook event"""
        # Create subscription
        subscription = WebhookSubscription.objects.create(
            tenant=self.tenant,
            url="https://example.com/webhook",
            event_types=["inventory.stock_changed"],
        )
        
        # Publish event
        payload = {
            "event": "inventory.stock_changed",
            "data": {"variant_id": self.variant.id},
        }
        queued_count = publish_webhook_event(self.tenant, "inventory.stock_changed", payload)
        
        self.assertEqual(queued_count, 1)
        
        # Check delivery was created
        delivery = WebhookDelivery.objects.get(subscription=subscription)
        self.assertEqual(delivery.event_type, "inventory.stock_changed")
        self.assertEqual(delivery.status, "PENDING")
        self.assertIsNotNone(delivery.signature)
    
    def test_publish_webhook_event_no_subscriptions(self):
        """Test publishing event with no subscriptions"""
        payload = {"event": "inventory.stock_changed", "data": {}}
        queued_count = publish_webhook_event(self.tenant, "inventory.stock_changed", payload)
        self.assertEqual(queued_count, 0)
    
    def test_publish_webhook_event_inactive_subscription(self):
        """Test that inactive subscriptions don't receive events"""
        subscription = WebhookSubscription.objects.create(
            tenant=self.tenant,
            url="https://example.com/webhook",
            event_types=["inventory.stock_changed"],
            is_active=False,
        )
        
        payload = {"event": "inventory.stock_changed", "data": {}}
        queued_count = publish_webhook_event(self.tenant, "inventory.stock_changed", payload)
        self.assertEqual(queued_count, 0)


class WebhookDeliveryTests(WebhookTestBase):
    """Tests for webhook delivery"""
    
    @patch('webhooks.services.requests')
    def test_deliver_webhook_success(self, mock_requests):
        """Test successful webhook delivery"""
        # Create subscription and delivery
        subscription = WebhookSubscription.objects.create(
            tenant=self.tenant,
            url="https://example.com/webhook",
            event_types=["inventory.stock_changed"],
        )
        delivery = WebhookDelivery.objects.create(
            subscription=subscription,
            event_type="inventory.stock_changed",
            payload={"test": "data"},
            signature="test-signature",
            status="PENDING",
        )
        
        # Mock successful response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = "OK"
        mock_requests.post.return_value = mock_response
        
        # Deliver webhook
        deliver_webhook_sync(delivery.id)
        
        # Check delivery was successful
        delivery.refresh_from_db()
        self.assertEqual(delivery.status, "SUCCESS")
        self.assertEqual(delivery.response_status_code, 200)
        self.assertIsNotNone(delivery.delivered_at)
        
        # Check subscription stats updated
        subscription.refresh_from_db()
        self.assertIsNotNone(subscription.last_success_at)
        self.assertEqual(subscription.failure_count, 0)
    
    @patch('webhooks.services.requests')
    def test_deliver_webhook_failure_retry(self, mock_requests):
        """Test webhook delivery failure with retry"""
        # Create subscription and delivery
        subscription = WebhookSubscription.objects.create(
            tenant=self.tenant,
            url="https://example.com/webhook",
            event_types=["inventory.stock_changed"],
            max_retries=3,
            retry_backoff_seconds=60,
        )
        delivery = WebhookDelivery.objects.create(
            subscription=subscription,
            event_type="inventory.stock_changed",
            payload={"test": "data"},
            signature="test-signature",
            status="PENDING",
            max_retries=3,
        )
        
        # Mock failure response
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.text = "Internal Server Error"
        mock_requests.post.return_value = mock_response
        
        # Deliver webhook
        deliver_webhook_sync(delivery.id)
        
        # Check delivery is retrying
        delivery.refresh_from_db()
        self.assertEqual(delivery.status, "RETRYING")
        self.assertEqual(delivery.attempt_count, 1)
        self.assertIsNotNone(delivery.next_retry_at)


class WebhookEventBuildersTests(WebhookTestBase):
    """Tests for webhook event payload builders"""
    
    def test_build_stock_changed_event(self):
        """Test building stock_changed event payload"""
        payload = build_stock_changed_event(
            tenant=self.tenant,
            store=self.store,
            variant=self.variant,
            old_on_hand=100,
            new_on_hand=90,
            ref_type="SALE",
            ref_id=123,
            user=self.user,
        )
        
        self.assertEqual(payload["event"], "inventory.stock_changed")
        self.assertEqual(payload["tenant_id"], self.tenant.id)
        self.assertEqual(payload["data"]["delta"], -10)
        self.assertEqual(payload["data"]["old_on_hand"], 100)
        self.assertEqual(payload["data"]["new_on_hand"], 90)
    
    def test_build_transfer_sent_event(self):
        """Test building transfer_sent event payload"""
        to_store = Store.objects.create(
            tenant=self.tenant,
            name="Store 2",
            code="S2",
            timezone="UTC",
            region="",
            street="2 Main St",
            city="Austin",
            state="TX",
            postal_code="73301",
            country="USA",
        )
        transfer = InventoryTransfer.objects.create(
            tenant=self.tenant,
            from_store=self.store,
            to_store=to_store,
            status="IN_TRANSIT",
            created_by=self.user,
        )
        InventoryTransferLine.objects.create(
            transfer=transfer,
            variant=self.variant,
            qty=10,
            qty_sent=10,
        )
        
        payload = build_transfer_sent_event(
            tenant=self.tenant,
            transfer=transfer,
            user=self.user,
        )
        
        self.assertEqual(payload["event"], "inventory.transfer_sent")
        self.assertEqual(payload["data"]["transfer_id"], transfer.id)
        self.assertEqual(len(payload["data"]["lines"]), 1)
    
    def test_build_count_finalized_event(self):
        """Test building count_finalized event payload"""
        count_session = CountSession.objects.create(
            tenant=self.tenant,
            store=self.store,
            status="FINALIZED",
            finalized_at=timezone.now(),
            created_by=self.user,
        )
        CountLine.objects.create(
            session=count_session,
            variant=self.variant,
            expected_qty=100,
            counted_qty=95,
        )
        
        payload = build_count_finalized_event(
            tenant=self.tenant,
            count_session=count_session,
            user=self.user,
        )
        
        self.assertEqual(payload["event"], "inventory.count_finalized")
        self.assertEqual(payload["data"]["count_session_id"], count_session.id)
        self.assertEqual(len(payload["data"]["lines"]), 1)
        self.assertEqual(payload["data"]["lines"][0]["variance"], -5)


class WebhookSignalTests(WebhookTestBase):
    """Tests for webhook signals"""
    
    @patch('webhooks.services.publish_webhook_event')
    def test_stock_ledger_signal(self, mock_publish):
        """Test that StockLedger creation triggers webhook"""
        # Create subscription
        WebhookSubscription.objects.create(
            tenant=self.tenant,
            url="https://example.com/webhook",
            event_types=["inventory.stock_changed"],
        )
        
        # Create stock ledger entry (should trigger signal)
        StockLedger.objects.create(
            tenant=self.tenant,
            store=self.store,
            variant=self.variant,
            qty_delta=-10,
            balance_after=90,
            ref_type="SALE",
            ref_id=123,
            created_by=self.user,
        )
        
        # Check webhook was published
        self.assertTrue(mock_publish.called)
        call_args = mock_publish.call_args
        self.assertEqual(call_args[0][0], self.tenant)
        self.assertEqual(call_args[0][1], "inventory.stock_changed")
