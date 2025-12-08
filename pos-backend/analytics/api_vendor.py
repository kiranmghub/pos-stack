# analytics/api_vendor.py
"""
Vendor analytics API endpoints.
"""
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from tenants.models import Tenant
from purchasing.models import Vendor
from analytics.vendor_analytics import get_vendor_scorecard


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


class VendorScorecardView(APIView):
    """
    GET /api/v1/analytics/vendors/<id>/scorecard?days_back=
    
    Get comprehensive vendor scorecard with all metrics.
    
    Query parameters:
    - days_back: Number of days to look back for metrics (optional, default: 90)
    
    Returns:
    - vendor_id: Vendor ID
    - vendor_name: Vendor name
    - on_time_performance: On-time delivery metrics
    - lead_time: Lead time metrics
    - fill_rate: Fill rate metrics
    - cost_variance: Cost variance metrics
    - overall_score: Overall vendor score (0-100)
    
    Security:
    - Requires authentication
    - Tenant-scoped (validates vendor belongs to tenant)
    - Input validation
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, id):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)

        days_back = request.GET.get("days_back", "90")

        # Validate and convert days_back
        try:
            days_back = int(days_back)
        except (ValueError, TypeError):
            return Response({"error": "days_back must be an integer"}, status=400)

        # Validate days_back range
        if days_back < 1 or days_back > 365:
            return Response({"error": "days_back must be between 1 and 365"}, status=400)

        # Validate vendor belongs to tenant
        try:
            vendor = Vendor.objects.get(id=id, tenant=tenant, is_active=True)
        except Vendor.DoesNotExist:
            return Response({"error": "Vendor not found"}, status=404)

        try:
            scorecard = get_vendor_scorecard(
                tenant=tenant,
                vendor_id=id,
                days_back=days_back,
            )
            
            if scorecard is None:
                return Response({"error": "Vendor not found"}, status=404)
            
            return Response(scorecard, status=200)
        except Exception as e:
            return Response({"error": str(e)}, status=500)

