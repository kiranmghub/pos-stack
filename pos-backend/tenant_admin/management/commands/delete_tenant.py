"""
Management command to delete a tenant plus all protected related objects.

Usage examples:
    python manage.py delete_tenant --tenant-id 42 --dry-run
    python manage.py delete_tenant --tenant-code=demo --batch-size=1000 --force
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import router, transaction
from django.db.models.deletion import ProtectedError

from tenants.models import Tenant
from orders.models import Return, Sale
from purchasing.models import PurchaseOrder
from inventory.models import InventoryAdjustment, InventoryTransfer, StockLedger
from inventory.models_reservations import Reservation


class Command(BaseCommand):
    help = "Delete a tenant after removing protected related objects such as sales and returns."

    def add_arguments(self, parser):
        parser.add_argument("--tenant-id", type=int, help="Numeric tenant ID to delete.")
        parser.add_argument("--tenant-code", type=str, help="Tenant code to delete.")
        parser.add_argument(
            "--batch-size",
            type=int,
            default=2000,
            help="How many records to delete per batch for large tables.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print what would be deleted without touching the database.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Skip the confirmation prompt (use with caution).",
        )

    def handle(self, *args, **options):
        tenant = self._resolve_tenant(options)
        batch_size = max(1, options["batch_size"])
        dry_run = options["dry_run"]
        force = options["force"]

        self.stdout.write("")
        self.stdout.write(self.style.MIGRATE_HEADING("Tenant purge summary"))
        self.stdout.write(f"  Name : {tenant.name}")
        self.stdout.write(f"  Code : {tenant.code}")
        self.stdout.write(f"  ID   : {tenant.id}")
        self.stdout.write("")

        plan = self._build_deletion_plan(tenant)

        if dry_run:
            self.stdout.write(self.style.WARNING("Dry-run enabled; nothing will be deleted."))
            for label, queryset in plan:
                count = queryset.count()
                verbose = queryset.model._meta.verbose_name_plural
                self.stdout.write(f"  - {label}: {count:,} {verbose}")
            return

        if not force:
            prompt = (
                "Type the tenant code to confirm permanent deletion "
                f"of {tenant.name} ({tenant.code}).\n> "
            )
            confirmation = input(prompt).strip()
            if confirmation != tenant.code:
                raise CommandError("Confirmation failed. Aborting.")

        db_alias = router.db_for_write(Tenant)
        try:
            with transaction.atomic(using=db_alias):
                for label, queryset in plan:
                    self._delete_queryset(queryset, label, batch_size)

                tenant_display = f"{tenant.name} ({tenant.code})"
                deleted_count, _ = tenant.delete()
                self.stdout.write(self.style.SUCCESS(f"Tenant deleted: {tenant_display} ({deleted_count} objects removed)"))
        except ProtectedError as exc:
            raise CommandError(
                "Deletion aborted due to remaining protected relations: "
                f"{exc.protected_objects}"
            ) from exc

    def _resolve_tenant(self, options):
        tenant_id = options.get("tenant_id")
        tenant_code = options.get("tenant_code")

        if not tenant_id and not tenant_code:
            raise CommandError("Provide either --tenant-id or --tenant-code.")

        try:
            if tenant_id:
                return Tenant.objects.get(id=tenant_id)
            return Tenant.objects.get(code=tenant_code)
        except Tenant.DoesNotExist as exc:
            identifier = tenant_id or tenant_code
            raise CommandError(f"Tenant {identifier} not found") from exc

    def _build_deletion_plan(self, tenant):
        """
        Define the order in which protected data should be removed.
        Returns and their nested records must go before sales.
        """
        return [
            ("Inventory reservations", Reservation.objects.filter(tenant=tenant)),
            ("Inventory adjustments (lines cascade)", InventoryAdjustment.objects.filter(tenant=tenant)),
            ("Inventory transfers (includes lines)", InventoryTransfer.objects.filter(tenant=tenant)),
            ("Stock ledger entries", StockLedger.objects.filter(tenant=tenant)),
            ("Purchase orders (includes lines)", PurchaseOrder.objects.filter(tenant=tenant)),
            ("Returns (includes ReturnItems/Refunds)", Return.objects.filter(tenant=tenant)),
            ("Sales (includes lines/payments/receipts)", Sale.objects.filter(tenant=tenant)),
        ]

    def _delete_queryset(self, queryset, label, batch_size):
        count = queryset.count()
        verbose = queryset.model._meta.verbose_name_plural
        if count == 0:
            self.stdout.write(f"  - {label}: nothing to delete")
            return

        self.stdout.write(f"  - {label}: deleting {count:,} {verbose} ({batch_size} per batch)")
        model = queryset.model
        deleted = 0

        while True:
            batch_ids = list(
                queryset.order_by("pk").values_list("pk", flat=True)[:batch_size]
            )
            if not batch_ids:
                break

            model.objects.filter(pk__in=batch_ids).delete()
            deleted += len(batch_ids)
            self.stdout.write(f"      ... {deleted:,}/{count:,} rows removed")

        self.stdout.write(self.style.SUCCESS(f"    ✓ Finished {label}"))
