from django.contrib import admin

# Register your models here.
from django.contrib import admin
from .models import PriceList, PriceListItem


class PriceListItemInline(admin.TabularInline):
    model = PriceListItem
    extra = 0


@admin.register(PriceList)
class PriceListAdmin(admin.ModelAdmin):
    list_display = ("tenant", "name", "currency", "created_at")
    list_filter = ("tenant", "currency")
    search_fields = ("name",)
    inlines = [PriceListItemInline]


@admin.register(PriceListItem)
class PriceListItemAdmin(admin.ModelAdmin):
    list_display = ("pricelist", "variant", "price", "start_at", "end_at", "created_at")
    list_filter = ("pricelist__tenant", "start_at", "end_at")
    search_fields = ("variant__sku", "variant__product__name", "pricelist__name")
