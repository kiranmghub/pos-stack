from django.contrib import admin

# Register your models here.

# from django.contrib import admin
# from .models import Sale, SaleLine
#
#
# class SaleLineInline(admin.TabularInline):
#     model = SaleLine
#     extra = 0
#
#
# @admin.register(Sale)
# class SaleAdmin(admin.ModelAdmin):
#     list_display = ("id", "tenant", "store", "register", "cashier", "total", "status", "created_at")
#     list_filter = ("tenant", "store", "register", "status", "created_at")
#     search_fields = ("id", "cashier__username")
#     date_hierarchy = "created_at"
#     inlines = [SaleLineInline]
#
#
# @admin.register(SaleLine)
# class SaleLineAdmin(admin.ModelAdmin):
#     list_display = ("sale", "variant", "qty", "unit_price", "discount", "tax", "fee", "line_total", "created_at")
#     list_filter = ("sale__tenant", "sale__store", "created_at")
#     search_fields = ("sale__id", "variant__sku", "variant__product__name")

# orders/admin.py
from django.contrib import admin
from .models import Sale, SaleLine, SalePayment


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
