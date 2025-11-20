# pos-backend/customers/admin.py
# from django.contrib import admin
# from django.contrib import admin
# from .models import Customer


# @admin.register(Customer)
# class CustomerAdmin(admin.ModelAdmin):
#     list_display = ("tenant", "name", "phone", "email", "loyalty_id", "created_at")
#     list_filter = ("tenant",)
#     search_fields = ("name", "phone", "email", "loyalty_id")
# pos-backend/customers/admin.py

from django.contrib import admin
from django.utils.html import format_html
from django.urls import reverse
from django.utils.http import urlencode

from .models import Customer


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "full_name_link",
        "email",
        "phone_number",
        "tenant",
        "is_loyalty_member",
        "total_spend",
        "visits_count",
        "last_purchase_date",
        "created_at",
    ]

    list_filter = [
        "tenant",
        "is_loyalty_member",
        "marketing_opt_in",
        "sms_opt_in",
        "country",
        "created_at",
        "last_purchase_date",
    ]

    search_fields = [
        "first_name__istartswith",
        "last_name__istartswith",
        "email__icontains",
        "phone_number__icontains",
        "external_id__exact",
    ]

    readonly_fields = [
        "total_spend",
        "total_returns",
        "net_spend",
        "visits_count",
        "last_purchase_date",
        "created_at",
        "updated_at",
    ]

    fieldsets = (
        (None, {
            "fields": (
                "tenant",
                "external_id",
                ("first_name", "last_name"),
                ("email", "phone_number"),
            )
        }),
        ("Address", {
            "fields": (
                "address_line1",
                "address_line2",
                ("city", "state_province", "postal_code"),
                "country",
            ),
            "classes": ("collapse",),
        }),
        ("Preferences & Consent", {
            "fields": (
                "marketing_opt_in",
                "sms_opt_in",
                "is_loyalty_member",
                ("date_of_birth", "gender"),
            ),
        }),
        ("Statistics (auto-calculated)", {
            "fields": (
                "total_spend",
                "total_returns",
                "net_spend",
                "visits_count",
                "last_purchase_date",
            ),
            "classes": ("collapse",),
        }),
        ("Custom Data", {
            "fields": ("custom_attributes",),
            "classes": ("collapse",),
        }),
        ("Metadata", {
            "fields": (
                "created_by",
                "created_at",
                "updated_at",
            ),
            "classes": ("collapse",),
        }),
    )
    
    autocomplete_fields = ["created_by"]

    ordering = ["-last_purchase_date", "-id"]
    list_per_page = 25
    show_full_result_count = False

    def get_queryset(self, request):
        """Optimize query with select_related/prefetch_related where needed."""
        qs = super().get_queryset(request)
        return qs.select_related("tenant", "created_by")

    def full_name_link(self, obj):
        """Display clickable full name in list view."""
        if not obj.pk:
            return "-"
        url = reverse("admin:customers_customer_change", args=[obj.pk])
        return format_html('<a href="{}">{}</a>', url, obj.full_name)
    full_name_link.short_description = "Customer"
    full_name_link.admin_order_field = "first_name"

    def has_add_permission(self, request):
        # Optional: restrict add if you want customers created only via API/checkout
        return True

    def has_change_permission(self, request, obj=None):
        return True

    def has_delete_permission(self, request, obj=None):
        # Be careful with deletion – customers may have related orders/loyalty data
        return request.user.is_superuser
