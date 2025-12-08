# analytics/api_inventory_health.py
"""
Inventory Health Analytics API endpoints.
"""
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from tenants.models import Tenant
from stores.models import Store
from analytics.inventory_analytics import (
    calculate_shrinkage,
    calculate_aging,
    calculate_count_coverage,
    get_inventory_health_summary,
)


def _resolve_request_tenant(request):
    """Resolve tenant from request"""
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


class ShrinkageReportView(APIView):
    """
    GET /api/v1/analytics/inventory/shrinkage?store_id=&days_back=&reason_code=
    
    Get shrinkage report with breakdown by reason.
    
    Query parameters:
    - store_id: Optional store ID to filter by store
    - days_back: Number of days to look back (optional, default: 90)
    - reason_code: Optional adjustment reason code to filter by
    
    Security:
    - Requires authentication
    - Tenant-scoped
    - Input validation
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)

        store_id = request.GET.get("store_id")
        days_back = int(request.GET.get("days_back") or "90")
        reason_code = request.GET.get("reason_code")

        # Validate days_back
        if days_back < 1 or days_back > 365:
            return Response({"error": "days_back must be between 1 and 365"}, status=400)

        # Validate store_id if provided
        if store_id:
            try:
                store_id = int(store_id)
                Store.objects.get(id=store_id, tenant=tenant, is_active=True)
            except (ValueError, TypeError):
                return Response({"error": "Invalid store_id"}, status=400)
            except Store.DoesNotExist:
                return Response({"error": "Store not found"}, status=404)

        try:
            report = calculate_shrinkage(
                tenant=tenant,
                store_id=store_id,
                days_back=days_back,
                reason_code=reason_code,
            )
            return Response(report, status=200)
        except Exception as e:
            return Response({"error": str(e)}, status=500)


class AgingReportView(APIView):
    """
    GET /api/v1/analytics/inventory/aging?store_id=&days_no_sales=
    
    Get aging inventory report (variants with no sales in X days).
    
    Query parameters:
    - store_id: Optional store ID to filter by store
    - days_no_sales: Number of days without sales to consider as aging (optional, default: 90)
    
    Security:
    - Requires authentication
    - Tenant-scoped
    - Input validation
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)

        store_id = request.GET.get("store_id")
        days_no_sales = int(request.GET.get("days_no_sales") or "90")

        # Validate days_no_sales
        if days_no_sales < 1 or days_no_sales > 365:
            return Response({"error": "days_no_sales must be between 1 and 365"}, status=400)

        # Validate store_id if provided
        if store_id:
            try:
                store_id = int(store_id)
                Store.objects.get(id=store_id, tenant=tenant, is_active=True)
            except (ValueError, TypeError):
                return Response({"error": "Invalid store_id"}, status=400)
            except Store.DoesNotExist:
                return Response({"error": "Store not found"}, status=404)

        try:
            report = calculate_aging(
                tenant=tenant,
                store_id=store_id,
                days_no_sales=days_no_sales,
            )
            return Response(report, status=200)
        except Exception as e:
            return Response({"error": str(e)}, status=500)


class CountCoverageView(APIView):
    """
    GET /api/v1/analytics/inventory/coverage?store_id=&days_back=
    
    Get cycle count coverage report (% of catalog counted).
    
    Query parameters:
    - store_id: Optional store ID to filter by store
    - days_back: Number of days to look back (optional, default: 90)
    
    Security:
    - Requires authentication
    - Tenant-scoped
    - Input validation
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)

        store_id = request.GET.get("store_id")
        days_back = int(request.GET.get("days_back") or "90")

        # Validate days_back
        if days_back < 1 or days_back > 365:
            return Response({"error": "days_back must be between 1 and 365"}, status=400)

        # Validate store_id if provided
        if store_id:
            try:
                store_id = int(store_id)
                Store.objects.get(id=store_id, tenant=tenant, is_active=True)
            except (ValueError, TypeError):
                return Response({"error": "Invalid store_id"}, status=400)
            except Store.DoesNotExist:
                return Response({"error": "Store not found"}, status=404)

        try:
            report = calculate_count_coverage(
                tenant=tenant,
                store_id=store_id,
                days_back=days_back,
            )
            return Response(report, status=200)
        except Exception as e:
            return Response({"error": str(e)}, status=500)


class InventoryHealthSummaryView(APIView):
    """
    GET /api/v1/analytics/inventory/health?store_id=&days_back=&aging_days=
    
    Get comprehensive inventory health summary (shrinkage, aging, coverage).
    
    Query parameters:
    - store_id: Optional store ID to filter by store
    - days_back: Number of days to look back for shrinkage/coverage (optional, default: 90)
    - aging_days: Number of days without sales to consider as aging (optional, default: 90)
    
    Security:
    - Requires authentication
    - Tenant-scoped
    - Input validation
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)

        store_id = request.GET.get("store_id")
        days_back = int(request.GET.get("days_back") or "90")
        aging_days = int(request.GET.get("aging_days") or "90")

        # Validate parameters
        if days_back < 1 or days_back > 365:
            return Response({"error": "days_back must be between 1 and 365"}, status=400)
        if aging_days < 1 or aging_days > 365:
            return Response({"error": "aging_days must be between 1 and 365"}, status=400)

        # Validate store_id if provided
        if store_id:
            try:
                store_id = int(store_id)
                Store.objects.get(id=store_id, tenant=tenant, is_active=True)
            except (ValueError, TypeError):
                return Response({"error": "Invalid store_id"}, status=400)
            except Store.DoesNotExist:
                return Response({"error": "Store not found"}, status=404)

        try:
            summary = get_inventory_health_summary(
                tenant=tenant,
                store_id=store_id,
                days_back=days_back,
                aging_days=aging_days,
            )
            return Response(summary, status=200)
        except Exception as e:
            return Response({"error": str(e)}, status=500)

