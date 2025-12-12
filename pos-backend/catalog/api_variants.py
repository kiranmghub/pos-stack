# pos-backend/catalog/api_variants.py
from django.db.models import Q, Sum, Value, IntegerField
from django.db.models.functions import Coalesce
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from catalog.models import Variant
from inventory.models import InventoryItem

# copy the same tenant resolver approach used by counts API
from tenants.models import Tenant
from django.shortcuts import get_object_or_404
from inventory.utils import tenant_default_reorder_point


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
    Returns [{id, sku, barcode, product_name, on_hand, reorder_point}]
    
    Security: Tenant-scoped, validates store_id if provided
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"results": []}, status=200)

        q = (request.GET.get("q") or "").strip()
        limit = int(request.GET.get("limit") or 8)
        store_id = None
        
        # Validate store_id if provided
        store_id_param = request.GET.get("store_id")
        if store_id_param:
            try:
                from stores.models import Store
                store_id = int(store_id_param)
                # Validate store belongs to tenant
                Store.objects.get(id=store_id, tenant=tenant)
            except (ValueError, TypeError, Store.DoesNotExist):
                # Invalid store_id, ignore (don't filter by store)
                store_id = None

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

        rows = qs.order_by("product__name", "sku")[:limit]
        
        # Build variant IDs list for efficient stock lookup
        variant_ids = [v.id for v in rows]
        
        # Get stock totals per variant (store-specific if store_id provided)
        stock_qs = InventoryItem.objects.filter(
            variant_id__in=variant_ids,
            tenant=tenant
        )
        if store_id:
            stock_qs = stock_qs.filter(store_id=store_id)
        
        stock_totals = stock_qs.values("variant_id").annotate(
            total_on_hand=Coalesce(
                Sum("on_hand", output_field=IntegerField()),
                Value(0, output_field=IntegerField()),
                output_field=IntegerField()
            )
        )
        
        # Create lookup dict for O(1) access
        stock_map = {item["variant_id"]: int(item["total_on_hand"]) for item in stock_totals}
        
        # Get default reorder point for tenant (fallback if variant doesn't have one)
        default_reorder_point = tenant_default_reorder_point(tenant)
        
        data = []
        for v in rows:
            variant_id = v.id
            on_hand = stock_map.get(variant_id, 0)
            reorder_point = v.reorder_point if v.reorder_point is not None else default_reorder_point
            
            data.append({
                "id": variant_id,
                "sku": v.sku,
                "barcode": getattr(v, "barcode", "") or "",
                "product_name": v.product.name,
                "name": v.name,
                "on_hand": on_hand,
                "reorder_point": reorder_point if reorder_point is not None else None,
            })
        
        # UI accepts either bare array or {results:[]}; we return the latter.
        return Response({"results": data}, status=200)
