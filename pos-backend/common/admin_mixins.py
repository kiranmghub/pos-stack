from django.contrib import admin
from tenants.models import TenantUser


class TenantScopedAdmin(admin.ModelAdmin):
    """
    Filter admin queryset to the user's tenant memberships.
    Superusers see all.
    """
    tenant_field = "tenant"  # override for store-linked models

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if request.user.is_superuser:
            return qs
        memberships = TenantUser.objects.filter(user=request.user, is_active=True)
        if not memberships.exists():
            return qs.none()
        tenant_ids = memberships.values_list("tenant_id", flat=True)
        if self.tenant_field:
            return qs.filter(**{f"{self.tenant_field}__in": tenant_ids})
        return qs

    def save_model(self, request, obj, form, change):
        if not change and self.tenant_field and getattr(obj, f"{self.tenant_field}_id", None) is None:
            m = TenantUser.objects.filter(user=request.user, is_active=True).first()
            if m:
                setattr(obj, f"{self.tenant_field}_id", m.tenant_id)
        super().save_model(request, obj, form, change)
