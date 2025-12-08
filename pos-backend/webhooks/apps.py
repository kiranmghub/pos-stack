from django.apps import AppConfig


class WebhooksConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'webhooks'
    
    def ready(self):
        """Import signals when app is ready"""
        import webhooks.signals  # noqa