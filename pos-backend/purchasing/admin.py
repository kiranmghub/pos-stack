from django.contrib import admin
from .models import Vendor, PurchaseOrder, PurchaseOrderLine


@admin.register(Vendor)
class VendorAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "tenant", "contact_name", "email", "is_active", "created_at")
    list_filter = ("tenant", "is_active")
    search_fields = ("name", "code", "email", "contact_name")
    readonly_fields = ("created_at", "updated_at")


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(admin.ModelAdmin):
    list_display = ("po_number", "vendor", "store", "tenant", "status", "created_at", "created_by")
    list_filter = ("tenant", "store", "status", "created_at")
    search_fields = ("po_number", "vendor__name", "notes")
    readonly_fields = ("created_at", "updated_at", "submitted_at", "received_at")
    date_hierarchy = "created_at"


@admin.register(PurchaseOrderLine)
class PurchaseOrderLineAdmin(admin.ModelAdmin):
    list_display = ("purchase_order", "variant", "qty_ordered", "qty_received", "qty_remaining", "unit_cost")
    list_filter = ("purchase_order__status", "purchase_order__tenant")
    search_fields = ("variant__sku", "variant__product__name", "purchase_order__po_number")

