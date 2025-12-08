"""
Management command to export inventory snapshot data to CSV/JSON.

This command exports a complete snapshot of inventory data including:
- Inventory items
- Stock ledger entries
- Transfers
- Count sessions
- Purchase orders

Usage:
    python manage.py export_inventory_snapshot --tenant <tenant_id> --format csv --output /path/to/output
    python manage.py export_inventory_snapshot --tenant <tenant_id> --format json --output /path/to/output
    python manage.py export_inventory_snapshot --tenant <tenant_id> --format csv --store <store_id>
"""

import os
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Prefetch
from tenants.models import Tenant
from stores.models import Store
from inventory.models import InventoryItem, StockLedger, InventoryTransfer, InventoryTransferLine
from inventory.models_counts import CountSession, CountLine
from purchasing.models import PurchaseOrder, PurchaseOrderLine
from analytics.export import (
    export_to_csv, export_to_json,
    prepare_inventory_item_row, prepare_ledger_row,
    prepare_transfer_row, prepare_transfer_line_row,
    prepare_count_session_row, prepare_count_line_row,
    prepare_purchase_order_row, prepare_purchase_order_line_row,
)


class Command(BaseCommand):
    help = "Export inventory snapshot data to CSV or JSON"

    def add_arguments(self, parser):
        parser.add_argument(
            "--tenant",
            type=int,
            required=True,
            help="Tenant ID to export data for",
        )
        parser.add_argument(
            "--format",
            type=str,
            choices=["csv", "json"],
            default="csv",
            help="Export format: csv or json",
        )
        parser.add_argument(
            "--output",
            type=str,
            help="Output directory path (default: current directory)",
        )
        parser.add_argument(
            "--store",
            type=int,
            help="Filter by store ID (optional)",
        )
        parser.add_argument(
            "--include-ledger",
            action="store_true",
            default=True,
            help="Include stock ledger entries (default: True)",
        )
        parser.add_argument(
            "--no-ledger",
            action="store_true",
            help="Exclude stock ledger entries",
        )

    def handle(self, *args, **options):
        tenant_id = options["tenant"]
        export_format = options["format"]
        output_dir = options.get("output") or "."
        store_id = options.get("store")
        include_ledger = options["include_ledger"] and not options["no_ledger"]

        # Validate tenant
        try:
            tenant = Tenant.objects.get(id=tenant_id)
        except Tenant.DoesNotExist:
            raise CommandError(f"Tenant {tenant_id} not found")

        # Validate store if provided
        if store_id:
            try:
                store = Store.objects.get(id=store_id, tenant=tenant)
            except Store.DoesNotExist:
                raise CommandError(f"Store {store_id} not found for tenant {tenant_id}")

        # Create output directory if it doesn't exist
        os.makedirs(output_dir, exist_ok=True)

        timestamp = timezone.now().strftime("%Y%m%d_%H%M%S")
        prefix = f"{tenant.code}_inventory_snapshot_{timestamp}"

        self.stdout.write(f"Exporting inventory snapshot for tenant: {tenant.name} ({tenant.code})")
        if store_id:
            self.stdout.write(f"Filtering by store: {store.name}")

        # Export inventory items
        self.stdout.write("Exporting inventory items...")
        items_qs = InventoryItem.objects.filter(tenant=tenant).select_related("store", "variant", "variant__product")
        if store_id:
            items_qs = items_qs.filter(store_id=store_id)
        
        items_data = [prepare_inventory_item_row(item) for item in items_qs]
        self._write_file(f"{prefix}_inventory_items.{export_format}", items_data, export_format, output_dir)
        self.stdout.write(self.style.SUCCESS(f"  Exported {len(items_data)} inventory items"))

        # Export stock ledger
        if include_ledger:
            self.stdout.write("Exporting stock ledger...")
            ledger_qs = StockLedger.objects.filter(tenant=tenant).select_related("store", "variant", "variant__product", "created_by")
            if store_id:
                ledger_qs = ledger_qs.filter(store_id=store_id)
            
            ledger_data = [prepare_ledger_row(entry) for entry in ledger_qs]
            self._write_file(f"{prefix}_stock_ledger.{export_format}", ledger_data, export_format, output_dir)
            self.stdout.write(self.style.SUCCESS(f"  Exported {len(ledger_data)} ledger entries"))

        # Export transfers
        self.stdout.write("Exporting transfers...")
        transfers_qs = InventoryTransfer.objects.filter(tenant=tenant).select_related("from_store", "to_store", "created_by")
        if store_id:
            transfers_qs = transfers_qs.filter(
                models.Q(from_store_id=store_id) | models.Q(to_store_id=store_id)
            )
        
        transfers_data = [prepare_transfer_row(transfer) for transfer in transfers_qs]
        self._write_file(f"{prefix}_transfers.{export_format}", transfers_data, export_format, output_dir)
        self.stdout.write(self.style.SUCCESS(f"  Exported {len(transfers_data)} transfers"))

        # Export transfer lines
        if transfers_data:
            self.stdout.write("Exporting transfer lines...")
            transfer_ids = [t["id"] for t in transfers_data]
            transfer_lines_qs = InventoryTransferLine.objects.filter(
                transfer_id__in=transfer_ids
            ).select_related("variant")
            
            transfer_lines_data = [prepare_transfer_line_row(line) for line in transfer_lines_qs]
            self._write_file(f"{prefix}_transfer_lines.{export_format}", transfer_lines_data, export_format, output_dir)
            self.stdout.write(self.style.SUCCESS(f"  Exported {len(transfer_lines_data)} transfer lines"))

        # Export count sessions
        self.stdout.write("Exporting count sessions...")
        counts_qs = CountSession.objects.filter(tenant=tenant).select_related("store", "created_by")
        if store_id:
            counts_qs = counts_qs.filter(store_id=store_id)
        
        counts_data = [prepare_count_session_row(session) for session in counts_qs]
        self._write_file(f"{prefix}_count_sessions.{export_format}", counts_data, export_format, output_dir)
        self.stdout.write(self.style.SUCCESS(f"  Exported {len(counts_data)} count sessions"))

        # Export count lines
        if counts_data:
            self.stdout.write("Exporting count lines...")
            session_ids = [s["id"] for s in counts_data]
            count_lines_qs = CountLine.objects.filter(
                session_id__in=session_ids
            ).select_related("variant")
            
            count_lines_data = [prepare_count_line_row(line) for line in count_lines_qs]
            self._write_file(f"{prefix}_count_lines.{export_format}", count_lines_data, export_format, output_dir)
            self.stdout.write(self.style.SUCCESS(f"  Exported {len(count_lines_data)} count lines"))

        # Export purchase orders
        self.stdout.write("Exporting purchase orders...")
        pos_qs = PurchaseOrder.objects.filter(tenant=tenant).select_related("store", "vendor", "created_by")
        if store_id:
            pos_qs = pos_qs.filter(store_id=store_id)
        
        pos_data = [prepare_purchase_order_row(po) for po in pos_qs]
        self._write_file(f"{prefix}_purchase_orders.{export_format}", pos_data, export_format, output_dir)
        self.stdout.write(self.style.SUCCESS(f"  Exported {len(pos_data)} purchase orders"))

        # Export purchase order lines
        if pos_data:
            self.stdout.write("Exporting purchase order lines...")
            po_ids = [p["id"] for p in pos_data]
            po_lines_qs = PurchaseOrderLine.objects.filter(
                purchase_order_id__in=po_ids
            ).select_related("variant")
            
            po_lines_data = [prepare_purchase_order_line_row(line) for line in po_lines_qs]
            self._write_file(f"{prefix}_purchase_order_lines.{export_format}", po_lines_data, export_format, output_dir)
            self.stdout.write(self.style.SUCCESS(f"  Exported {len(po_lines_data)} purchase order lines"))

        self.stdout.write(self.style.SUCCESS(f"\nExport completed! Files saved to: {output_dir}"))

    def _write_file(self, filename, data, format_type, output_dir):
        """Write data to file"""
        filepath = os.path.join(output_dir, filename)
        
        if format_type == "csv":
            content = export_to_csv(data)
        else:
            content = export_to_json(data)
        
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)

