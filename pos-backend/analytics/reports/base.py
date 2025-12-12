# analytics/reports/base.py
"""
Base utilities and helpers for report generation.
Provides common functionality for date parsing, tenant scoping, validation, and caching.
"""
from datetime import datetime, date, time
from typing import Optional, Tuple
from django.utils import timezone
from django.core.cache import cache
from django.conf import settings
from dateutil.parser import parse as parse_datetime
from django.utils.dateparse import parse_date as django_parse_date
from stores.models import Store
from tenants.models import Tenant
import hashlib
import json


def _resolve_request_tenant(request):
    """
    Resolve tenant from request.
    Reusable pattern from analytics/api_vendor.py and analytics/api_inventory_health.py
    """
    from django.shortcuts import get_object_or_404
    t = getattr(request, "tenant", None)
    if t:
        return t
    payload = getattr(request, "auth", None)
    if isinstance(payload, dict) and payload.get("tenant_id"):
        return get_object_or_404(Tenant, id=payload["tenant_id"])
    user = getattr(request, "user", None)
    if user is not None:
        if getattr(user, "tenant", None):
            return user.tenant
        if getattr(user, "active_tenant", None):
            return user.active_tenant
    return None


def _tenant_timezone(request):
    """
    Get tenant's timezone.
    Reuses pattern from analytics/metrics.py
    """
    tz_name = None
    tenant = getattr(request, "tenant", None)
    if tenant:
        tz_name = getattr(tenant, "timezone", None) or getattr(tenant, "tz", None)
        if not tz_name:
            try:
                from stores.models import Store
                tz_name = (
                    Store.objects.filter(tenant=tenant, timezone__isnull=False, timezone__gt="")
                    .values_list("timezone", flat=True)
                    .first()
                )
            except Exception:
                tz_name = None
    if not tz_name:
        tz_name = getattr(settings, "TIME_ZONE", "UTC")
    try:
        return timezone.pytz.timezone(tz_name)
    except Exception:
        return timezone.utc


def parse_date_range(
    date_from: Optional[str],
    date_to: Optional[str],
    max_days: int = 365,
    min_days: int = 1,
) -> Tuple[Optional[datetime], Optional[datetime], Optional[str]]:
    """
    Parse and validate date range parameters.
    
    Args:
        date_from: ISO date string or YYYY-MM-DD
        date_to: ISO date string or YYYY-MM-DD
        max_days: Maximum allowed days in range (default 365)
        min_days: Minimum allowed days in range (default 1)
    
    Returns:
        Tuple of (date_from_dt, date_to_dt, error_message)
        If error_message is not None, the dates are invalid
    """
    def _to_aware_dt(val: Optional[str], end_of_day: bool) -> Optional[datetime]:
        """Parse ISO datetime or YYYY-MM-DD; make timezone-aware."""
        if not val:
            return None
        dt = parse_datetime(val)
        if dt is None:
            try:
                d = django_parse_date(val)
                if not d:
                    return None
                # Expand bare date to local day bounds
                naive = datetime.combine(d, time.max if end_of_day else time.min)
                return timezone.make_aware(naive, timezone.get_current_timezone())
            except (ValueError, TypeError):
                return None
        # If a datetime was provided but is naive, localize it; otherwise keep its tzinfo
        return timezone.make_aware(dt, timezone.get_current_timezone()) if timezone.is_naive(dt) else dt

    df = _to_aware_dt(date_from, end_of_day=False)
    dt_ = _to_aware_dt(date_to, end_of_day=True)

    # Validate both dates are provided or neither (both None is valid - means no date filter)
    if (df is None) != (dt_ is None):
        return None, None, "Both date_from and date_to must be provided together, or neither"

    # Validate date range only if both dates are provided
    if df and dt_:
        if df > dt_:
            return None, None, "date_from must be before or equal to date_to"
        
        days_diff = (dt_ - df).days
        if days_diff > max_days:
            return None, None, f"Date range cannot exceed {max_days} days"
        if days_diff < 0:
            return None, None, "Invalid date range"

    # Return dates (both may be None, which is valid - means no date filtering)
    return df, dt_, None


def validate_store_access(store_id: Optional[int], tenant: Tenant) -> Tuple[Optional[Store], Optional[str]]:
    """
    Validate that store belongs to tenant.
    
    Args:
        store_id: Store ID to validate (None is allowed for "all stores")
        tenant: Tenant object
    
    Returns:
        Tuple of (store, error_message)
        If error_message is not None, validation failed
    """
    if store_id is None:
        return None, None  # None means "all stores"
    
    try:
        store_id = int(store_id)
    except (ValueError, TypeError):
        return None, "Invalid store_id"
    
    try:
        store = Store.objects.get(id=store_id, tenant=tenant, is_active=True)
        return store, None
    except Store.DoesNotExist:
        return None, f"Store {store_id} not found or does not belong to tenant"


def get_cache_key(report_type: str, tenant_id: int, params: dict) -> str:
    """
    Generate cache key for report data.
    
    Args:
        report_type: Type of report (e.g., 'sales_summary')
        tenant_id: Tenant ID
        params: Dictionary of parameters (will be hashed)
    
    Returns:
        Cache key string
    """
    # Sort params for consistent hashing
    params_str = json.dumps(params, sort_keys=True)
    params_hash = hashlib.md5(params_str.encode()).hexdigest()[:8]
    return f"report:{report_type}:{tenant_id}:{params_hash}"


def rate_limit_report(user_id: int, limit: int = 60, window_seconds: int = 60) -> Tuple[bool, Optional[int]]:
    """
    Check rate limit for report requests.
    Returns True if over limit, False otherwise.
    Also returns retry_after seconds if over limit.
    
    Args:
        user_id: User ID
        limit: Maximum requests allowed (default 60)
        window_seconds: Time window in seconds (default 60)
    
    Returns:
        Tuple of (is_over_limit, retry_after_seconds)
    """
    key = f"rate_limit:reports:user:{user_id}"
    current = cache.get(key)
    
    if current is None:
        cache.set(key, 1, timeout=window_seconds)
        return False, None
    
    current = current + 1
    cache.set(key, current, timeout=window_seconds)
    
    if current > limit:
        # Calculate retry after based on remaining window
        # This is approximate since we don't track exact request times
        return True, window_seconds
    
    return False, None

