from django.apps import AppConfig


class TenantAdminConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'tenant_admin'
