# domain_extensions/telangana_liquor/extension.py
"""
Telangana Liquor domain extension.

This extension provides ICDC (Invoice-cum-Delivery Challan) PDF ingestion
functionality for liquor stores in Telangana, India.
"""

from domain_extensions.registry import DomainExtension, register_extension


class TelanganaLiquorExtension(DomainExtension):
    """
    Domain extension for Telangana Liquor stores.
    
    Provides:
    - ICDC PDF parsing and ingestion
    - Special inventory posting rules
    - Rounding calculations
    - Breakage/shortage tracking
    """
    code = "telangana_liquor"
    name = "Telangana Liquor"
    version = "1.0.0"
    
    def is_enabled(self, tenant) -> bool:
        """Check if Telangana Liquor extension is enabled for tenant"""
        return super().is_enabled(tenant)
    
    def get_config(self, tenant) -> dict:
        """Get Telangana Liquor configuration"""
        config = super().get_config(tenant)
        
        # Default configuration values
        defaults = {
            "rounding_mode": "nearest_0.50",  # or "100_plus_1"
            "case_rate_rounding": True,
            "rate_tolerance": 0.50,  # Tolerance for rate comparisons
            "total_tolerance": 1.00,  # Tolerance for total comparisons
            "icdc_enabled": True,
            "auto_create_products": False,
            "auto_update_variant_cost": False,
        }
        
        # Merge defaults with tenant-specific config
        merged = defaults.copy()
        merged.update(config)
        return merged


def register_telangana_liquor_extension():
    """Register the Telangana Liquor extension"""
    extension = TelanganaLiquorExtension()
    register_extension(extension)
    return extension

