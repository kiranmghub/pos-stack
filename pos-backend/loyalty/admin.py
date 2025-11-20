# pos-backend/loyalty/admin.py

from django.contrib import admin
from django.utils.html import format_html
from django.urls import reverse
from django.db.models import Count, F

from .models import LoyaltyProgram, LoyaltyAccount, LoyaltyTransaction


@admin.register(LoyaltyProgram)
class LoyaltyProgramAdmin(admin.ModelAdmin):
    list_display = ["tenant", "is_active", "earn_rate", "redeem_rate", "updated_at"]
    list_editable = ["is_active", "earn_rate", "redeem_rate"]
    list_filter = ["is_active", "updated_at"]
    search_fields = ["tenant__name", "tenant__subdomain"]

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("tenant")


@admin.register(LoyaltyAccount)
class LoyaltyAccountAdmin(admin.ModelAdmin):
    list_display = [
        "customer_link",
        "tenant",
        "points_balance",
        "tier",
        "transaction_count",
        "updated_at",
    ]
    list_filter = ["tenant", "tier", "updated_at"]
    search_fields = [
        "customer__first_name",
        "customer__last_name",
        "customer__email",
        "customer__phone_number",
    ]
    readonly_fields = ["points_balance", "updated_at"]

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.select_related("tenant", "customer").annotate(
            transaction_count=Count("transactions", distinct=True)
        )

    def transaction_count(self, obj):
        # obj.transaction_count comes from the annotation above
        return obj.transaction_count
    transaction_count.short_description = "Transactions"
    transaction_count.admin_order_field = "transaction_count"

    def customer_link(self, obj):
        if not obj.pk:
            return "-"
        url = reverse("admin:customers_customer_change", args=[obj.customer_id])
        return format_html('<a href="{}">{}</a>', url, obj.customer.full_name)
    customer_link.short_description = "Customer"
    customer_link.admin_order_field = "customer__first_name"


@admin.register(LoyaltyTransaction)
class LoyaltyTransactionAdmin(admin.ModelAdmin):
    date_hierarchy = "created_at"
    list_display = [
        "created_at",
        "tenant",
        "account_customer",
        "type",
        "points",
        "balance_after",
        "sale_link",
    ]
    list_filter = ["tenant", "type", "created_at"]
    search_fields = [
        "account__customer__first_name",
        "account__customer__last_name",
        "account__customer__email",
    ]
    readonly_fields = [
        "tenant", "account", "sale", "type", "points",
        "balance_after", "metadata", "created_at",
    ]

    def has_add_permission(self, request):    return False
    def has_change_permission(self, request, obj=None): return False
    def has_delete_permission(self, request, obj=None):
        return request.user.is_superuser

    def get_queryset(self, request):
        return super().get_queryset(request).select_related(
            "tenant", "account__customer", "sale"
        )

    def account_customer(self, obj):
        return obj.account.customer.full_name if obj.account else "-"
    account_customer.short_description = "Customer"

    def sale_link(self, obj):
        if not obj.sale:
            return "-"
        url = reverse("admin:orders_sale_change", args=[obj.sale_id])
        return format_html('<a href="{}">Sale #{}</a>', url, obj.sale_id)
    sale_link.short_description = "Sale"