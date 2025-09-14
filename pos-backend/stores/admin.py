from django.contrib import admin

# Register your models here.
# stores/admin.py
from django.contrib import admin
from .models import Store, Register

# @admin.register(Store)
# class StoreAdmin(admin.ModelAdmin):
#     list_display = ("tenant", "name", "code", "timezone")
#     list_filter = ("tenant",)
#     search_fields = ("name", "code")
#
# @admin.register(Register)
# class RegisterAdmin(admin.ModelAdmin):
#     list_display = ("store", "code", "is_active")
#     list_filter = ("store__tenant", "store")
#     search_fields = ("code",)

# stores/admin.py
from django.contrib import admin
from .models import Store, Register


class RegisterInline(admin.TabularInline):
    model = Register
    extra = 0
    show_change_link = True

@admin.register(Store)
class StoreAdmin(admin.ModelAdmin):
    # 👉 columns in the list view
    list_display = (
        "tenant",
        "name",
        "code",
        "city",
        "state",
        "postal_code",
        "country",
        # "timezone",
        "full_address",   # custom column (see method below)
        "updated_at",
    )
    list_display_links = ("name",)        # which column is clickable
    # list_editable = ("timezone",)         # quick-edit in list
    ordering = ("tenant__name", "name")
    list_per_page = 50

    # 👉 right-side filters
    list_filter = ("tenant",
                   "city",
                   "state",
                   "country"
                   # "timezone"
                   )

    # 👉 search box
    search_fields = (
        "name",
        "code",
        "city",
        "state",
        "postal_code",
        "country",
    )

    # 👉 speed up queries with FKs
    list_select_related = ("tenant",)

    # 👉 optional inline: see registers under each store (on detail page)
    inlines = [RegisterInline]

    # custom computed column
    def full_address(self, obj):
        parts = [obj.street, obj.city, obj.state, obj.postal_code, obj.country]
        return ", ".join([p for p in parts if p])
    full_address.short_description = "Address"


@admin.register(Register)
class RegisterAdmin(admin.ModelAdmin):
    list_display = ("store", "code", "is_active", "created_at")
    list_filter = ("store__tenant", "store", "is_active")
    search_fields = ("code", "store__name", "store__code")
    list_select_related = ("store",)

