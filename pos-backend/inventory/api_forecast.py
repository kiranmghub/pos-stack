# inventory/api_forecast.py
"""
Forecasting API endpoints for predictive reorder calculations.
"""
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from tenants.models import Tenant
from stores.models import Store
from catalog.models import Variant
from inventory.models import InventoryItem
from analytics.forecast import get_reorder_forecast, calculate_sales_velocity


def _resolve_request_tenant(request):
    """Resolve tenant from request (reuse pattern from inventory/api.py)"""
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


class ReorderForecastView(APIView):
    """
    GET /api/v1/inventory/reorder_forecast?variant_id=&store_id=&window_days=
    
    Get reorder forecast for a specific variant at a store.
    Returns predicted stockout date, recommended order quantity, and confidence score.
    
    Query parameters:
    - variant_id: Variant ID (required)
    - store_id: Store ID (required)
    - window_days: Days to look back for sales velocity (optional, default: 30)
    
    Security:
    - Requires authentication
    - Tenant-scoped (validates variant and store belong to tenant)
    - Input validation
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)

        variant_id = request.GET.get("variant_id")
        store_id = request.GET.get("store_id")
        window_days = request.GET.get("window_days", "30")

        # Validate required parameters
        if not variant_id:
            return Response({"error": "variant_id required"}, status=400)
        if not store_id:
            return Response({"error": "store_id required"}, status=400)

        # Validate and convert parameters
        try:
            variant_id = int(variant_id)
            store_id = int(store_id)
            window_days = int(window_days)
        except (ValueError, TypeError):
            return Response({"error": "variant_id, store_id, and window_days must be integers"}, status=400)

        # Validate window_days range
        if window_days < 1 or window_days > 365:
            return Response({"error": "window_days must be between 1 and 365"}, status=400)

        # Validate variant belongs to tenant
        try:
            variant = Variant.objects.get(id=variant_id, product__tenant=tenant, is_active=True)
        except Variant.DoesNotExist:
            return Response({"error": "Variant not found"}, status=404)

        # Validate store belongs to tenant
        try:
            store = Store.objects.get(id=store_id, tenant=tenant, is_active=True)
        except Store.DoesNotExist:
            return Response({"error": "Store not found"}, status=404)

        try:
            forecast = get_reorder_forecast(
                tenant=tenant,
                variant_id=variant_id,
                store_id=store_id,
                window_days=window_days,
            )
            return Response(forecast, status=200)
        except Exception as e:
            return Response({"error": str(e)}, status=500)


class AtRiskItemsView(APIView):
    """
    GET /api/v1/inventory/at_risk_items?store_id=&limit=&min_confidence=
    
    Get list of items at risk of stockout (predicted within 30 days).
    
    Query parameters:
    - store_id: Store ID (optional, filters by store)
    - limit: Maximum number of items to return (optional, default: 50)
    - min_confidence: Minimum confidence score (0-1) (optional, default: 0.1)
    
    Security:
    - Requires authentication
    - Tenant-scoped
    - Input validation
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"results": [], "count": 0}, status=200)

        store_id = request.GET.get("store_id")
        limit = int(request.GET.get("limit") or "50")
        min_confidence = float(request.GET.get("min_confidence") or "0.1")

        # Validate limit
        if limit < 1 or limit > 200:
            limit = 50

        # Validate min_confidence
        if min_confidence < 0 or min_confidence > 1:
            min_confidence = 0.1

        # Get inventory items for tenant/store
        items_qs = InventoryItem.objects.filter(tenant=tenant).select_related("variant", "variant__product", "store")
        if store_id:
            try:
                items_qs = items_qs.filter(store_id=int(store_id))
            except (ValueError, TypeError):
                pass

        # Calculate forecasts for each item
        at_risk_items = []
        for item in items_qs[:limit * 2]:  # Check more items than limit to account for filtering
            try:
                forecast = get_reorder_forecast(
                    tenant=tenant,
                    variant_id=item.variant_id,
                    store_id=item.store_id,
                    window_days=30,
                )

                # Only include items that are at risk and meet confidence threshold
                if forecast.get("is_at_risk") and forecast.get("confidence_score", 0) >= min_confidence:
                    at_risk_items.append(forecast)

                # Stop if we have enough items
                if len(at_risk_items) >= limit:
                    break
            except Exception:
                # Skip items that fail to calculate forecast
                continue

        # Sort by days_until_stockout (ascending - most urgent first)
        at_risk_items.sort(key=lambda x: x.get("days_until_stockout") or 999)

        return Response({
            "results": at_risk_items[:limit],
            "count": len(at_risk_items[:limit]),
        }, status=200)

