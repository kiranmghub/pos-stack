from django.contrib import admin
from .models import Tenant, TenantUser

@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "is_active")
    search_fields = ("name", "code")
    list_filter = ("is_active",)

@admin.register(TenantUser)
class TenantUserAdmin(admin.ModelAdmin):
    list_display = ("tenant", "user", "role", "is_active")
    list_filter = ("tenant", "role", "is_active")
    search_fields = ("user__username", "user__email", "tenant__name", "tenant__code")
    filter_horizontal = ("stores",)
