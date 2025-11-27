from django.contrib import admin
from .models import PendingSignup, SignupAudit


@admin.register(PendingSignup)
class PendingSignupAdmin(admin.ModelAdmin):
    list_display = ("email", "country_code", "preferred_currency", "is_email_verified", "created_at")
    list_filter = ("is_email_verified", "country_code")
    search_fields = ("email",)


@admin.register(SignupAudit)
class SignupAuditAdmin(admin.ModelAdmin):
    list_display = ("email", "action", "ip_address", "created_at")
    list_filter = ("action",)
    search_fields = ("email", "ip_address", "user_agent")
    readonly_fields = ("created_at",)
