from django.contrib import admin

# Register your models here.
from django.contrib import admin
from .models import Product, Variant, TaxCategory
from common.admin_mixins import TenantScopedAdmin


# @admin.register(Product)
# class ProductAdmin(admin.ModelAdmin):
#     list_display = ("id", "name", "category")
#     search_fields = ("name", "category")

@admin.register(Product)
class ProductAdmin(TenantScopedAdmin):
    list_display = ("tenant", "name", "category", "is_active")
    list_filter = ("tenant", "category", "is_active")
    search_fields = ("name",)

    def thumbnail(self, obj):
        return obj.representative_image_url()
    thumbnail.short_description = "Image"


@admin.register(Variant)
class VariantAdmin(admin.ModelAdmin):
    list_display = ("id", "product", "sku", "barcode", "price", "is_active")
    search_fields = ("sku", "barcode")
    list_filter = ("is_active", "product")

    def image_short(self, obj):
        url = obj.effective_image_url
        return (url[:48] + "…") if url and len(url) > 48 else (url or "")
    image_short.short_description = "Image URL"


# admin.site.register(TaxCategory)


