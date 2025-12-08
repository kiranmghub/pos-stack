"""
Management command to export delta (incremental) inventory data.

This command exports only new/changed records since the last export run.
Tracks last exported ID per tenant and export type.

Usage:
    python manage.py export_inventory_delta --tenant <tenant_id> --type ledger --format csv --output /path/to/output
    python manage.py export_inventory_delta --tenant <tenant_id> --type ledger --format json --output /path/to/output
    python manage.py export_inventory_delta --tenant <tenant_id> --type transfers --format csv
"""

import os
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Q
from django.utils import timezone
from tenants.models import Tenant
from stores.models import Store
from inventory.models import StockLedger, InventoryTransfer, InventoryTransferLine
from inventory.models_counts import CountSession, CountLine
from purchasing.models import PurchaseOrder, PurchaseOrderLine
from analytics.models import ExportTracking
from analytics.export import (
    export_to_csv, export_to_json,
    prepare_ledger_row, prepare_transfer_row, prepare_transfer_line_row,
    prepare_count_session_row, prepare_count_line_row,
    prepare_purchase_order_row, prepare_purchase_order_line_row,
)


class Command(BaseCommand):
    help = "Export delta (incremental) inventory data since last export"

    def add_arguments(self, parser):
        parser.add_argument(
            "--tenant",
            type=int,
            required=True,
            help="Tenant ID to export data for",
        )
        parser.add_argument(
            "--type",
            type=str,
            choices=["ledger", "transfers", "counts", "purchase_orders"],
            required=True,
            help="Type of data to export",
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
            "--reset",
            action="store_true",
            help="Reset export tracking (start from beginning)",
        )

    def handle(self, *args, **options):
        tenant_id = options["tenant"]
        export_type = options["type"]
        export_format = options["format"]
        output_dir = options.get("output") or "."
        store_id = options.get("store")
        reset = options["reset"]

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

        # Get or create export tracking
        tracking, created = ExportTracking.objects.get_or_create(
            tenant=tenant,
            export_type=export_type,
            defaults={"last_exported_id": 0, "records_exported": 0}
        )

        if reset:
            tracking.last_exported_id = 0
            tracking.records_exported = 0
            tracking.save()
            self.stdout.write(self.style.WARNING("Export tracking reset"))

        last_id = tracking.last_exported_id
        self.stdout.write(f"Exporting {export_type} delta for tenant: {tenant.name} ({tenant.code})")
        self.stdout.write(f"Last exported ID: {last_id}")

        # Create output directory if it doesn't exist
        os.makedirs(output_dir, exist_ok=True)

        timestamp = timezone.now().strftime("%Y%m%d_%H%M%S")
        prefix = f"{tenant.code}_{export_type}_delta_{timestamp}"

        # Export based on type
        if export_type == "ledger":
            data, max_id = self._export_ledger_delta(tenant, store_id, last_id)
        elif export_type == "transfers":
            data, max_id = self._export_transfers_delta(tenant, store_id, last_id)
        elif export_type == "counts":
            data, max_id = self._export_counts_delta(tenant, store_id, last_id)
        elif export_type == "purchase_orders":
            data, max_id = self._export_purchase_orders_delta(tenant, store_id, last_id)
        else:
            raise CommandError(f"Unknown export type: {export_type}")

        if not data:
            self.stdout.write(self.style.WARNING("No new records to export"))
            return

        # Write export file
        filename = f"{prefix}.{export_format}"
        filepath = os.path.join(output_dir, filename)
        
        if export_format == "csv":
            content = export_to_csv(data)
        else:
            content = export_to_json(data)
        
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)

        # Update tracking
        tracking.last_exported_id = max_id
        tracking.records_exported = len(data)
        tracking.last_exported_at = timezone.now()
        tracking.save()

        self.stdout.write(self.style.SUCCESS(f"Exported {len(data)} records"))
        self.stdout.write(self.style.SUCCESS(f"New last exported ID: {max_id}"))
        self.stdout.write(self.style.SUCCESS(f"File saved to: {filepath}"))

    def _export_ledger_delta(self, tenant, store_id, last_id):
        """Export stock ledger entries since last_id"""
        qs = StockLedger.objects.filter(
            tenant=tenant,
            id__gt=last_id
        ).select_related("store", "variant", "variant__product", "created_by")
        
        if store_id:
            qs = qs.filter(store_id=store_id)
        
        qs = qs.order_by("id")
        data = [prepare_ledger_row(entry) for entry in qs]
        max_id = max([entry.id for entry in qs]) if qs.exists() else last_id
        
        return data, max_id

    def _export_transfers_delta(self, tenant, store_id, last_id):
        """Export transfers and their lines since last_id"""
        transfers_qs = InventoryTransfer.objects.filter(
            tenant=tenant,
            id__gt=last_id
        ).select_related("from_store", "to_store", "created_by")
        
        if store_id:
            transfers_qs = transfers_qs.filter(
                Q(from_store_id=store_id) | Q(to_store_id=store_id)
            )
        
        transfers_qs = transfers_qs.order_by("id")
        transfers_data = [prepare_transfer_row(transfer) for transfer in transfers_qs]
        
        # Include transfer lines
        if transfers_data:
            transfer_ids = [t["id"] for t in transfers_data]
            transfer_lines_qs = InventoryTransferLine.objects.filter(
                transfer_id__in=transfer_ids
            ).select_related("variant")
            
            transfer_lines_data = [prepare_transfer_line_row(line) for line in transfer_lines_qs]
            
            # Combine transfers and lines
            data = []
            for transfer in transfers_data:
                data.append({"type": "transfer", **transfer})
                # Add lines for this transfer
                for line in transfer_lines_data:
                    if line["transfer_id"] == transfer["id"]:
                        data.append({"type": "transfer_line", **line})
        else:
            data = []
        
        max_id = max([t.id for t in transfers_qs]) if transfers_qs.exists() else last_id
        
        return data, max_id

    def _export_counts_delta(self, tenant, store_id, last_id):
        """Export count sessions and their lines since last_id"""
        counts_qs = CountSession.objects.filter(
            tenant=tenant,
            id__gt=last_id
        ).select_related("store", "created_by")
        
        if store_id:
            counts_qs = counts_qs.filter(store_id=store_id)
        
        counts_qs = counts_qs.order_by("id")
        counts_data = [prepare_count_session_row(session) for session in counts_qs]
        
        # Include count lines
        if counts_data:
            session_ids = [s["id"] for s in counts_data]
            count_lines_qs = CountLine.objects.filter(
                session_id__in=session_ids
            ).select_related("variant")
            
            count_lines_data = [prepare_count_line_row(line) for line in count_lines_qs]
            
            # Combine sessions and lines
            data = []
            for session in counts_data:
                data.append({"type": "count_session", **session})
                # Add lines for this session
                for line in count_lines_data:
                    if line["session_id"] == session["id"]:
                        data.append({"type": "count_line", **line})
        else:
            data = []
        
        max_id = max([s.id for s in counts_qs]) if counts_qs.exists() else last_id
        
        return data, max_id

    def _export_purchase_orders_delta(self, tenant, store_id, last_id):
        """Export purchase orders and their lines since last_id"""
        pos_qs = PurchaseOrder.objects.filter(
            tenant=tenant,
            id__gt=last_id
        ).select_related("store", "vendor", "created_by")
        
        if store_id:
            pos_qs = pos_qs.filter(store_id=store_id)
        
        pos_qs = pos_qs.order_by("id")
        pos_data = [prepare_purchase_order_row(po) for po in pos_qs]
        
        # Include purchase order lines
        if pos_data:
            po_ids = [p["id"] for p in pos_data]
            po_lines_qs = PurchaseOrderLine.objects.filter(
                purchase_order_id__in=po_ids
            ).select_related("variant")
            
            po_lines_data = [prepare_purchase_order_line_row(line) for line in po_lines_qs]
            
            # Combine POs and lines
            data = []
            for po in pos_data:
                data.append({"type": "purchase_order", **po})
                # Add lines for this PO
                for line in po_lines_data:
                    if line["purchase_order_id"] == po["id"]:
                        data.append({"type": "purchase_order_line", **line})
        else:
            data = []
        
        max_id = max([p.id for p in pos_qs]) if pos_qs.exists() else last_id
        
        return data, max_id

