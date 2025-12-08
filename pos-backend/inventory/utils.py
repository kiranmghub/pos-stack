from typing import Any


def tenant_default_reorder_point(tenant: Any) -> int:
    """
    Normalize the tenant-level default reorder point to a non-negative integer.
    """
    try:
        value = int(getattr(tenant, "default_reorder_point", None) or 0)
    except (TypeError, ValueError):
        value = 0
    return max(value, 0)
