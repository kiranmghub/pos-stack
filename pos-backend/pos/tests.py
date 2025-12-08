"""
POS Tests for Phase 1 - Inventory & POS Hardening

TODO - Testing Improvements Needed:
====================================

1. Concurrent Checkout Race Condition Test
   - Current: test_concurrent_checkout_prevents_race_conditions() fails due to payment validation
   - Need: Lower-level ORM test or refactored checkout flow to test select_for_update() properly
   - Priority: Medium (mechanism is implemented, just needs proper test)

2. Edge Cases for Checkout
   - Test checkout with qty=0 (should fail validation)
   - Test checkout with negative qty (should fail validation)
   - Test checkout when on_hand exactly equals qty (boundary condition)
   - Test checkout with very large quantities
   - Priority: Low

3. Complex Discount/Tax Scenarios
   - Test multiple stacked discounts
   - Test receipt-level discounts with line-level discounts
   - Test complex tax calculations with multiple rules
   - Test coupon discounts with other discounts
   - Priority: Medium

4. Performance Testing
   - Test large checkout (100+ line items)
   - Test rapid successive checkouts
   - Test ledger query performance with many entries
   - Priority: Low

5. Integration Tests
   - End-to-end: Quote → Checkout → Return flow
   - Test consistency across all three operations
   - Test low stock → sale → low stock badge update
   - Priority: Medium
"""

from decimal import Decimal
import threading
import time

from django.contrib.auth import get_user_model
from django.db import transaction
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from catalog.models import Product, Variant
from inventory.models import InventoryItem, StockLedger
from orders.models import Sale, SaleLine
from pos.views import POSCheckoutView, POSQuoteView
from pos.tokens import encode_register_token
from stores.models import Store, Register, RegisterSession
from tenants.models import Tenant, TenantUser


User = get_user_model()


class POSCheckoutViewTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.tenant = Tenant.objects.create(
            name="Test Tenant",
            code="tenant-pos",
            currency_code="USD",
        )
        self.user = User.objects.create_user(username="cashier", password="pass")
        TenantUser.objects.create(tenant=self.tenant, user=self.user)
        self.store = Store.objects.create(
            tenant=self.tenant,
            name="Store 1",
            code="store-1",
            street="1 Main St",
            city="City",
            state="State",
            postal_code="00000",
            country="USA",
        )
        self.register = Register.objects.create(
            store=self.store,
            tenant=self.tenant,
            name="Front",
            code="reg-1",
        )
        self.product = Product.objects.create(
            tenant=self.tenant,
            name="Widget",
            code="widget",
        )
        self.variant = Variant.objects.create(
            product=self.product,
            tenant=self.tenant,
            name="Widget Variant",
            sku="WID-001",
            price=Decimal("10.00"),
        )
        InventoryItem.objects.create(
            tenant=self.tenant,
            store=self.store,
            variant=self.variant,
            on_hand=10,
            reserved=0,
        )
        # Create a register session for tests
        self.register_session = RegisterSession.objects.create(
            tenant=self.tenant,
            register=self.register,
            expires_at=timezone.now() + timezone.timedelta(hours=8),
            created_by_user=self.user,
        )
        self.register_token = encode_register_token(
            tenant_id=self.tenant.id,
            register_id=self.register.id,
            session_id=str(self.register_session.id),
        )

    def _checkout(self, qty):
        payload = {
            "store_id": self.store.id,
            "register_id": self.register.id,
            "lines": [
                {"variant_id": self.variant.id, "qty": qty, "unit_price": "10.00"},
            ],
            "payment": {"type": "CASH", "amount": "10.00", "received": "20.00"},
        }
        request = self.factory.post("/api/v1/pos/checkout", payload, format="json")
        force_authenticate(request, user=self.user)
        request.tenant = self.tenant
        request.META["HTTP_AUTHORIZATION"] = f"Register {self.register_token}"
        return POSCheckoutView.as_view()(request)

    def test_checkout_decrements_inventory_and_writes_ledger(self):
        response = self._checkout(qty=2)
        self.assertEqual(response.status_code, 201)

        item = InventoryItem.objects.get(tenant=self.tenant, store=self.store, variant=self.variant)
        self.assertEqual(item.on_hand, Decimal("8"))

        ledger = StockLedger.objects.filter(tenant=self.tenant, variant=self.variant, ref_type="SALE").first()
        self.assertIsNotNone(ledger)
        self.assertEqual(ledger.qty_delta, -2)
        self.assertEqual(int(ledger.balance_after), int(item.on_hand))

        sale = Sale.objects.get(store=self.store)
        line = sale.lines.get()
        self.assertEqual(line.unit_price, Decimal("10.00"))
        self.assertEqual(line.discount, Decimal("0.00"))
        self.assertEqual(line.tax, Decimal("0.00"))
        self.assertEqual(line.line_total, Decimal("20.00"))

    def test_checkout_fails_when_stock_insufficient(self):
        item = InventoryItem.objects.get(tenant=self.tenant, store=self.store, variant=self.variant)
        item.on_hand = 1
        item.save(update_fields=["on_hand"])

        response = self._checkout(qty=5)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(Sale.objects.count(), 0)
        self.assertFalse(
            StockLedger.objects.filter(tenant=self.tenant, variant=self.variant, ref_type="SALE").exists()
        )

    def test_multi_line_checkout_creates_ledger_entries_for_each_variant(self):
        """Test that checkout with multiple variants creates separate ledger entries"""
        variant2 = Variant.objects.create(
            product=self.product,
            tenant=self.tenant,
            name="Widget Variant 2",
            sku="WID-002",
            price=Decimal("15.00"),
        )
        InventoryItem.objects.create(
            tenant=self.tenant,
            store=self.store,
            variant=variant2,
            on_hand=5,
            reserved=0,
        )

        payload = {
            "store_id": self.store.id,
            "register_id": self.register.id,
            "lines": [
                {"variant_id": self.variant.id, "qty": 2, "unit_price": "10.00"},
                {"variant_id": variant2.id, "qty": 1, "unit_price": "15.00"},
            ],
            "payment": {"type": "CASH", "amount": "35.00", "received": "50.00"},
        }
        request = self.factory.post("/api/v1/pos/checkout", payload, format="json")
        force_authenticate(request, user=self.user)
        request.tenant = self.tenant
        response = POSCheckoutView.as_view()(request)

        self.assertEqual(response.status_code, 201)

        # Verify both inventories decreased
        item1 = InventoryItem.objects.get(tenant=self.tenant, store=self.store, variant=self.variant)
        self.assertEqual(item1.on_hand, Decimal("8"))  # 10 - 2
        item2 = InventoryItem.objects.get(tenant=self.tenant, store=self.store, variant=variant2)
        self.assertEqual(item2.on_hand, Decimal("4"))  # 5 - 1

        # Verify two ledger entries
        sale = Sale.objects.get(store=self.store)
        ledger_entries = StockLedger.objects.filter(
            tenant=self.tenant,
            ref_type="SALE",
            ref_id=sale.id
        )
        self.assertEqual(ledger_entries.count(), 2)

        # Verify each entry has correct values
        ledger1 = ledger_entries.filter(variant=self.variant).first()
        self.assertIsNotNone(ledger1)
        self.assertEqual(ledger1.qty_delta, -2)
        self.assertEqual(int(ledger1.balance_after), int(item1.on_hand))
        self.assertEqual(ledger1.created_by, self.user)

        ledger2 = ledger_entries.filter(variant=variant2).first()
        self.assertIsNotNone(ledger2)
        self.assertEqual(ledger2.qty_delta, -1)
        self.assertEqual(int(ledger2.balance_after), int(item2.on_hand))

    def test_ledger_entry_completeness(self):
        """Test that ledger entries have all required fields correctly set"""
        payload = {
            "store_id": self.store.id,
            "register_id": self.register.id,
            "lines": [
                {"variant_id": self.variant.id, "qty": 3, "unit_price": "10.00"},
            ],
            "payment": {"type": "CASH", "amount": "30.00", "received": "50.00"},
        }
        request = self.factory.post("/api/v1/pos/checkout", payload, format="json")
        force_authenticate(request, user=self.user)
        request.tenant = self.tenant
        response = POSCheckoutView.as_view()(request)

        self.assertEqual(response.status_code, 201)

        sale = Sale.objects.get(store=self.store)
        ledger = StockLedger.objects.filter(
            tenant=self.tenant,
            variant=self.variant,
            ref_type="SALE"
        ).first()

        self.assertIsNotNone(ledger)
        self.assertEqual(ledger.ref_type, "SALE")
        self.assertEqual(ledger.ref_id, sale.id)
        self.assertEqual(ledger.qty_delta, -3)
        self.assertIsNotNone(ledger.balance_after)
        self.assertIn("sale", ledger.note.lower())
        self.assertEqual(ledger.created_by, self.user)
        self.assertEqual(ledger.tenant, self.tenant)
        self.assertEqual(ledger.store, self.store)
        self.assertEqual(ledger.variant, self.variant)

    def test_concurrent_checkout_prevents_race_conditions(self):
        """
        Test that concurrent checkouts for same variant are handled correctly with select_for_update.
        
        TODO: This test currently fails because payment validation happens before inventory checks,
        causing both concurrent requests to fail validation (400) before testing the race condition.
        
        To properly test this, we need one of the following approaches:
        1. Create a lower-level unit test that directly tests select_for_update() with threading
           at the ORM level (bypassing API validation)
        2. Modify the checkout flow to separate payment validation from inventory checks
        3. Use database-level testing tools or mocking to simulate concurrent access
        
        The select_for_update() mechanism is already implemented in pos/views.py (~line 450-460)
        and is tested indirectly through other checkout tests. This test verifies the concept
        but needs refinement to properly test concurrency.
        """
        # Set up initial stock
        item = InventoryItem.objects.get(tenant=self.tenant, store=self.store, variant=self.variant)
        item.on_hand = 5
        item.save(update_fields=["on_hand"])

        results = []
        errors = []
        lock = threading.Lock()

        def checkout_worker(qty, worker_id):
            """Worker function to perform checkout"""
            try:
                # Add small delay to increase chance of race condition
                time.sleep(0.01 * worker_id)
                
                # Use a large payment amount to avoid validation issues
                # The key test is inventory locking, not payment validation
                payload = {
                    "store_id": self.store.id,
                    "register_id": self.register.id,
                    "lines": [
                        {"variant_id": self.variant.id, "qty": qty, "unit_price": "10.00"},
                    ],
                    "payment": {"type": "CASH", "amount": "100.00", "received": "100.00"},
                }
                request = self.factory.post("/api/v1/pos/checkout", payload, format="json")
                force_authenticate(request, user=self.user)
                request.tenant = self.tenant
                response = POSCheckoutView.as_view()(request)
                
                with lock:
                    error_detail = None
                    if hasattr(response, 'data') and isinstance(response.data, dict):
                        error_detail = response.data.get('detail', '')
                    results.append((qty, response.status_code, error_detail))
            except Exception as e:
                with lock:
                    errors.append((qty, str(e)))

        # Start two concurrent checkouts: one for 3 units, one for 3 units (total 6, but only 5 available)
        thread1 = threading.Thread(target=checkout_worker, args=(3, 1))
        thread2 = threading.Thread(target=checkout_worker, args=(3, 2))

        thread1.start()
        thread2.start()

        thread1.join()
        thread2.join()

        # Verify results: we got responses from both threads
        self.assertEqual(len(results), 2, f"Expected 2 results, got {results}")
        status_codes = [r[1] for r in results]
        
        # The key test: only one sale should be created (race condition prevention)
        # This proves that select_for_update() is working correctly
        sale_count = Sale.objects.count()
        self.assertEqual(sale_count, 1, 
            f"Expected exactly 1 sale (race condition prevention), got {sale_count}. Status codes: {status_codes}")
        
        # Verify final inventory is correct (should be 2, since one checkout of 3 succeeded: 5 - 3 = 2)
        item.refresh_from_db()
        self.assertEqual(item.on_hand, Decimal("2"), 
            f"Expected inventory to be 2, got {item.on_hand}. Status codes: {status_codes}")

        # Verify only one ledger entry was created
        ledger_count = StockLedger.objects.filter(
            tenant=self.tenant,
            variant=self.variant,
            ref_type="SALE"
        ).count()
        self.assertEqual(ledger_count, 1, 
            f"Expected exactly 1 ledger entry, got {ledger_count}. Status codes: {status_codes}")
        
        # At least one should succeed (201) - the one that got the lock first
        # The other should fail (409 for insufficient stock)
        self.assertIn(201, status_codes, 
            f"Expected at least one 201 (successful checkout), got {status_codes}")
        self.assertIn(409, status_codes, 
            f"Expected at least one 409 (insufficient stock), got {status_codes}")


class POSCanonicalTotalsTests(TestCase):
    """Tests for Increment 2: Canonical Totals & SaleLine Fields"""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.tenant = Tenant.objects.create(
            name="Totals Tenant",
            code="totals-tenant",
            currency_code="USD",
        )
        self.user = User.objects.create_user(username="totals-user", password="pass")
        TenantUser.objects.create(tenant=self.tenant, user=self.user)
        self.store = Store.objects.create(
            tenant=self.tenant,
            name="Totals Store",
            code="totals-store",
            street="1 Main St",
            city="City",
            state="State",
            postal_code="00000",
            country="USA",
        )
        self.register = Register.objects.create(
            store=self.store,
            tenant=self.tenant,
            name="Reg",
            code="reg",
        )
        self.product = Product.objects.create(
            tenant=self.tenant,
            name="Widget",
            code="widget",
        )
        self.variant = Variant.objects.create(
            product=self.product,
            tenant=self.tenant,
            name="Widget Variant",
            sku="TOT-001",
            price=Decimal("10.00"),
        )
        InventoryItem.objects.create(
            tenant=self.tenant,
            store=self.store,
            variant=self.variant,
            on_hand=10,
            reserved=0,
        )
        # Create a register session for tests
        self.register_session = RegisterSession.objects.create(
            tenant=self.tenant,
            register=self.register,
            expires_at=timezone.now() + timezone.timedelta(hours=8),
            created_by_user=self.user,
        )
        self.register_token = encode_register_token(
            tenant_id=self.tenant.id,
            register_id=self.register.id,
            session_id=str(self.register_session.id),
        )

    def _quote(self, lines):
        """Helper to get quote"""
        payload = {
            "store_id": self.store.id,
            "lines": lines,
        }
        request = self.factory.post("/api/v1/pos/quote", payload, format="json")
        force_authenticate(request, user=self.user)
        request.tenant = self.tenant
        request.META["HTTP_AUTHORIZATION"] = f"Register {self.register_token}"
        return POSQuoteView.as_view()(request)

    def _checkout(self, lines, payment_amount=None):
        """Helper to checkout"""
        if payment_amount is None:
            payment_amount = str(sum(Decimal(l["unit_price"]) * l["qty"] for l in lines))
        payload = {
            "store_id": self.store.id,
            "register_id": self.register.id,
            "lines": lines,
            "payment": {"type": "CASH", "amount": payment_amount, "received": str(Decimal(payment_amount) + 10)},
        }
        request = self.factory.post("/api/v1/pos/checkout", payload, format="json")
        force_authenticate(request, user=self.user)
        request.tenant = self.tenant
        request.META["HTTP_AUTHORIZATION"] = f"Register {self.register_token}"
        return POSCheckoutView.as_view()(request)

    def test_quote_and_checkout_totals_match(self):
        """Test that quote totals exactly match persisted sale totals"""
        lines = [
            {"variant_id": self.variant.id, "qty": 2, "unit_price": "10.00"},
        ]

        # Get quote
        quote_response = self._quote(lines)
        self.assertEqual(quote_response.status_code, 200)
        quote_data = quote_response.data["quote"]

        # Perform checkout
        checkout_response = self._checkout(lines, payment_amount=quote_data["grand_total"])
        self.assertEqual(checkout_response.status_code, 201)

        # Get persisted sale
        sale = Sale.objects.get(store=self.store)
        sale_line = sale.lines.get()

        # Verify Sale.total matches quote grand_total
        self.assertEqual(Decimal(str(sale.total)), Decimal(quote_data["grand_total"]))

        # Verify SaleLine fields match quote line values
        quote_line = quote_data["lines"][0]
        self.assertEqual(sale_line.unit_price, Decimal(quote_line["unit_price"]))
        self.assertEqual(sale_line.discount, Decimal(quote_line["line_discount"]))
        # Tax is sum of all taxes in quote_line["taxes"]
        quote_tax_total = sum(Decimal(t["amount"]) for t in quote_line.get("taxes", []))
        self.assertEqual(sale_line.tax, quote_tax_total)
        # line_total should match (line_net + tax + fee)
        expected_line_total = Decimal(quote_line["line_net"]) + quote_tax_total + Decimal(sale_line.fee or 0)
        self.assertEqual(sale_line.line_total, expected_line_total)

    def test_receipt_data_contains_canonical_totals(self):
        """Test that receipt_data JSON contains all canonical totals"""
        lines = [
            {"variant_id": self.variant.id, "qty": 2, "unit_price": "10.00"},
        ]

        quote_response = self._quote(lines)
        quote_data = quote_response.data["quote"]

        checkout_response = self._checkout(lines, payment_amount=quote_data["grand_total"])
        self.assertEqual(checkout_response.status_code, 201)

        sale = Sale.objects.get(store=self.store)
        self.assertIsNotNone(sale.receipt_data)
        receipt = sale.receipt_data

        # Verify receipt totals match quote
        self.assertEqual(Decimal(receipt["totals"]["subtotal"]), Decimal(quote_data["subtotal"]))
        self.assertEqual(Decimal(receipt["totals"]["discount"]), Decimal(quote_data["discount_total"]))
        self.assertEqual(Decimal(receipt["totals"]["tax"]), Decimal(quote_data["tax_total"]))
        self.assertEqual(Decimal(receipt["totals"]["grand_total"]), Decimal(quote_data["grand_total"]))

        # Verify tax_by_rule and discount_by_rule are present
        self.assertIn("tax_by_rule", receipt["totals"])
        self.assertIn("discount_by_rule", receipt["totals"])

    def test_sale_line_fields_persist_canonical_values(self):
        """Test that SaleLine fields are persisted with canonical values from compute_receipt"""
        lines = [
            {"variant_id": self.variant.id, "qty": 3, "unit_price": "10.00"},
        ]

        checkout_response = self._checkout(lines)
        self.assertEqual(checkout_response.status_code, 201)

        sale = Sale.objects.get(store=self.store)
        sale_line = sale.lines.get()

        # Verify all canonical fields are set
        self.assertIsNotNone(sale_line.unit_price)
        self.assertIsNotNone(sale_line.discount)
        self.assertIsNotNone(sale_line.tax)
        self.assertIsNotNone(sale_line.line_total)

        # Verify line_total = (unit_price * qty - discount) + tax + fee
        expected_net = (sale_line.unit_price * sale_line.qty) - sale_line.discount
        expected_total = expected_net + sale_line.tax + (sale_line.fee or Decimal("0"))
        self.assertEqual(sale_line.line_total, expected_total)

    def test_client_provided_totals_are_ignored(self):
        """Test that client-provided discount/tax/total values are ignored"""
        lines = [
            {
                "variant_id": self.variant.id,
                "qty": 2,
                "unit_price": "10.00",
                # These should be ignored
                "discount": "999.00",
                "tax": "999.00",
                "line_total": "999.00",
            },
        ]

        checkout_response = self._checkout(lines)
        self.assertEqual(checkout_response.status_code, 201)

        sale = Sale.objects.get(store=self.store)
        sale_line = sale.lines.get()

        # Verify values are computed, not the client-provided ones
        self.assertNotEqual(sale_line.discount, Decimal("999.00"))
        self.assertNotEqual(sale_line.tax, Decimal("999.00"))
        self.assertNotEqual(sale_line.line_total, Decimal("999.00"))

        # Verify they match computed values (should be 0 discount, 0 tax for simple case)
        self.assertEqual(sale_line.discount, Decimal("0.00"))
        # Tax might be 0 or calculated based on tax rules, but not 999
        self.assertNotEqual(sale_line.tax, Decimal("999.00"))


class POSRegisterSessionEnforcementTests(TestCase):
    """Tests for Increment 6: Register Session + Store Access Enforcement"""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.tenant = Tenant.objects.create(
            name="Register Test Tenant",
            code="register-test",
            currency_code="USD",
        )
        self.user = User.objects.create_user(username="register-user", password="pass")
        self.tenant_user = TenantUser.objects.create(tenant=self.tenant, user=self.user)
        self.store1 = Store.objects.create(
            tenant=self.tenant,
            name="Store 1",
            code="store-1",
            street="1 Main St",
            city="City",
            state="State",
            postal_code="00000",
            country="USA",
        )
        self.store2 = Store.objects.create(
            tenant=self.tenant,
            name="Store 2",
            code="store-2",
            street="2 Main St",
            city="City",
            state="State",
            postal_code="00000",
            country="USA",
        )
        self.register1 = Register.objects.create(
            store=self.store1,
            tenant=self.tenant,
            name="Reg 1",
            code="reg-1",
        )
        self.register2 = Register.objects.create(
            store=self.store2,
            tenant=self.tenant,
            name="Reg 2",
            code="reg-2",
        )
        self.product = Product.objects.create(
            tenant=self.tenant,
            name="Widget",
            code="widget",
        )
        self.variant = Variant.objects.create(
            product=self.product,
            tenant=self.tenant,
            name="Widget Variant",
            sku="REG-001",
            price=Decimal("10.00"),
        )
        InventoryItem.objects.create(
            tenant=self.tenant,
            store=self.store1,
            variant=self.variant,
            on_hand=10,
            reserved=0,
        )

    def _create_register_session(self, register):
        """Helper to create an active register session"""
        session = RegisterSession.objects.create(
            tenant=self.tenant,
            register=register,
            expires_at=timezone.now() + timezone.timedelta(hours=8),
            created_by_user=self.user,
        )
        token = encode_register_token(
            tenant_id=self.tenant.id,
            register_id=register.id,
            session_id=str(session.id),
        )
        return session, token

    def _checkout_request(self, store_id, register_id=None, token=None):
        """Helper to create checkout request"""
        from pos.middleware import RegisterSessionMiddleware
        
        payload = {
            "store_id": store_id,
            "register_id": register_id,
            "lines": [
                {"variant_id": self.variant.id, "qty": 1, "unit_price": "10.00"},
            ],
            "payment": {"type": "CASH", "amount": "10.00", "received": "20.00"},
        }
        request = self.factory.post("/api/v1/pos/checkout", payload, format="json")
        force_authenticate(request, user=self.user)
        request.tenant = self.tenant
        if token:
            request.META["HTTP_AUTHORIZATION"] = f"Register {token}"
            # Process middleware to set register_session_id
            middleware = RegisterSessionMiddleware(lambda req: None)
            middleware.process_request(request)
        return POSCheckoutView.as_view()(request)

    def test_checkout_requires_register_session(self):
        """Test that checkout fails without register session token"""
        response = self._checkout_request(store_id=self.store1.id, register_id=self.register1.id)
        # DRF returns 403 for permission denied, not 401
        self.assertEqual(response.status_code, 403)
        self.assertIn("register session", str(response.data.get("detail", "")).lower())

    def test_checkout_with_valid_register_session_succeeds(self):
        """Test that checkout succeeds with valid register session"""
        session, token = self._create_register_session(self.register1)
        response = self._checkout_request(
            store_id=self.store1.id,
            register_id=self.register1.id,
            token=token
        )
        self.assertEqual(response.status_code, 201)

    def test_checkout_fails_when_register_session_belongs_to_different_store(self):
        """Test that checkout fails when register session belongs to different store"""
        session, token = self._create_register_session(self.register2)  # register2 is in store2
        response = self._checkout_request(
            store_id=self.store1.id,  # trying to checkout from store1
            register_id=self.register1.id,
            token=token
        )
        self.assertEqual(response.status_code, 403)
        self.assertIn("Register session does not belong to requested store", str(response.data.get("detail", "")))

    def test_checkout_fails_when_user_has_restricted_store_access(self):
        """Test that checkout fails when user is restricted to specific stores and tries different store"""
        # Restrict user to store1 only
        self.tenant_user.stores.add(self.store1)
        
        session, token = self._create_register_session(self.register2)  # register2 is in store2
        response = self._checkout_request(
            store_id=self.store2.id,  # trying to checkout from store2
            register_id=self.register2.id,
            token=token
        )
        self.assertEqual(response.status_code, 403)
        self.assertIn("User does not have access to this store", str(response.data.get("detail", "")))

    def test_checkout_succeeds_when_user_has_access_to_store(self):
        """Test that checkout succeeds when user has access to the store"""
        # Restrict user to store1
        self.tenant_user.stores.add(self.store1)
        
        session, token = self._create_register_session(self.register1)
        response = self._checkout_request(
            store_id=self.store1.id,
            register_id=self.register1.id,
            token=token
        )
        self.assertEqual(response.status_code, 201)

    def test_checkout_succeeds_when_user_has_no_store_restrictions(self):
        """Test that checkout succeeds when user has no store restrictions (empty stores = all stores)"""
        # tenant_user.stores is empty by default, meaning access to all stores
        session, token = self._create_register_session(self.register1)
        response = self._checkout_request(
            store_id=self.store1.id,
            register_id=self.register1.id,
            token=token
        )
        self.assertEqual(response.status_code, 201)

    def test_quote_requires_register_session(self):
        """Test that quote fails without register session token"""
        from pos.middleware import RegisterSessionMiddleware
        
        payload = {
            "store_id": self.store1.id,
            "lines": [
                {"variant_id": self.variant.id, "qty": 1, "unit_price": "10.00"},
            ],
        }
        request = self.factory.post("/api/v1/pos/quote", payload, format="json")
        force_authenticate(request, user=self.user)
        request.tenant = self.tenant
        # Process middleware (will not set register_session_id since no token)
        middleware = RegisterSessionMiddleware(lambda req: None)
        middleware.process_request(request)
        response = POSQuoteView.as_view()(request)
        # DRF returns 403 for permission denied, not 401
        self.assertEqual(response.status_code, 403)

    def test_quote_with_valid_register_session_succeeds(self):
        """Test that quote succeeds with valid register session"""
        from pos.middleware import RegisterSessionMiddleware
        
        session, token = self._create_register_session(self.register1)
        payload = {
            "store_id": self.store1.id,
            "lines": [
                {"variant_id": self.variant.id, "qty": 1, "unit_price": "10.00"},
            ],
        }
        request = self.factory.post("/api/v1/pos/quote", payload, format="json")
        force_authenticate(request, user=self.user)
        request.tenant = self.tenant
        request.META["HTTP_AUTHORIZATION"] = f"Register {token}"
        # Process middleware to set register_session_id
        middleware = RegisterSessionMiddleware(lambda req: None)
        middleware.process_request(request)
        response = POSQuoteView.as_view()(request)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data.get("ok"))
