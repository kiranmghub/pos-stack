from django.apps import AppConfig


class DomainExtensionsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'domain_extensions'

    def ready(self):
        """Register domain extensions when app is ready"""
        # Import here to avoid circular imports
        try:
            from domain_extensions.telangana_liquor.extension import register_telangana_liquor_extension
            register_telangana_liquor_extension()
        except ImportError as e:
            # Extension not implemented yet, ignore
            import logging
            logger = logging.getLogger(__name__)
            logger.debug(f"Could not register Telangana Liquor extension: {e}")

