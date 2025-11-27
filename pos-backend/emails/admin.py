from django.contrib import admin
from .models import EmailTemplate, EmailLog


@admin.register(EmailTemplate)
class EmailTemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "locale", "version", "is_active", "updated_at")
    search_fields = ("name", "subject", "locale")
    list_filter = ("locale", "is_active")


@admin.register(EmailLog)
class EmailLogAdmin(admin.ModelAdmin):
    list_display = ("to_address", "subject", "status", "created_at", "sent_at")
    search_fields = ("to_address", "subject", "error_message")
    list_filter = ("status",)
    readonly_fields = ("payload",)
