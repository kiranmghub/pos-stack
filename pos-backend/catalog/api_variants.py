# pos-backend/catalog/api_variants.py
from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from catalog.models import Variant

# copy the same tenant resolver approach used by counts API
from tenants.models import Tenant
from django.shortcuts import get_object_or_404


def _resolve_request_tenant(request):
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


class VariantSearchView(APIView):
    """
    GET /api/v1/catalog/variants?q=&limit=&store_id=
    Returns [{id, sku, barcode, product_name}]
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"results": []}, status=200)

        q = (request.GET.get("q") or "").strip()
        limit = int(request.GET.get("limit") or 8)
        store_id = request.GET.get("store_id")

        qs = Variant.objects.select_related("product").filter(product__tenant=tenant)

        if q:
            filt = Q(sku__icontains=q) | Q(product__name__icontains=q)
            # include barcode if field exists in your schema
            try:
                Variant._meta.get_field("barcode")
                filt |= Q(barcode__icontains=q)
            except Exception:
                pass
            qs = qs.filter(filt)

        # Optionally restrict to variants that exist in a given store’s inventory
        if store_id:
            qs = qs.filter(inventoryitem__store_id=store_id).distinct()

        rows = qs.order_by("product__name", "sku")[:limit]
        data = [
            {
                "id": v.id,
                "sku": v.sku,
                "barcode": getattr(v, "barcode", "") or "",
                "product_name": v.product.name,
            }
            for v in rows
        ]
        # UI accepts either bare array or {results:[]}; we return the latter.
        return Response({"results": data}, status=200)
