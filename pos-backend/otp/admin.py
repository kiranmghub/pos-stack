from django.contrib import admin
from .models import OtpRequest, OtpConfig


@admin.register(OtpRequest)
class OtpRequestAdmin(admin.ModelAdmin):
    list_display = ("email", "purpose", "is_used", "expires_at", "attempts", "created_at")
    list_filter = ("purpose", "is_used")
    search_fields = ("email", "ip_address", "user_agent")
    readonly_fields = ("code_hash", "salt")


@admin.register(OtpConfig)
class OtpConfigAdmin(admin.ModelAdmin):
    list_display = (
        "country_code",
        "is_active",
        "send_per_email",
        "send_email_window",
        "send_per_ip",
        "send_ip_window",
        "verify_per_email",
        "verify_email_window",
    )
    list_filter = ("is_active", "country_code")
    search_fields = ("country_code",)
