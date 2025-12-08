from django.contrib import admin

# Register your models here.
from django.contrib import admin
from .models import InventoryItem, StockLedger
from .models_reservations import Reservation


@admin.register(InventoryItem)
class InventoryItemAdmin(admin.ModelAdmin):
    list_display = ("tenant", "store", "variant", "on_hand", "reserved", "updated_at")
    list_filter = ("tenant", "store")
    search_fields = ("variant__sku", "variant__product__name")


@admin.register(StockLedger)
class StockLedgerAdmin(admin.ModelAdmin):
    list_display = ("created_at", "tenant", "store", "variant", "qty_delta", "balance_after", "ref_type", "ref_id", "created_by")
    list_filter = ("tenant", "store", "ref_type", "created_at")
    search_fields = ("variant__sku", "variant__product__name", "ref_id", "note", "store__name", "store__code")
    date_hierarchy = "created_at"
    readonly_fields = ("tenant", "store", "variant", "qty_delta", "balance_after", "ref_type", "ref_id", "note", "created_at", "created_by")
    
    def has_add_permission(self, request):
        # Ledger entries should only be created programmatically, not via admin
        return False
    
    def has_change_permission(self, request, obj=None):
        # Ledger entries are immutable
        return False


@admin.register(Reservation)
class ReservationAdmin(admin.ModelAdmin):
    list_display = ("id", "variant", "store", "tenant", "quantity", "status", "channel", "ref_type", "ref_id", "created_at", "expires_at")
    list_filter = ("tenant", "store", "status", "channel", "ref_type", "created_at")
    search_fields = ("variant__sku", "variant__product__name", "ref_type", "note")
    readonly_fields = ("created_at", "updated_at", "committed_at", "released_at")
    date_hierarchy = "created_at"
