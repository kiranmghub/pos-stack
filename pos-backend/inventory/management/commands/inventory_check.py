"""
Management command to validate inventory ledger parity.

This command recomputes on_hand from StockLedger deltas and compares
against InventoryItem.on_hand to detect any mismatches.

Usage:
    python manage.py inventory_check
    python manage.py inventory_check --tenant <tenant_id>
    python manage.py inventory_check --store <store_id>
    python manage.py inventory_check --verbose

Exit codes:
    0 - All inventory items match ledger (clean)
    1 - One or more mismatches found
"""

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Sum, Q, F, Count
from django.db import transaction
from decimal import Decimal
from collections import defaultdict
from inventory.models import InventoryItem, StockLedger
from tenants.models import Tenant
from stores.models import Store


class Command(BaseCommand):
    help = "Validate inventory ledger parity by recomputing on_hand from StockLedger"

    def add_arguments(self, parser):
        parser.add_argument(
            "--tenant",
            type=int,
            help="Check inventory for a specific tenant only",
        )
        parser.add_argument(
            "--store",
            type=int,
            help="Check inventory for a specific store only",
        )
        parser.add_argument(
            "--verbose",
            action="store_true",
            help="Show detailed output for each item checked",
        )
        parser.add_argument(
            "--by-ref-type",
            action="store_true",
            help="Group ledger deltas by ref_type for analysis",
        )

    def handle(self, *args, **options):
        tenant_id = options.get("tenant")
        store_id = options.get("store")
        verbose = options.get("verbose", False)
        by_ref_type = options.get("by_ref_type", False)

        # Build queryset filters
        item_filters = {}
        ledger_filters = {}

        if tenant_id:
            item_filters["tenant_id"] = tenant_id
            ledger_filters["tenant_id"] = tenant_id
            try:
                tenant = Tenant.objects.get(id=tenant_id)
                self.stdout.write(f"Checking inventory for tenant: {tenant.name} ({tenant.code})")
            except Tenant.DoesNotExist:
                raise CommandError(f"Tenant with id {tenant_id} does not exist")

        if store_id:
            item_filters["store_id"] = store_id
            ledger_filters["store_id"] = store_id
            try:
                store = Store.objects.get(id=store_id)
                self.stdout.write(f"Checking inventory for store: {store.name} ({store.code})")
            except Store.DoesNotExist:
                raise CommandError(f"Store with id {store_id} does not exist")

        # Get all inventory items
        items = InventoryItem.objects.filter(**item_filters).select_related(
            "tenant", "store", "variant"
        )

        if not items.exists():
            self.stdout.write(self.style.WARNING("No inventory items found to check"))
            return

        self.stdout.write(f"Checking {items.count()} inventory items...")

        mismatches = []
        checked = 0

        # For each inventory item, recompute on_hand from ledger
        for item in items:
            checked += 1

            # Compute expected on_hand from ledger deltas
            ledger_sum = (
                StockLedger.objects.filter(
                    tenant=item.tenant,
                    store=item.store,
                    variant=item.variant,
                    **ledger_filters
                )
                .aggregate(total=Sum("qty_delta"))["total"]
            )

            # If no ledger entries, expected is 0 (or initial on_hand if we had a starting point)
            expected_on_hand = Decimal(str(ledger_sum or 0))

            # Get actual on_hand
            actual_on_hand = Decimal(str(item.on_hand or 0))

            # Compare
            if expected_on_hand != actual_on_hand:
                mismatch = {
                    "item": item,
                    "expected": expected_on_hand,
                    "actual": actual_on_hand,
                    "difference": actual_on_hand - expected_on_hand,
                }
                mismatches.append(mismatch)

                if verbose:
                    self.stdout.write(
                        self.style.ERROR(
                            f"MISMATCH: {item.variant.sku} at {item.store.code} - "
                            f"Expected: {expected_on_hand}, Actual: {actual_on_hand}, "
                            f"Difference: {mismatch['difference']}"
                        )
                    )

        # Report results
        self.stdout.write("")
        self.stdout.write("=" * 60)
        self.stdout.write(f"Checked: {checked} items")
        self.stdout.write(f"Mismatches: {len(mismatches)}")
        
        # If requested, show ledger breakdown by ref_type
        if by_ref_type:
            self.stdout.write("")
            self.stdout.write("=" * 60)
            self.stdout.write("LEDGER BREAKDOWN BY REF_TYPE")
            self.stdout.write("=" * 60)
            
            ledger_qs = StockLedger.objects.filter(**ledger_filters)
            if not ledger_qs.exists():
                self.stdout.write("No ledger entries found.")
            else:
                # Group by ref_type
                ref_type_stats = (
                    ledger_qs.values("ref_type")
                    .annotate(
                        count=Count("id"),
                        total_delta=Sum("qty_delta"),
                    )
                    .order_by("ref_type")
                )
                
                self.stdout.write(f"{'Ref Type':<30} {'Count':<10} {'Total Delta':<15}")
                self.stdout.write("-" * 60)
                for stat in ref_type_stats:
                    ref_type = stat["ref_type"]
                    count = stat["count"]
                    total_delta = stat["total_delta"] or 0
                    self.stdout.write(f"{ref_type:<30} {count:<10} {total_delta:>15}")
                
                # Show per-store breakdown if store_id not specified
                if not store_id:
                    self.stdout.write("")
                    self.stdout.write("PER-STORE BREAKDOWN:")
                    stores = Store.objects.filter(tenant_id=tenant_id) if tenant_id else Store.objects.all()
                    for store in stores:
                        store_ledger = StockLedger.objects.filter(store=store, **{k: v for k, v in ledger_filters.items() if k != "store_id"})
                        if store_ledger.exists():
                            store_stats = (
                                store_ledger.values("ref_type")
                                .annotate(
                                    count=Count("id"),
                                    total_delta=Sum("qty_delta"),
                                )
                                .order_by("ref_type")
                            )
                            self.stdout.write(f"\n  Store: {store.code} ({store.name})")
                            for stat in store_stats:
                                ref_type = stat["ref_type"]
                                count = stat["count"]
                                total_delta = stat["total_delta"] or 0
                                self.stdout.write(f"    {ref_type:<28} {count:<8} {total_delta:>15}")

        if mismatches:
            self.stdout.write("")
            self.stdout.write(self.style.ERROR("MISMATCHES FOUND:"))
            for mismatch in mismatches:
                item = mismatch["item"]
                self.stdout.write(
                    self.style.ERROR(
                        f"  - {item.variant.sku} ({item.variant.name}) at {item.store.code} "
                        f"(Tenant: {item.tenant.code}): "
                        f"Expected {mismatch['expected']}, Actual {mismatch['actual']}, "
                        f"Difference: {mismatch['difference']}"
                    )
                )
            self.stdout.write("")
            self.stdout.write(
                self.style.ERROR(
                    "Action required: Review ledger entries and inventory items for the above mismatches."
                )
            )
            return 1  # Exit with error code
        else:
            self.stdout.write("")
            self.stdout.write(self.style.SUCCESS("✓ All inventory items match ledger (clean)"))
            return 0  # Exit with success code

