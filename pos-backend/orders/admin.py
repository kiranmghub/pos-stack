# pos-backend/orders/admin.py
from django.contrib import admin
from django.contrib import admin
from .models import Sale, SaleLine, SalePayment
from .models import Sale, SaleLine, SalePayment, Return, ReturnItem, Refund


class SaleLineInline(admin.TabularInline):
    model = SaleLine
    extra = 0


class SalePaymentInline(admin.TabularInline):
    model = SalePayment
    extra = 0
    readonly_fields = ("type", "amount", "received", "change", "txn_ref", "created_at")


@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display = ("id", "tenant", "store", "register", "cashier", "total", "status", "receipt_no", "created_at")
    list_filter = ("tenant", "store", "register", "status", "created_at")
    search_fields = ("id", "receipt_no", "cashier__username")
    date_hierarchy = "created_at"
    inlines = [SaleLineInline, SalePaymentInline]


@admin.register(SaleLine)
class SaleLineAdmin(admin.ModelAdmin):
    list_display = ("sale", "variant", "qty", "unit_price", "discount", "tax", "fee", "line_total", "created_at")
    list_filter = ("sale__tenant", "sale__store", "created_at")
    search_fields = ("sale__id", "variant__sku", "variant__product__name")


@admin.register(SalePayment)
class SalePaymentAdmin(admin.ModelAdmin):
    list_display = ("sale", "type", "amount", "received", "change", "created_at")
    list_filter = ("type", "sale__tenant", "sale__store", "created_at")
    search_fields = ("sale__id", "txn_ref")


@admin.register(Return)
class ReturnAdmin(admin.ModelAdmin):
    list_display = ("id", "tenant", "store", "sale", "status", "refund_total", "return_no", "created_at")
    list_filter = ("tenant", "store", "status", "created_at")
    search_fields = ("id", "return_no", "sale__receipt_no")
    date_hierarchy = "created_at"

@admin.register(ReturnItem)
class ReturnItemAdmin(admin.ModelAdmin):
    list_display = ("return_ref", "sale_line", "qty_returned", "restock", "condition", "refund_total", "created_at")
    list_filter = ("return_ref__tenant", "return_ref__store", "condition", "created_at")

@admin.register(Refund)
class RefundAdmin(admin.ModelAdmin):
    list_display = ("return_ref", "method", "amount", "external_ref", "created_at")
    list_filter = ("method", "return_ref__tenant", "return_ref__store", "created_at")