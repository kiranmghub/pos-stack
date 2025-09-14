from django.contrib import admin

# Register your models here.
from django.contrib import admin
from .models import InventoryItem, StockLedgerEntry


@admin.register(InventoryItem)
class InventoryItemAdmin(admin.ModelAdmin):
    list_display = ("tenant", "store", "variant", "on_hand", "reserved", "updated_at")
    list_filter = ("tenant", "store")
    search_fields = ("variant__sku", "variant__product__name")


@admin.register(StockLedgerEntry)
class StockLedgerEntryAdmin(admin.ModelAdmin):
    list_display = ("created_at", "store", "variant", "delta", "reason", "ref_type", "ref_id")
    list_filter = ("reason", "store")
    search_fields = ("variant__sku", "ref_id", "ref_type")
    date_hierarchy = "created_at"
