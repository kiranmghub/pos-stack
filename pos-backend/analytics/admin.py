# analytics/admin.py
from django.contrib import admin
from .models import ExportTracking


@admin.register(ExportTracking)
class ExportTrackingAdmin(admin.ModelAdmin):
    list_display = ("tenant", "export_type", "last_exported_id", "records_exported", "last_exported_at")
    list_filter = ("tenant", "export_type", "last_exported_at")
    search_fields = ("tenant__name", "tenant__code")
    readonly_fields = ("last_exported_at",)
    date_hierarchy = "last_exported_at"
