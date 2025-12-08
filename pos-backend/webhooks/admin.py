# webhooks/admin.py
from django.contrib import admin
from .models import WebhookSubscription, WebhookDelivery


@admin.register(WebhookSubscription)
class WebhookSubscriptionAdmin(admin.ModelAdmin):
    list_display = ("id", "tenant", "url", "is_active", "failure_count", "last_triggered_at", "created_at")
    list_filter = ("tenant", "is_active", "created_at")
    search_fields = ("url", "description")
    readonly_fields = ("secret", "created_at", "updated_at", "last_triggered_at", "last_success_at", "last_failure_at", "failure_count")
    filter_horizontal = ()  # For event_types if we want a better UI
    
    fieldsets = (
        ("Basic Information", {
            "fields": ("tenant", "url", "description", "is_active")
        }),
        ("Event Types", {
            "fields": ("event_types",)
        }),
        ("Retry Configuration", {
            "fields": ("max_retries", "retry_backoff_seconds")
        }),
        ("Statistics", {
            "fields": ("last_triggered_at", "last_success_at", "last_failure_at", "failure_count")
        }),
        ("Security", {
            "fields": ("secret",)
        }),
        ("Timestamps", {
            "fields": ("created_at", "updated_at")
        }),
    )


@admin.register(WebhookDelivery)
class WebhookDeliveryAdmin(admin.ModelAdmin):
    list_display = ("id", "subscription", "event_type", "status", "attempt_count", "response_status_code", "created_at")
    list_filter = ("status", "event_type", "created_at")
    search_fields = ("subscription__url", "event_type", "error_message")
    readonly_fields = ("subscription", "event_type", "payload", "signature", "status", "attempt_count", "max_retries", "response_status_code", "response_body", "error_message", "created_at", "delivered_at", "next_retry_at")
    
    def has_add_permission(self, request):
        return False  # Deliveries are created automatically
    
    def has_change_permission(self, request, obj=None):
        return False  # Deliveries are immutable
