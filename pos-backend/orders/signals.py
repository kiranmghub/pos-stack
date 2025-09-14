from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Sale, SaleLine
from inventory.models import InventoryItem, StockLedgerEntry


@receiver(post_save, sender=SaleLine)
def update_inventory_on_sale_line(sender, instance: SaleLine, created, **kwargs):
    if not created:
        return
    sale = instance.sale
    ii, _ = InventoryItem.objects.get_or_create(
        tenant=sale.tenant, store=sale.store, variant=instance.variant,
        defaults={"on_hand": 0, "reserved": 0}
    )
    ii.on_hand = ii.on_hand - instance.qty
    ii.save(update_fields=["on_hand"])
    StockLedgerEntry.objects.create(
        store=sale.store, variant=instance.variant, delta=-instance.qty,
        reason="sale", ref_type="sale", ref_id=str(sale.id)
    )