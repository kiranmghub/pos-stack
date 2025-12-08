from django.shortcuts import render

# Create your views here.
# inventory/views.py (add)

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import IntegerField, Value, F
from django.db.models.functions import Coalesce, Cast
from common.api_mixins import IsInTenant  # allows any tenant member

from .models import InventoryItem
from .utils import tenant_default_reorder_point


class LowStockView(APIView):
    permission_classes = [IsAuthenticated, IsInTenant]

    def get(self, request):
        tenant = getattr(request, "tenant", None)
        limit = int(request.GET.get("limit", 5))
        override_threshold = request.GET.get("threshold")
        try:
            override_threshold = int(override_threshold) if override_threshold is not None else None
        except (TypeError, ValueError):
            override_threshold = None

        if not tenant:
            return Response([])

        default_threshold = tenant_default_reorder_point(tenant)
        threshold_expr = (
            Value(override_threshold, output_field=IntegerField())
            if override_threshold is not None
            else Coalesce(
                F("variant__reorder_point"),
                Value(default_threshold, output_field=IntegerField()),
                output_field=IntegerField(),
            )
        )

        qs = (
            InventoryItem.objects
            .filter(store__tenant=tenant)
            .select_related("store", "variant", "variant__product")
            .annotate(
                on_hand_int=Cast("on_hand", IntegerField()),
                low_stock_threshold=threshold_expr,
            )
            .filter(on_hand_int__lte=F("low_stock_threshold"))
            .order_by("on_hand_int")[:limit]
        )

        out = []
        for it in qs:
            variant = getattr(it, "variant", None)
            product = getattr(variant, "product", None)
            sku = getattr(variant, "sku", "") or ""
            product_name = getattr(product, "name", "") or ""
            variant_label = product_name or sku or "Item"

            threshold = int(getattr(it, "low_stock_threshold", default_threshold))
            on_hand = int(getattr(it, "on_hand_int", it.on_hand))

            out.append({
                "store": it.store.name,
                "sku": sku,
                "variant": variant_label,
                "on_hand": on_hand,
                # Return the threshold under the same key the UI expects.
                "min_stock": threshold,  # legacy key (kept for compatibility)
                "low_stock_threshold": threshold,
                "low_stock": on_hand <= threshold,
            })

        return Response(out)
