# pos-backend/orders/signals.py
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from inventory.models import InventoryItem, StockLedger

from .models import Sale, SaleLine


def _adjust_inventory_for_sale_line(line: SaleLine):
    sale = line.sale
    with transaction.atomic():
        item, _ = InventoryItem.objects.select_for_update().get_or_create(
            tenant=sale.tenant,
            store=sale.store,
            variant=line.variant,
            defaults={"on_hand": 0, "reserved": 0},
        )
        on_hand = Decimal(item.on_hand or 0)
        qty = Decimal(line.qty or 0)
        if on_hand < qty:
            raise ValidationError(
                {"detail": f"Insufficient inventory for variant {line.variant_id} (available {on_hand}, requested {qty})."}
            )
        item.on_hand = on_hand - qty
        item.save(update_fields=["on_hand"])
        StockLedger.objects.create(
            tenant=sale.tenant,
            store=sale.store,
            variant=line.variant,
            qty_delta=-int(qty),
            balance_after=item.on_hand,
            ref_type="SALE",
            ref_id=sale.id,
            note=f"Sale #{sale.id} (signal)",
            created_by=getattr(sale, "cashier", None),
        )


@receiver(post_save, sender=SaleLine)
def update_inventory_on_sale_line(sender, instance: SaleLine, created, **kwargs):
    if not created:
        return
    sale = instance.sale
    if getattr(sale, "_skip_inventory_signal", False):
        return
    _adjust_inventory_for_sale_line(instance)
