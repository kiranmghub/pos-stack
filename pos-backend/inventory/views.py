from django.shortcuts import render

# Create your views here.
# inventory/views.py (add)

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from common.api_mixins import IsInTenant  # allows any tenant member
from .models import InventoryItem


class LowStockView(APIView):
    permission_classes = [IsAuthenticated, IsInTenant]

    def get(self, request):
        limit = int(request.GET.get("limit", 5))
        # Use a simple threshold since InventoryItem has no 'min_stock'
        # You can later replace this with per-variant or per-store thresholds.
        threshold = int(request.GET.get("threshold", 5))

        qs = (
            InventoryItem.objects
            .filter(store__tenant=request.tenant)
            .filter(on_hand__lte=threshold)
            .select_related("store", "variant", "variant__product")
            .order_by("on_hand")[:limit]
        )

        out = []
        for it in qs:
            variant = getattr(it, "variant", None)
            product = getattr(variant, "product", None)
            sku = getattr(variant, "sku", "") or ""
            product_name = getattr(product, "name", "") or ""
            variant_label = product_name or sku or "Item"

            out.append({
                "store": it.store.name,
                "sku": sku,
                "variant": variant_label,
                "on_hand": it.on_hand,
                # Return the threshold under the same key the UI expects.
                "min_stock": threshold,
            })

        return Response(out)
