# analytics/api_reports.py
"""
Main report API endpoints.
All report endpoints inherit from BaseReportView which provides common functionality
including tenant scoping, date range validation, rate limiting, and caching.
"""
import logging
from datetime import timedelta, time, datetime
from typing import Optional
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from django.core.cache import cache
from django.db.models import Q, F, Sum, Count, Value, DecimalField
from django.db.models.functions import Coalesce

from common.permissions import IsOwnerOrAdmin
from analytics.reports.base import (
    _resolve_request_tenant,
    validate_store_access,
    get_cache_key,
    rate_limit_report,
    parse_date_range,
)
from analytics.metrics import _tenant_timezone
from analytics.reports.sales_reports import calculate_sales_summary
from analytics.reports.product_reports import calculate_product_performance
from analytics.reports.financial_reports import calculate_financial_summary
from analytics.reports.customer_reports import calculate_customer_analytics
from analytics.reports.employee_reports import calculate_employee_performance
from analytics.reports.returns_reports import calculate_returns_analysis
from orders.models import Sale
from orders.serializers import SaleListSerializer

logger = logging.getLogger(__name__)


class BaseReportView(APIView):
    """
    Base class for all report views.
    Provides common functionality:
    - Tenant scoping
    - Date range validation
    - Store access validation
    - Rate limiting
    - Error handling
    """
    permission_classes = [IsAuthenticated, IsOwnerOrAdmin]

    def dispatch(self, request, *args, **kwargs):
        """
        Override dispatch to add rate limiting and common error handling.
        """
        # Check rate limit
        if request.user and request.user.is_authenticated:
            is_over_limit, retry_after = rate_limit_report(
                user_id=request.user.id,
                limit=60,
                window_seconds=60
            )
            if is_over_limit:
                response = Response(
                    {"error": "Rate limit exceeded. Please try again later."},
                    status=status.HTTP_429_TOO_MANY_REQUESTS
                )
                if retry_after:
                    response["Retry-After"] = str(retry_after)
                logger.warning(
                    f"Rate limit exceeded for user {request.user.id} on report endpoint"
                )
                return response

        try:
            return super().dispatch(request, *args, **kwargs)
        except Exception as e:
            logger.error(
                f"Error in report view: {type(e).__name__}: {str(e)}",
                exc_info=True,
                extra={
                    "user_id": request.user.id if request.user else None,
                    "path": request.path,
                    "method": request.method,
                }
            )
            return Response(
                {"error": "An error occurred while generating the report. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def get_tenant(self, request):
        """Get tenant from request."""
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return None, Response(
                {"error": "No tenant"},
                status=status.HTTP_400_BAD_REQUEST
            )
        return tenant, None

    def get_date_range(self, request, max_days=365):
        """
        Parse and validate date range from request.
        
        Returns:
            Tuple of (date_from, date_to, error_response)
            If error_response is not None, validation failed
        """
        date_from = request.GET.get("date_from")
        date_to = request.GET.get("date_to")
        
        df, dt_, error_msg = parse_date_range(date_from, date_to, max_days=max_days)
        
        if error_msg:
            return None, None, Response(
                {"error": error_msg},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        return df, dt_, None

    def get_store(self, request, tenant):
        """
        Get and validate store from request.
        
        Returns:
            Tuple of (store, error_response)
            If error_response is not None, validation failed
            store can be None (meaning "all stores")
        """
        store_id = request.GET.get("store_id")
        if store_id:
            try:
                store_id = int(store_id)
            except (ValueError, TypeError):
                return None, Response(
                    {"error": "Invalid store_id"},
                    status=status.HTTP_400_BAD_REQUEST
                )
        else:
            store_id = None
        
        store, error_msg = validate_store_access(store_id, tenant)
        if error_msg:
            return None, Response(
                {"error": error_msg},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        return store, None

    def get_cache(self, report_type: str, tenant_id: int, params: dict):
        """Get cached report data."""
        cache_key = get_cache_key(report_type, tenant_id, params)
        return cache.get(cache_key)

    def set_cache(self, report_type: str, tenant_id: int, params: dict, data, timeout=300):
        """
        Cache report data.
        
        Args:
            report_type: Type of report
            tenant_id: Tenant ID
            params: Parameters dictionary
            data: Data to cache
            timeout: Cache timeout in seconds (default 5 minutes)
        """
        cache_key = get_cache_key(report_type, tenant_id, params)
        cache.set(cache_key, data, timeout=timeout)


class SalesSummaryReportView(BaseReportView):
    """
    GET /api/v1/analytics/reports/sales/summary
    
    Get sales summary report with aggregations, time series, and comparisons.
    
    Query parameters:
    - store_id: Optional store ID to filter by store
    - date_from: Start date (YYYY-MM-DD or ISO datetime)
    - date_to: End date (YYYY-MM-DD or ISO datetime)
    - group_by: Grouping period - "day", "week", or "month" (default: "day")
    
    Returns:
    - summary: Total revenue, order count, AOV, growth percentages
    - comparison: Previous period metrics
    - time_series: Array of data points by period
    - store_breakdown: Breakdown by store (if not filtering by specific store)
    - period: Period information
    
    Security:
    - Requires authentication
    - Owner/Admin only
    - Tenant-scoped
    - Rate limited (60 req/min)
    - Cached for 5 minutes
    """
    
    def get(self, request):
        # Get tenant
        tenant, error_response = self.get_tenant(request)
        if error_response:
            return error_response
        
        # Get tenant timezone (CRITICAL: Use tenant timezone, not Django TIME_ZONE which is UTC)
        tz = _tenant_timezone(request)
        
        # Get date range parameters
        date_from_param = request.GET.get("date_from")
        date_to_param = request.GET.get("date_to")
        
        # Parse dates as date objects (matches MetricsOverviewView pattern)
        d_from = parse_date(date_from_param) if date_from_param else None
        d_to = parse_date(date_to_param) if date_to_param else None
        
        # If dates not provided, default to last 30 days in tenant timezone
        if not d_from or not d_to:
            now = timezone.now()
            end_date = timezone.localtime(now, tz).date()
            start_date = end_date - timedelta(days=29)
            # Create datetime bounds in tenant timezone
            start_dt = timezone.make_aware(datetime.combine(start_date, time.min), tz)
            end_dt = timezone.make_aware(datetime.combine(end_date, time.max), tz)
        else:
            # Validate date range
            if d_from > d_to:
                return Response(
                    {"error": "date_from must be before or equal to date_to"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Create datetime bounds in TENANT timezone (critical for correct filtering)
            start_dt = timezone.make_aware(datetime.combine(d_from, time.min), tz)
            end_dt = timezone.make_aware(datetime.combine(d_to, time.max), tz)
        
        # Get and validate store
        store, error_response = self.get_store(request, tenant)
        if error_response:
            return error_response
        
        store_id = store.id if store else None
        
        # Get group_by parameter (default: "day")
        group_by = request.GET.get("group_by", "day").lower()
        if group_by not in ["day", "week", "month"]:
            return Response(
                {"error": "group_by must be 'day', 'week', or 'month'"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check cache
        cache_params = {
            "store_id": store_id,
            "date_from": start_dt.isoformat(),
            "date_to": end_dt.isoformat(),
            "group_by": group_by,
        }
        cached_data = self.get_cache("sales_summary", tenant.id, cache_params)
        if cached_data:
            logger.debug(f"Returning cached sales summary for tenant {tenant.id}")
            return Response(cached_data, status=status.HTTP_200_OK)
        
        try:
            # Calculate report (pass tenant timezone for proper date grouping)
            report_data = calculate_sales_summary(
                tenant=tenant,
                store_id=store_id,
                date_from=start_dt,
                date_to=end_dt,
                group_by=group_by,
                tz=tz,
            )
            
            # Add currency info to response
            currency_info = {
                "code": getattr(tenant, "resolved_currency", None) or getattr(tenant, "currency_code", "USD"),
                "symbol": getattr(tenant, "currency_symbol", None),
                "precision": getattr(tenant, "currency_precision", 2),
            }
            report_data["currency"] = currency_info
            
            # Cache the result
            self.set_cache("sales_summary", tenant.id, cache_params, report_data, timeout=300)
            
            return Response(report_data, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(
                f"Error calculating sales summary: {type(e).__name__}: {str(e)}",
                exc_info=True,
                extra={
                    "tenant_id": tenant.id,
                    "store_id": store_id,
                    "date_from": start_dt.isoformat() if start_dt else None,
                    "date_to": end_dt.isoformat() if end_dt else None,
                }
            )
            return Response(
                {"error": "An error occurred while generating the sales summary report."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class SalesDetailReportView(BaseReportView):
    """
    GET /api/v1/analytics/reports/sales/detail
    
    Get paginated list of sales with detailed information.
    
    Query parameters:
    - store_id: Optional store ID to filter by store
    - date_from: Start date (YYYY-MM-DD or ISO datetime)
    - date_to: End date (YYYY-MM-DD or ISO datetime)
    - status: Optional sale status filter (pending/completed/void)
    - page: Page number (default: 1)
    - page_size: Items per page (default: 100, max: 1000)
    
    Returns:
    - count: Total number of sales matching filters
    - page: Current page number
    - page_size: Items per page
    - total_pages: Total number of pages
    - results: Array of sale objects (using SaleListSerializer)
    - currency: Currency information for the tenant
    
    Security:
    - Requires authentication
    - Owner/Admin only
    - Tenant-scoped
    - Rate limited (60 req/min)
    """
    
    def get(self, request):
        # Get tenant
        tenant, error_response = self.get_tenant(request)
        if error_response:
            return error_response
        
        # Get tenant timezone (CRITICAL: Use tenant timezone, not Django TIME_ZONE which is UTC)
        tz = _tenant_timezone(request)
        
        # Get date range parameters
        date_from_param = request.GET.get("date_from")
        date_to_param = request.GET.get("date_to")
        
        # Parse dates as date objects (matches MetricsOverviewView pattern)
        d_from = parse_date(date_from_param) if date_from_param else None
        d_to = parse_date(date_to_param) if date_to_param else None
        
        # Get and validate store
        store, error_response = self.get_store(request, tenant)
        if error_response:
            return error_response
        
        store_id = store.id if store else None
        
        # Get status filter
        status_filter = request.GET.get("status", "").strip()
        valid_statuses = ["pending", "completed", "void"]
        if status_filter and status_filter.lower() not in valid_statuses:
            return Response(
                {"error": f"status must be one of: {', '.join(valid_statuses)}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get pagination parameters
        try:
            page = int(request.GET.get("page", 1))
            if page < 1:
                page = 1
        except (ValueError, TypeError):
            page = 1
        
        try:
            page_size = int(request.GET.get("page_size", 100))
            if page_size < 1:
                page_size = 100
            elif page_size > 1000:
                page_size = 1000  # Enforce max
        except (ValueError, TypeError):
            page_size = 100
        
        # Build queryset
        qs = Sale.objects.select_related("store", "cashier").filter(tenant=tenant)
        
        # Apply filters
        if store_id:
            qs = qs.filter(store_id=store_id)
        
        if status_filter:
            qs = qs.filter(status__iexact=status_filter)
        
        # If dates not provided, default to last 30 days in tenant timezone
        if not d_from or not d_to:
            now = timezone.now()
            end_date = timezone.localtime(now, tz).date()
            start_date = end_date - timedelta(days=29)
            # Create datetime bounds in tenant timezone
            start_dt = timezone.make_aware(datetime.combine(start_date, time.min), tz)
            end_dt = timezone.make_aware(datetime.combine(end_date, time.max), tz)
        else:
            # Validate date range
            if d_from > d_to:
                return Response(
                    {"error": "date_from must be before or equal to date_to"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Create datetime bounds in TENANT timezone (critical for correct filtering)
            start_dt = timezone.make_aware(datetime.combine(d_from, time.min), tz)
            end_dt = timezone.make_aware(datetime.combine(d_to, time.max), tz)
        
        # Apply date filters (created_at is stored in UTC, comparison works correctly)
        qs = qs.filter(created_at__gte=start_dt)
        qs = qs.filter(created_at__lte=end_dt)
        
        # Add annotations (same as SalesListView)
        zero = Value(0, output_field=DecimalField(max_digits=12, decimal_places=2))
        qs = qs.annotate(
            lines_count=Coalesce(Count("lines", distinct=True), 0),
            subtotal=Coalesce(
                Sum(
                    F("lines__line_total")
                    + F("lines__discount")
                    - F("lines__tax")
                    - F("lines__fee"),
                    output_field=DecimalField(max_digits=12, decimal_places=2),
                ),
                zero,
            ),
            discount_total=Coalesce(Sum("lines__discount", output_field=DecimalField(max_digits=12, decimal_places=2)), zero),
            tax_total=Coalesce(Sum("lines__tax", output_field=DecimalField(max_digits=12, decimal_places=2)), zero),
            fee_total=Coalesce(Sum("lines__fee", output_field=DecimalField(max_digits=12, decimal_places=2)), zero),
            total_returns=Coalesce(Count("returns", distinct=True), 0),
        ).order_by("-created_at", "-id")
        
        # Get total count before pagination
        total_count = qs.count()
        
        # Calculate pagination
        start = (page - 1) * page_size
        end = start + page_size
        total_pages = (total_count + page_size - 1) // page_size if total_count > 0 else 0
        
        # Get paginated results
        paginated_qs = qs[start:end]
        
        # Serialize results
        serializer = SaleListSerializer(
            paginated_qs,
            many=True,
            context={"request": request}
        )
        
        # Get currency info
        currency_info = {
            "code": getattr(tenant, "resolved_currency", None) or getattr(tenant, "currency_code", "USD"),
            "symbol": getattr(tenant, "currency_symbol", None),
            "precision": getattr(tenant, "currency_precision", 2),
        }
        
        return Response({
            "count": total_count,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "results": serializer.data,
            "currency": currency_info,
        }, status=status.HTTP_200_OK)


class ProductPerformanceReportView(BaseReportView):
    """
    GET /api/v1/analytics/reports/products/performance
    
    Get product performance report with top products by revenue and quantity.
    
    Query parameters:
    - store_id: Optional store ID to filter by store
    - date_from: Start date (YYYY-MM-DD or ISO datetime)
    - date_to: End date (YYYY-MM-DD or ISO datetime)
    - limit: Maximum number of products to return (default: 50, max: 500)
    - sort_by: Sort field - "revenue" or "quantity" (default: "revenue")
    
    Returns:
    - top_products_by_revenue: List of top products sorted by revenue
    - top_products_by_quantity: List of top products sorted by quantity
    - summary: Total products sold, total revenue, total quantity
    - filters: Applied filter parameters
    - currency: Currency information for the tenant
    
    Security:
    - Requires authentication
    - Owner/Admin only
    - Tenant-scoped
    - Rate limited (60 req/min)
    - Cached for 5 minutes
    """
    
    def get(self, request):
        # Get tenant
        tenant, error_response = self.get_tenant(request)
        if error_response:
            return error_response
        
        # Get tenant timezone (CRITICAL: Use tenant timezone, not Django TIME_ZONE which is UTC)
        tz = _tenant_timezone(request)
        
        # Get date range parameters
        date_from_param = request.GET.get("date_from")
        date_to_param = request.GET.get("date_to")
        
        # Parse dates as date objects (matches MetricsOverviewView pattern)
        d_from = parse_date(date_from_param) if date_from_param else None
        d_to = parse_date(date_to_param) if date_to_param else None
        
        # If dates not provided, default to last 30 days in tenant timezone
        if not d_from or not d_to:
            now = timezone.now()
            end_date = timezone.localtime(now, tz).date()
            start_date = end_date - timedelta(days=29)
            # Create datetime bounds in tenant timezone
            start_dt = timezone.make_aware(datetime.combine(start_date, time.min), tz)
            end_dt = timezone.make_aware(datetime.combine(end_date, time.max), tz)
        else:
            # Validate date range
            if d_from > d_to:
                return Response(
                    {"error": "date_from must be before or equal to date_to"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Create datetime bounds in TENANT timezone (critical for correct filtering)
            start_dt = timezone.make_aware(datetime.combine(d_from, time.min), tz)
            end_dt = timezone.make_aware(datetime.combine(d_to, time.max), tz)
        
        # Get and validate store
        store, error_response = self.get_store(request, tenant)
        if error_response:
            return error_response
        
        store_id = store.id if store else None
        
        # Get limit parameter (default: 50, max: 500)
        try:
            limit = int(request.GET.get("limit", 50))
            limit = max(1, min(limit, 500))  # Between 1 and 500
        except (ValueError, TypeError):
            limit = 50
        
        # Get sort_by parameter (default: "revenue")
        sort_by = request.GET.get("sort_by", "revenue").lower()
        if sort_by not in ["revenue", "quantity"]:
            return Response(
                {"error": "sort_by must be 'revenue' or 'quantity'"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check cache
        cache_params = {
            "store_id": store_id,
            "date_from": start_dt.isoformat(),
            "date_to": end_dt.isoformat(),
            "limit": limit,
            "sort_by": sort_by,
        }
        cached_data = self.get_cache("product_performance", tenant.id, cache_params)
        if cached_data:
            logger.debug(f"Returning cached product performance for tenant {tenant.id}")
            return Response(cached_data, status=status.HTTP_200_OK)
        
        try:
            # Calculate report
            report_data = calculate_product_performance(
                tenant=tenant,
                store_id=store_id,
                date_from=start_dt,
                date_to=end_dt,
                limit=limit,
                sort_by=sort_by,
                tz=tz,
            )
            
            # Add currency info to response
            currency_info = {
                "code": getattr(tenant, "resolved_currency", None) or getattr(tenant, "currency_code", "USD"),
                "symbol": getattr(tenant, "currency_symbol", None),
                "precision": getattr(tenant, "currency_precision", 2),
            }
            report_data["currency"] = currency_info
            
            # Cache the result
            self.set_cache("product_performance", tenant.id, cache_params, report_data, timeout=300)
            
            return Response(report_data, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(
                f"Error calculating product performance: {type(e).__name__}: {str(e)}",
                exc_info=True,
                extra={
                    "tenant_id": tenant.id,
                    "store_id": store_id,
                    "date_from": start_dt.isoformat() if start_dt else None,
                    "date_to": end_dt.isoformat() if end_dt else None,
                    "limit": limit,
                    "sort_by": sort_by,
                }
            )
            return Response(
                {"error": "An error occurred while generating the product performance report."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class FinancialSummaryReportView(BaseReportView):
    """
    GET /api/v1/analytics/reports/financial/summary
    
    Get financial summary report with revenue, discounts, taxes, and payment method breakdowns.
    
    Query parameters:
    - store_id: Optional store ID to filter by store
    - date_from: Start date (YYYY-MM-DD or ISO datetime)
    - date_to: End date (YYYY-MM-DD or ISO datetime)
    
    Returns:
    - summary: Total revenue, discounts, taxes, fees, net revenue, percentages
    - payment_methods: Breakdown by payment method (CASH, CARD, OTHER)
    - discount_rules: Breakdown by discount rule (from receipt_data)
    - tax_rules: Breakdown by tax rule (from receipt_data)
    - filters: Applied filter parameters
    - currency: Currency information for the tenant
    
    Security:
    - Requires authentication
    - Owner/Admin only
    - Tenant-scoped
    - Rate limited (60 req/min)
    - Cached for 5 minutes
    """
    
    def get(self, request):
        # Get tenant
        tenant, error_response = self.get_tenant(request)
        if error_response:
            return error_response
        
        # Get tenant timezone (CRITICAL: Use tenant timezone, not Django TIME_ZONE which is UTC)
        tz = _tenant_timezone(request)
        
        # Get date range parameters
        date_from_param = request.GET.get("date_from")
        date_to_param = request.GET.get("date_to")
        
        # Parse dates as date objects (matches MetricsOverviewView pattern)
        d_from = parse_date(date_from_param) if date_from_param else None
        d_to = parse_date(date_to_param) if date_to_param else None
        
        # If dates not provided, default to last 30 days in tenant timezone
        if not d_from or not d_to:
            now = timezone.now()
            end_date = timezone.localtime(now, tz).date()
            start_date = end_date - timedelta(days=29)
            # Create datetime bounds in tenant timezone
            start_dt = timezone.make_aware(datetime.combine(start_date, time.min), tz)
            end_dt = timezone.make_aware(datetime.combine(end_date, time.max), tz)
        else:
            # Validate date range
            if d_from > d_to:
                return Response(
                    {"error": "date_from must be before or equal to date_to"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Create datetime bounds in TENANT timezone (critical for correct filtering)
            start_dt = timezone.make_aware(datetime.combine(d_from, time.min), tz)
            end_dt = timezone.make_aware(datetime.combine(d_to, time.max), tz)
        
        # Get and validate store
        store, error_response = self.get_store(request, tenant)
        if error_response:
            return error_response
        
        store_id = store.id if store else None
        
        # Check cache
        cache_params = {
            "store_id": store_id,
            "date_from": start_dt.isoformat(),
            "date_to": end_dt.isoformat(),
        }
        cached_data = self.get_cache("financial_summary", tenant.id, cache_params)
        if cached_data:
            logger.debug(f"Returning cached financial summary for tenant {tenant.id}")
            return Response(cached_data, status=status.HTTP_200_OK)
        
        try:
            # Calculate report
            report_data = calculate_financial_summary(
                tenant=tenant,
                store_id=store_id,
                date_from=start_dt,
                date_to=end_dt,
                tz=tz,
            )
            
            # Add currency info to response
            currency_info = {
                "code": getattr(tenant, "resolved_currency", None) or getattr(tenant, "currency_code", "USD"),
                "symbol": getattr(tenant, "currency_symbol", None),
                "precision": getattr(tenant, "currency_precision", 2),
            }
            report_data["currency"] = currency_info
            
            # Cache the result
            self.set_cache("financial_summary", tenant.id, cache_params, report_data, timeout=300)
            
            return Response(report_data, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(
                f"Error calculating financial summary: {type(e).__name__}: {str(e)}",
                exc_info=True,
                extra={
                    "tenant_id": tenant.id,
                    "store_id": store_id,
                    "date_from": start_dt.isoformat() if start_dt else None,
                    "date_to": end_dt.isoformat() if end_dt else None,
                }
            )
            return Response(
                {"error": "An error occurred while generating the financial summary report."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class CustomerAnalyticsReportView(BaseReportView):
    """
    GET /api/v1/analytics/reports/customers/analytics
    
    Get customer analytics report with top customers, lifetime value, and repeat customer metrics.
    
    Query parameters:
    - store_id: Optional store ID to filter by store
    - date_from: Start date (YYYY-MM-DD or ISO datetime)
    - date_to: End date (YYYY-MM-DD or ISO datetime)
    - limit: Maximum number of customers to return (default: 50, max: 500)
    
    Returns:
    - top_customers: List of top customers by revenue
    - summary: Customer metrics (total, new, returning, repeat rate)
    - lifetime_value_stats: Average lifetime value metrics
    - filters: Applied filter parameters
    - currency: Currency information for the tenant
    
    Security:
    - Requires authentication
    - Owner/Admin only
    - Tenant-scoped
    - Rate limited (60 req/min)
    - Cached for 5 minutes
    """
    
    def get(self, request):
        # Get tenant
        tenant, error_response = self.get_tenant(request)
        if error_response:
            return error_response
        
        # Get tenant timezone (CRITICAL: Use tenant timezone, not Django TIME_ZONE which is UTC)
        tz = _tenant_timezone(request)
        
        # Get date range parameters
        date_from_param = request.GET.get("date_from")
        date_to_param = request.GET.get("date_to")
        
        # Parse dates as date objects (matches MetricsOverviewView pattern)
        d_from = parse_date(date_from_param) if date_from_param else None
        d_to = parse_date(date_to_param) if date_to_param else None
        
        # If dates not provided, default to last 30 days in tenant timezone
        if not d_from or not d_to:
            now = timezone.now()
            end_date = timezone.localtime(now, tz).date()
            start_date = end_date - timedelta(days=29)
            # Create datetime bounds in tenant timezone
            start_dt = timezone.make_aware(datetime.combine(start_date, time.min), tz)
            end_dt = timezone.make_aware(datetime.combine(end_date, time.max), tz)
        else:
            # Validate date range
            if d_from > d_to:
                return Response(
                    {"error": "date_from must be before or equal to date_to"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Create datetime bounds in TENANT timezone (critical for correct filtering)
            start_dt = timezone.make_aware(datetime.combine(d_from, time.min), tz)
            end_dt = timezone.make_aware(datetime.combine(d_to, time.max), tz)
        
        # Get and validate store
        store, error_response = self.get_store(request, tenant)
        if error_response:
            return error_response
        
        store_id = store.id if store else None
        
        # Get limit parameter (default: 50, max: 500)
        try:
            limit = int(request.GET.get("limit", 50))
            limit = max(1, min(limit, 500))  # Between 1 and 500
        except (ValueError, TypeError):
            limit = 50
        
        # Check cache
        cache_params = {
            "store_id": store_id,
            "date_from": start_dt.isoformat(),
            "date_to": end_dt.isoformat(),
            "limit": limit,
        }
        cached_data = self.get_cache("customer_analytics", tenant.id, cache_params)
        if cached_data:
            logger.debug(f"Returning cached customer analytics for tenant {tenant.id}")
            return Response(cached_data, status=status.HTTP_200_OK)
        
        try:
            # Calculate report
            report_data = calculate_customer_analytics(
                tenant=tenant,
                store_id=store_id,
                date_from=start_dt,
                date_to=end_dt,
                limit=limit,
                tz=tz,
            )
            
            # Add currency info to response
            currency_info = {
                "code": getattr(tenant, "resolved_currency", None) or getattr(tenant, "currency_code", "USD"),
                "symbol": getattr(tenant, "currency_symbol", None),
                "precision": getattr(tenant, "currency_precision", 2),
            }
            report_data["currency"] = currency_info
            
            # Cache the result
            self.set_cache("customer_analytics", tenant.id, cache_params, report_data, timeout=300)
            
            return Response(report_data, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(
                f"Error calculating customer analytics: {type(e).__name__}: {str(e)}",
                exc_info=True,
                extra={
                    "tenant_id": tenant.id,
                    "store_id": store_id,
                    "date_from": start_dt.isoformat() if start_dt else None,
                    "date_to": end_dt.isoformat() if end_dt else None,
                    "limit": limit,
                }
            )
            return Response(
                {"error": "An error occurred while generating the customer analytics report."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class EmployeePerformanceReportView(BaseReportView):
    """
    GET /api/v1/analytics/reports/employees/performance
    
    Get employee performance report with sales by cashier, transaction counts, and return rates.
    
    Query parameters:
    - store_id: Optional store ID to filter by store
    - date_from: Start date (YYYY-MM-DD or ISO datetime)
    - date_to: End date (YYYY-MM-DD or ISO datetime)
    - limit: Maximum number of employees to return (default: 50, max: 500)
    
    Returns:
    - top_employees: List of top employees by revenue
    - summary: Employee metrics (total employees, transactions, return rate)
    - filters: Applied filter parameters
    - currency: Currency information for the tenant
    
    Security:
    - Requires authentication
    - Owner/Admin only
    - Tenant-scoped
    - Rate limited (60 req/min)
    - Cached for 5 minutes
    """
    
    def get(self, request):
        # Get tenant
        tenant, error_response = self.get_tenant(request)
        if error_response:
            return error_response
        
        # Get tenant timezone (CRITICAL: Use tenant timezone, not Django TIME_ZONE which is UTC)
        tz = _tenant_timezone(request)
        
        # Get date range parameters
        date_from_param = request.GET.get("date_from")
        date_to_param = request.GET.get("date_to")
        
        # Parse dates as date objects (matches MetricsOverviewView pattern)
        d_from = parse_date(date_from_param) if date_from_param else None
        d_to = parse_date(date_to_param) if date_to_param else None
        
        # If dates not provided, default to last 30 days in tenant timezone
        if not d_from or not d_to:
            now = timezone.now()
            end_date = timezone.localtime(now, tz).date()
            start_date = end_date - timedelta(days=29)
            # Create datetime bounds in tenant timezone
            start_dt = timezone.make_aware(datetime.combine(start_date, time.min), tz)
            end_dt = timezone.make_aware(datetime.combine(end_date, time.max), tz)
        else:
            # Validate date range
            if d_from > d_to:
                return Response(
                    {"error": "date_from must be before or equal to date_to"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Create datetime bounds in TENANT timezone (critical for correct filtering)
            start_dt = timezone.make_aware(datetime.combine(d_from, time.min), tz)
            end_dt = timezone.make_aware(datetime.combine(d_to, time.max), tz)
        
        # Get and validate store
        store, error_response = self.get_store(request, tenant)
        if error_response:
            return error_response
        
        store_id = store.id if store else None
        
        # Get limit parameter (default: 50, max: 500)
        try:
            limit = int(request.GET.get("limit", 50))
            limit = max(1, min(limit, 500))  # Between 1 and 500
        except (ValueError, TypeError):
            limit = 50
        
        # Check cache
        cache_params = {
            "store_id": store_id,
            "date_from": start_dt.isoformat(),
            "date_to": end_dt.isoformat(),
            "limit": limit,
        }
        cached_data = self.get_cache("employee_performance", tenant.id, cache_params)
        if cached_data:
            logger.debug(f"Returning cached employee performance for tenant {tenant.id}")
            return Response(cached_data, status=status.HTTP_200_OK)
        
        try:
            # Calculate report
            report_data = calculate_employee_performance(
                tenant=tenant,
                store_id=store_id,
                date_from=start_dt,
                date_to=end_dt,
                limit=limit,
                tz=tz,
            )
            
            # Add currency info to response
            currency_info = {
                "code": getattr(tenant, "resolved_currency", None) or getattr(tenant, "currency_code", "USD"),
                "symbol": getattr(tenant, "currency_symbol", None),
                "precision": getattr(tenant, "currency_precision", 2),
            }
            report_data["currency"] = currency_info
            
            # Cache the result
            self.set_cache("employee_performance", tenant.id, cache_params, report_data, timeout=300)
            
            return Response(report_data, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(
                f"Error calculating employee performance: {type(e).__name__}: {str(e)}",
                exc_info=True,
                extra={
                    "tenant_id": tenant.id,
                    "store_id": store_id,
                    "date_from": start_dt.isoformat() if start_dt else None,
                    "date_to": end_dt.isoformat() if end_dt else None,
                    "limit": limit,
                }
            )
            return Response(
                {"error": "An error occurred while generating the employee performance report."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ReturnsAnalysisReportView(BaseReportView):
    """
    GET /api/v1/analytics/reports/returns/analysis
    
    Get returns analysis report with return rates, refunds, and breakdowns by reason and disposition.
    
    Query parameters:
    - store_id: Optional store ID to filter by store
    - date_from: Start date (YYYY-MM-DD or ISO datetime)
    - date_to: End date (YYYY-MM-DD or ISO datetime)
    
    Returns:
    - summary: Total returns, refunded amount, return rate
    - reason_breakdown: Breakdown by reason code
    - disposition_breakdown: Breakdown by disposition (RESTOCK/WASTE/PENDING)
    - status_breakdown: Breakdown by return status
    - filters: Applied filter parameters
    - currency: Currency information for the tenant
    
    Security:
    - Requires authentication
    - Owner/Admin only
    - Tenant-scoped
    - Rate limited (60 req/min)
    - Cached for 5 minutes
    """
    
    def get(self, request):
        # Get tenant
        tenant, error_response = self.get_tenant(request)
        if error_response:
            return error_response
        
        # Get tenant timezone (CRITICAL: Use tenant timezone, not Django TIME_ZONE which is UTC)
        tz = _tenant_timezone(request)
        
        # Get date range parameters
        date_from_param = request.GET.get("date_from")
        date_to_param = request.GET.get("date_to")
        
        # Parse dates as date objects (matches MetricsOverviewView pattern)
        d_from = parse_date(date_from_param) if date_from_param else None
        d_to = parse_date(date_to_param) if date_to_param else None
        
        # If dates not provided, default to last 30 days in tenant timezone
        if not d_from or not d_to:
            now = timezone.now()
            end_date = timezone.localtime(now, tz).date()
            start_date = end_date - timedelta(days=29)
            # Create datetime bounds in tenant timezone
            start_dt = timezone.make_aware(datetime.combine(start_date, time.min), tz)
            end_dt = timezone.make_aware(datetime.combine(end_date, time.max), tz)
        else:
            # Validate date range
            if d_from > d_to:
                return Response(
                    {"error": "date_from must be before or equal to date_to"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Create datetime bounds in TENANT timezone (critical for correct filtering)
            start_dt = timezone.make_aware(datetime.combine(d_from, time.min), tz)
            end_dt = timezone.make_aware(datetime.combine(d_to, time.max), tz)
        
        # Get and validate store
        store, error_response = self.get_store(request, tenant)
        if error_response:
            return error_response
        
        store_id = store.id if store else None
        
        # Check cache
        cache_params = {
            "store_id": store_id,
            "date_from": start_dt.isoformat(),
            "date_to": end_dt.isoformat(),
        }
        cached_data = self.get_cache("returns_analysis", tenant.id, cache_params)
        if cached_data:
            logger.debug(f"Returning cached returns analysis for tenant {tenant.id}")
            return Response(cached_data, status=status.HTTP_200_OK)
        
        try:
            # Calculate report
            report_data = calculate_returns_analysis(
                tenant=tenant,
                store_id=store_id,
                date_from=start_dt,
                date_to=end_dt,
                tz=tz,
            )
            
            # Add currency info to response
            currency_info = {
                "code": getattr(tenant, "resolved_currency", None) or getattr(tenant, "currency_code", "USD"),
                "symbol": getattr(tenant, "currency_symbol", None),
                "precision": getattr(tenant, "currency_precision", 2),
            }
            report_data["currency"] = currency_info
            
            # Cache the result
            self.set_cache("returns_analysis", tenant.id, cache_params, report_data, timeout=300)
            
            return Response(report_data, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(
                f"Error calculating returns analysis: {type(e).__name__}: {str(e)}",
                exc_info=True,
                extra={
                    "tenant_id": tenant.id,
                    "store_id": store_id,
                    "date_from": start_dt.isoformat() if start_dt else None,
                    "date_to": end_dt.isoformat() if end_dt else None,
                }
            )
            return Response(
                {"error": "An error occurred while generating the returns analysis report."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
