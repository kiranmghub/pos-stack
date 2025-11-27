from django.contrib import admin
from .models import Plan, PlanPrice, Subscription


@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "trial_days", "is_active")
    search_fields = ("code", "name")
    list_filter = ("is_active",)


@admin.register(PlanPrice)
class PlanPriceAdmin(admin.ModelAdmin):
    list_display = ("plan", "currency", "billing_period", "country_code", "amount", "version", "valid_from", "valid_to")
    list_filter = ("currency", "billing_period", "country_code", "plan")
    search_fields = ("plan__code", "plan__name")


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ("tenant", "plan", "status", "currency", "amount", "trial_end_at", "current_period_end")
    list_filter = ("status", "plan", "currency")
    search_fields = ("tenant__name", "tenant__code", "plan__code")
