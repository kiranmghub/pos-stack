# domain_extensions/registry.py
"""
Extension registry for domain-specific customizations.

This module provides a registry pattern for domain extensions,
allowing the system to support business/domain-specific features
while keeping the core application generic.
"""

from typing import Dict, Optional, List


class DomainExtension:
    """
    Base class for all domain extensions.
    
    Each domain extension should inherit from this class and implement
    the required methods to customize behavior for a specific business domain.
    """
    code: str = ""  # e.g., "telangana_liquor", "paints_industry"
    name: str = ""  # Human-readable name
    version: str = "1.0.0"
    
    def is_enabled(self, tenant) -> bool:
        """
        Check if this extension is enabled for the given tenant.
        
        Args:
            tenant: Tenant instance
            
        Returns:
            True if extension is enabled for this tenant
        """
        if not tenant or not tenant.business_domain:
            return False
        return tenant.business_domain == self.code
    
    def get_config(self, tenant) -> dict:
        """
        Get domain-specific configuration for the tenant.
        
        Args:
            tenant: Tenant instance
            
        Returns:
            Dictionary containing domain-specific configuration
        """
        if not tenant:
            return {}
        return tenant.business_domain_config.get(self.code, {})


# Global registry of domain extensions
_extension_registry: Dict[str, DomainExtension] = {}


def register_extension(extension: DomainExtension):
    """
    Register a domain extension in the global registry.
    
    Args:
        extension: DomainExtension instance to register
        
    Raises:
        ValueError: If extension code is already registered
    """
    if not extension.code:
        raise ValueError("Extension must have a code")
    
    if extension.code in _extension_registry:
        raise ValueError(f"Extension with code '{extension.code}' is already registered")
    
    _extension_registry[extension.code] = extension


def get_extension(code: str) -> Optional[DomainExtension]:
    """
    Get an extension by its code.
    
    Args:
        code: Extension code (e.g., "telangana_liquor")
        
    Returns:
        DomainExtension instance or None if not found
    """
    return _extension_registry.get(code)


def get_active_extension(tenant) -> Optional[DomainExtension]:
    """
    Get the active extension for a tenant based on their business_domain.
    
    Args:
        tenant: Tenant instance
        
    Returns:
        DomainExtension instance or None if no domain is set or extension not found
    """
    if not tenant or not tenant.business_domain:
        return None
    
    return get_extension(tenant.business_domain)


def is_extension_enabled(tenant, code: str) -> bool:
    """
    Check if a specific extension is enabled for a tenant.
    
    Args:
        tenant: Tenant instance
        code: Extension code to check
        
    Returns:
        True if extension is enabled
    """
    if not tenant or not tenant.business_domain:
        return False
    
    return tenant.business_domain == code


def get_all_extensions() -> List[DomainExtension]:
    """
    Get all registered extensions.
    
    Returns:
        List of all registered DomainExtension instances
    """
    return list(_extension_registry.values())

