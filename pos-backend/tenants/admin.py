from django.contrib import admin
from .models import Tenant, TenantDoc, TenantUser

@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "is_active")
    search_fields = ("name", "code")
    list_filter = ("is_active",)

@admin.register(TenantUser)
class TenantUserAdmin(admin.ModelAdmin):
    list_display = ("tenant", "user", "first_name", "last_name", "role", "is_active")
    list_filter = ("tenant", "role", "is_active")
    search_fields = (
        "user__username",
        "user__email",
        "tenant__name",
        "tenant__code",
        "first_name",
        "last_name",
        "personal_email",
        "personal_phone",
    )
    filter_horizontal = ("stores",)


@admin.register(TenantDoc)
class TenantDocAdmin(admin.ModelAdmin):
    list_display = ("label", "tenant", "subject_user", "doc_type", "uploaded_by", "created_at")
    list_filter = ("tenant", "doc_type")
    search_fields = ("label", "tenant__name", "tenant__code", "doc_type", "subject_user__user__username")
