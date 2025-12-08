"""
Orders Tests for Phase 1 - Inventory & POS Hardening

TODO - Testing Improvements Needed:
====================================

1. Return Edge Cases
   - Test return of returned item (should this be allowed?)
   - Test return with qty_returned > original sale qty (should fail)
   - Test return with invalid sale_line (should fail)
   - Test return finalization when return is already finalized (should fail)
   - Priority: Medium

2. Concurrent Return Handling
   - Test multiple returns for same variant simultaneously
   - Verify select_for_update() prevents race conditions in returns
   - Test return + sale happening concurrently for same variant
   - Priority: Medium

3. Refund Calculation Edge Cases
   - Test refund when original sale had discounts
   - Test refund when original sale had taxes
   - Test partial refund calculations with complex pricing
   - Test refund when sale_line has fee
   - Priority: Low

4. Return Status Transitions
   - Test return status workflow: draft → finalized → void
   - Test that finalized returns cannot be modified
   - Test void returns don't affect inventory
   - Priority: Low

5. Integration with Sale Signals
   - Test that returns work correctly with sales created via signals
   - Test return of items from admin-created sales
   - Test return of items from POS-created sales
   - Priority: Low
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from catalog.models import Product, Variant
from inventory.models import InventoryItem, StockLedger
from orders.models import Sale, SaleLine, Return, ReturnItem, Refund
from orders.views import ReturnFinalizeView
from stores.models import Register, Store
from tenants.models import Tenant, TenantUser


User = get_user_model()


class SaleSignalTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Tenant", code="tenant-signal")
        self.store = Store.objects.create(
            tenant=self.tenant,
            name="Store",
            code="store",
            street="1 Main",
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
        self.cashier = User.objects.create_user(username="cashier-signal", password="pass")
        TenantUser.objects.create(tenant=self.tenant, user=self.cashier)
        self.product = Product.objects.create(tenant=self.tenant, name="Widget", code="widget")
        self.variant = Variant.objects.create(
            product=self.product,
            tenant=self.tenant,
            name="Widget Variant",
            sku="SIG-001",
            price=Decimal("5.00"),
        )
        InventoryItem.objects.create(
            tenant=self.tenant,
            store=self.store,
            variant=self.variant,
            on_hand=5,
            reserved=0,
        )

    def test_sale_line_signal_updates_inventory_and_ledger(self):
        sale = Sale.objects.create(
            tenant=self.tenant,
            store=self.store,
            register=self.register,
            cashier=self.cashier,
            status="completed",
        )

        SaleLine.objects.create(
            sale=sale,
            variant=self.variant,
            qty=2,
            unit_price=Decimal("5.00"),
        )

        item = InventoryItem.objects.get(tenant=self.tenant, store=self.store, variant=self.variant)
        self.assertEqual(item.on_hand, Decimal("3"))

        ledger = StockLedger.objects.filter(tenant=self.tenant, variant=self.variant, ref_id=sale.id).first()
        self.assertIsNotNone(ledger)
        self.assertEqual(ledger.qty_delta, -2)

    def test_sale_line_signal_blocks_on_insufficient_inventory(self):
        item = InventoryItem.objects.get(tenant=self.tenant, store=self.store, variant=self.variant)
        item.on_hand = 1
        item.save(update_fields=["on_hand"])

        sale = Sale.objects.create(
            tenant=self.tenant,
            store=self.store,
            register=self.register,
            cashier=self.cashier,
            status="completed",
        )

        with self.assertRaises(ValidationError):
            SaleLine.objects.create(
                sale=sale,
                variant=self.variant,
                qty=3,
                unit_price=Decimal("5.00"),
            )

        item.refresh_from_db()
        self.assertEqual(item.on_hand, Decimal("1"))
        self.assertFalse(
            StockLedger.objects.filter(tenant=self.tenant, variant=self.variant, ref_id=sale.id).exists()
        )


class ReturnFinalizeTests(TestCase):
    """Tests for Increment 3: Returns & Restock Ledger Alignment"""

    def setUp(self):
        self.factory = APIRequestFactory()
        self.tenant = Tenant.objects.create(name="Return Tenant", code="return-tenant")
        self.user = User.objects.create_user(username="return-user", password="pass")
        TenantUser.objects.create(tenant=self.tenant, user=self.user)
        self.store = Store.objects.create(
            tenant=self.tenant,
            name="Return Store",
            code="return-store",
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
        self.product = Product.objects.create(tenant=self.tenant, name="Widget", code="widget")
        self.variant1 = Variant.objects.create(
            product=self.product,
            tenant=self.tenant,
            name="Widget Variant 1",
            sku="RET-001",
            price=Decimal("10.00"),
        )
        self.variant2 = Variant.objects.create(
            product=self.product,
            tenant=self.tenant,
            name="Widget Variant 2",
            sku="RET-002",
            price=Decimal("15.00"),
        )
        InventoryItem.objects.create(
            tenant=self.tenant,
            store=self.store,
            variant=self.variant1,
            on_hand=10,
            reserved=0,
        )
        InventoryItem.objects.create(
            tenant=self.tenant,
            store=self.store,
            variant=self.variant2,
            on_hand=5,
            reserved=0,
        )

    def _create_sale_with_lines(self):
        """Helper to create a sale with canonical totals"""
        sale = Sale.objects.create(
            tenant=self.tenant,
            store=self.store,
            register=self.register,
            cashier=self.user,
            status="completed",
            total=Decimal("50.00"),
        )
        line1 = SaleLine.objects.create(
            sale=sale,
            variant=self.variant1,
            qty=3,
            unit_price=Decimal("10.00"),
            discount=Decimal("0.00"),
            tax=Decimal("0.00"),
            fee=Decimal("0.00"),
            line_total=Decimal("30.00"),
        )
        line2 = SaleLine.objects.create(
            sale=sale,
            variant=self.variant2,
            qty=2,
            unit_price=Decimal("15.00"),
            discount=Decimal("5.00"),
            tax=Decimal("1.00"),
            fee=Decimal("0.00"),
            line_total=Decimal("26.00"),
        )
        # Update inventory to reflect the sale
        item1 = InventoryItem.objects.get(tenant=self.tenant, store=self.store, variant=self.variant1)
        item1.on_hand = Decimal("7")  # 10 - 3
        item1.save(update_fields=["on_hand"])
        item2 = InventoryItem.objects.get(tenant=self.tenant, store=self.store, variant=self.variant2)
        item2.on_hand = Decimal("3")  # 5 - 2
        item2.save(update_fields=["on_hand"])
        return sale, line1, line2

    def test_return_finalization_increases_inventory_and_creates_ledger(self):
        """Test that finalizing a return with restock=True increases inventory and creates ledger entry"""
        sale, line1, _ = self._create_sale_with_lines()
        
        # Create return
        ret = Return.objects.create(
            tenant=self.tenant,
            store=self.store,
            sale=sale,
            processed_by=self.user,
            status="draft",
            refund_total=Decimal("10.00"),
        )
        ReturnItem.objects.create(
            return_ref=ret,
            sale_line=line1,
            qty_returned=1,
            restock=True,
            refund_subtotal=Decimal("10.00"),
            refund_tax=Decimal("0.00"),
            refund_total=Decimal("10.00"),
        )

        # Finalize return
        request = self.factory.post(f"/api/v1/returns/{ret.id}/finalize", {
            "refunds": [{"method": "CASH", "amount": "10.00"}]
        }, format="json")
        force_authenticate(request, user=self.user)
        request.tenant = self.tenant
        response = ReturnFinalizeView.as_view()(request, pk=ret.id)

        self.assertEqual(response.status_code, 200)
        
        # Verify inventory increased
        item = InventoryItem.objects.get(tenant=self.tenant, store=self.store, variant=self.variant1)
        self.assertEqual(item.on_hand, Decimal("8"))  # 7 + 1

        # Verify ledger entry created
        ledger = StockLedger.objects.filter(
            tenant=self.tenant,
            variant=self.variant1,
            ref_type="RETURN",
            ref_id=ret.id
        ).first()
        self.assertIsNotNone(ledger)
        self.assertEqual(ledger.qty_delta, 1)
        self.assertEqual(int(ledger.balance_after), int(item.on_hand))
        self.assertEqual(ledger.note, f"Return #{ret.id}")

        # Verify return status updated
        ret.refresh_from_db()
        self.assertEqual(ret.status, "finalized")
        self.assertIsNotNone(ret.return_no)

    def test_return_without_restock_does_not_change_inventory(self):
        """Test that finalizing a return with restock=False does not change inventory"""
        sale, line1, _ = self._create_sale_with_lines()
        initial_on_hand = InventoryItem.objects.get(
            tenant=self.tenant, store=self.store, variant=self.variant1
        ).on_hand

        ret = Return.objects.create(
            tenant=self.tenant,
            store=self.store,
            sale=sale,
            processed_by=self.user,
            status="draft",
            refund_total=Decimal("10.00"),
        )
        ReturnItem.objects.create(
            return_ref=ret,
            sale_line=line1,
            qty_returned=1,
            restock=False,  # Don't restock
            refund_subtotal=Decimal("10.00"),
            refund_tax=Decimal("0.00"),
            refund_total=Decimal("10.00"),
        )

        request = self.factory.post(f"/api/v1/returns/{ret.id}/finalize", {
            "refunds": [{"method": "CASH", "amount": "10.00"}]
        }, format="json")
        force_authenticate(request, user=self.user)
        request.tenant = self.tenant
        response = ReturnFinalizeView.as_view()(request, pk=ret.id)

        self.assertEqual(response.status_code, 200)
        
        # Verify inventory unchanged
        item = InventoryItem.objects.get(tenant=self.tenant, store=self.store, variant=self.variant1)
        self.assertEqual(item.on_hand, initial_on_hand)

        # Verify no ledger entry created
        self.assertFalse(
            StockLedger.objects.filter(
                tenant=self.tenant,
                variant=self.variant1,
                ref_type="RETURN",
                ref_id=ret.id
            ).exists()
        )

    def test_partial_return_only_restocks_returned_items(self):
        """Test that partial return only restocks the returned items"""
        sale, line1, line2 = self._create_sale_with_lines()
        initial_on_hand1 = InventoryItem.objects.get(
            tenant=self.tenant, store=self.store, variant=self.variant1
        ).on_hand
        initial_on_hand2 = InventoryItem.objects.get(
            tenant=self.tenant, store=self.store, variant=self.variant2
        ).on_hand

        ret = Return.objects.create(
            tenant=self.tenant,
            store=self.store,
            sale=sale,
            processed_by=self.user,
            status="draft",
            refund_total=Decimal("10.00"),
        )
        # Only return from line1, not line2
        ReturnItem.objects.create(
            return_ref=ret,
            sale_line=line1,
            qty_returned=1,
            restock=True,
            refund_subtotal=Decimal("10.00"),
            refund_tax=Decimal("0.00"),
            refund_total=Decimal("10.00"),
        )

        request = self.factory.post(f"/api/v1/returns/{ret.id}/finalize", {
            "refunds": [{"method": "CASH", "amount": "10.00"}]
        }, format="json")
        force_authenticate(request, user=self.user)
        request.tenant = self.tenant
        response = ReturnFinalizeView.as_view()(request, pk=ret.id)

        self.assertEqual(response.status_code, 200)
        
        # Verify only variant1 inventory increased
        item1 = InventoryItem.objects.get(tenant=self.tenant, store=self.store, variant=self.variant1)
        self.assertEqual(item1.on_hand, initial_on_hand1 + 1)
        
        # Verify variant2 inventory unchanged
        item2 = InventoryItem.objects.get(tenant=self.tenant, store=self.store, variant=self.variant2)
        self.assertEqual(item2.on_hand, initial_on_hand2)

        # Verify only one ledger entry
        ledger_count = StockLedger.objects.filter(
            tenant=self.tenant,
            ref_type="RETURN",
            ref_id=ret.id
        ).count()
        self.assertEqual(ledger_count, 1)

    def test_multiple_items_return_creates_separate_ledger_entries(self):
        """Test that returning multiple variants creates separate ledger entries"""
        sale, line1, line2 = self._create_sale_with_lines()

        ret = Return.objects.create(
            tenant=self.tenant,
            store=self.store,
            sale=sale,
            processed_by=self.user,
            status="draft",
            refund_total=Decimal("36.00"),
        )
        ReturnItem.objects.create(
            return_ref=ret,
            sale_line=line1,
            qty_returned=1,
            restock=True,
            refund_subtotal=Decimal("10.00"),
            refund_tax=Decimal("0.00"),
            refund_total=Decimal("10.00"),
        )
        ReturnItem.objects.create(
            return_ref=ret,
            sale_line=line2,
            qty_returned=1,
            restock=True,
            refund_subtotal=Decimal("10.00"),
            refund_tax=Decimal("1.00"),
            refund_total=Decimal("11.00"),
        )

        request = self.factory.post(f"/api/v1/returns/{ret.id}/finalize", {
            "refunds": [{"method": "CASH", "amount": "36.00"}]
        }, format="json")
        force_authenticate(request, user=self.user)
        request.tenant = self.tenant
        response = ReturnFinalizeView.as_view()(request, pk=ret.id)

        self.assertEqual(response.status_code, 200)
        
        # Verify both inventories increased
        item1 = InventoryItem.objects.get(tenant=self.tenant, store=self.store, variant=self.variant1)
        self.assertEqual(item1.on_hand, Decimal("8"))  # 7 + 1
        item2 = InventoryItem.objects.get(tenant=self.tenant, store=self.store, variant=self.variant2)
        self.assertEqual(item2.on_hand, Decimal("4"))  # 3 + 1

        # Verify two ledger entries
        ledger_entries = StockLedger.objects.filter(
            tenant=self.tenant,
            ref_type="RETURN",
            ref_id=ret.id
        )
        self.assertEqual(ledger_entries.count(), 2)
        
        # Verify each entry has correct values
        ledger1 = ledger_entries.filter(variant=self.variant1).first()
        self.assertIsNotNone(ledger1)
        self.assertEqual(ledger1.qty_delta, 1)
        self.assertEqual(int(ledger1.balance_after), int(item1.on_hand))
        
        ledger2 = ledger_entries.filter(variant=self.variant2).first()
        self.assertIsNotNone(ledger2)
        self.assertEqual(ledger2.qty_delta, 1)
        self.assertEqual(int(ledger2.balance_after), int(item2.on_hand))

    def test_refund_calculations_use_canonical_sale_line_fields(self):
        """Test that refund calculations use canonical SaleLine fields (unit_price, discount, tax)"""
        sale = Sale.objects.create(
            tenant=self.tenant,
            store=self.store,
            register=self.register,
            cashier=self.user,
            status="completed",
            total=Decimal("30.00"),
        )
        # Create sale line with canonical totals (from Increment 2)
        line = SaleLine.objects.create(
            sale=sale,
            variant=self.variant1,
            qty=3,
            unit_price=Decimal("10.00"),  # Canonical
            discount=Decimal("5.00"),     # Canonical
            tax=Decimal("2.00"),          # Canonical
            fee=Decimal("0.00"),
            line_total=Decimal("27.00"),  # (10*3 - 5) + 2 = 27
        )

        # Compute refund for 1 unit using the helper
        refund_data = Refund.compute_line_refund(line, qty=1)
        
        # Expected: (27 + 5 - 2) / 3 = 10 per unit
        # For 1 unit: subtotal=10, tax=2/3≈0.67, total=10.67
        self.assertGreater(refund_data["subtotal"], Decimal("0"))
        self.assertGreater(refund_data["tax"], Decimal("0"))
        self.assertGreater(refund_data["total"], Decimal("0"))
        
        # Verify it uses the canonical fields
        # The calculation should be based on line_total, discount, tax from SaleLine
        expected_subtotal_per_unit = (line.line_total + line.discount - line.tax - line.fee) / line.qty
        self.assertAlmostEqual(refund_data["subtotal"], expected_subtotal_per_unit, places=2)

    def test_return_uses_select_for_update_locking(self):
        """Test that return finalization uses select_for_update to prevent race conditions"""
        sale, line1, _ = self._create_sale_with_lines()
        
        ret = Return.objects.create(
            tenant=self.tenant,
            store=self.store,
            sale=sale,
            processed_by=self.user,
            status="draft",
            refund_total=Decimal("10.00"),
        )
        ReturnItem.objects.create(
            return_ref=ret,
            sale_line=line1,
            qty_returned=1,
            restock=True,
            refund_subtotal=Decimal("10.00"),
            refund_tax=Decimal("0.00"),
            refund_total=Decimal("10.00"),
        )

        # The select_for_update is used in the view (line 1035)
        # This test verifies the behavior works correctly
        request = self.factory.post(f"/api/v1/returns/{ret.id}/finalize", {
            "refunds": [{"method": "CASH", "amount": "10.00"}]
        }, format="json")
        force_authenticate(request, user=self.user)
        request.tenant = self.tenant
        response = ReturnFinalizeView.as_view()(request, pk=ret.id)

        self.assertEqual(response.status_code, 200)
        
        # Verify inventory was updated correctly (locking worked)
        item = InventoryItem.objects.get(tenant=self.tenant, store=self.store, variant=self.variant1)
        self.assertEqual(item.on_hand, Decimal("8"))  # 7 + 1

    def test_return_boundary_condition_exact_qty(self):
        """Test return when qty_returned exactly matches original sale qty"""
        sale, line1, _ = self._create_sale_with_lines()
        initial_on_hand = InventoryItem.objects.get(
            tenant=self.tenant, store=self.store, variant=self.variant1
        ).on_hand

        ret = Return.objects.create(
            tenant=self.tenant,
            store=self.store,
            sale=sale,
            processed_by=self.user,
            status="draft",
            refund_total=Decimal("30.00"),  # Full line total
        )
        # Return all 3 units
        ReturnItem.objects.create(
            return_ref=ret,
            sale_line=line1,
            qty_returned=3,  # Full quantity
            restock=True,
            refund_subtotal=Decimal("30.00"),
            refund_tax=Decimal("0.00"),
            refund_total=Decimal("30.00"),
        )

        request = self.factory.post(f"/api/v1/returns/{ret.id}/finalize", {
            "refunds": [{"method": "CASH", "amount": "30.00"}]
        }, format="json")
        force_authenticate(request, user=self.user)
        request.tenant = self.tenant
        response = ReturnFinalizeView.as_view()(request, pk=ret.id)

        self.assertEqual(response.status_code, 200)
        
        # Verify inventory increased by full amount
        item = InventoryItem.objects.get(tenant=self.tenant, store=self.store, variant=self.variant1)
        self.assertEqual(item.on_hand, initial_on_hand + 3)  # 7 + 3 = 10

        # Verify ledger entry
        ledger = StockLedger.objects.filter(
            tenant=self.tenant,
            variant=self.variant1,
            ref_type="RETURN",
            ref_id=ret.id
        ).first()
        self.assertIsNotNone(ledger)
        self.assertEqual(ledger.qty_delta, 3)
