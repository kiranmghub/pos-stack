# pos-backend/discounts/views.py
from django.utils import timezone
from django.db.models import Q, F
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import DiscountRule, Coupon, DiscountScope
from .serializers import DiscountRuleSerializer, CouponSerializer
from decimal import Decimal
from .models import Coupon

class ActiveDiscountRulesView(APIView):
    """
    GET /api/v1/discounts/active?store_id=<id>
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = request.tenant
        now = timezone.now()
        store_id = request.query_params.get("store_id")

        qs = (DiscountRule.objects
              .filter(tenant=tenant, is_active=True)
              .filter(Q(start_at__isnull=True) | Q(start_at__lte=now))
              .filter(Q(end_at__isnull=True) | Q(end_at__gte=now)))

        cond = Q(scope=DiscountScope.GLOBAL)
        if store_id:
            cond = cond | Q(scope=DiscountScope.STORE, store_id=store_id)

        # qs = qs.filter(cond).order_by("priority", "id")
        qs = qs.filter(cond).filter(coupon__isnull=True).order_by("priority", "id")

        data = DiscountRuleSerializer(qs, many=True).data
        return Response({"ok": True, "rules": data})



class CouponLookupView(APIView):
    """
    GET /api/v1/discounts/coupon?code=ABC123[&subtotal=123.45]
    Validates existence, active window, and max_uses.
    If 'subtotal' is given, also checks min_subtotal.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = request.tenant
        code = (request.query_params.get("code") or "").strip()
        now = timezone.now()
        subtotal = request.query_params.get("subtotal")

        if not code:
            return Response({"ok": False, "detail": "Missing coupon code"}, status=400)

        c = (Coupon.objects
             .select_related("rule")
             .filter(tenant=tenant, code__iexact=code)
             .first())

        if not c:
            return Response({"ok": False, "detail": "Coupon not found"}, status=404)

        # Base active checks
        if not c.is_active:
            return Response({"ok": False, "detail": "Coupon is inactive"}, status=400)
        if c.start_at and c.start_at > now:
            return Response({"ok": False, "detail": "Coupon is not active yet"}, status=400)
        if c.end_at and c.end_at < now:
            return Response({"ok": False, "detail": "Coupon has expired"}, status=400)
        if c.max_uses is not None and c.used_count >= c.max_uses:
            return Response({"ok": False, "detail": "Coupon usage limit reached"}, status=400)

        # Optional min_subtotal check (only if client passes subtotal)
        if subtotal is not None and c.min_subtotal:
            try:
                st = Decimal(str(subtotal))
            except Exception:
                return Response({"ok": False, "detail": "Invalid subtotal"}, status=400)
            if st < c.min_subtotal:
                return Response({"ok": False, "detail": f"Minimum subtotal ${c.min_subtotal} required"}, status=400)

        # Return lightweight coupon + rule info
        # rule = c.rule
        # payload = {
        #     "code": c.code,
        #     "name": c.name or rule.name,
        #     "min_subtotal": str(c.min_subtotal) if c.min_subtotal is not None else None,
        #     "max_uses": c.max_uses,
        #     "used_count": c.used_count,
        #     "rule": {
        #         "id": rule.id,
        #         "name": rule.name,
        #         "basis": rule.basis,   # "PCT" or "FLAT"
        #         "rate": str(rule.rate) if rule.rate is not None else None,
        #         "amount": str(rule.amount) if rule.amount is not None else None,
        #         "apply_scope": rule.apply_scope,  # "LINE" or "RECEIPT"
        #         "target": rule.target,            # "ALL"/"CATEGORY"/"PRODUCT"/"VARIANT"
        #     },
        # }
        # return Response({"ok": True, "coupon": payload})
        # Return full coupon w/ rule (including categories/product_ids/variant_ids if your serializer exposes them)
        return Response({"ok": True, "coupon": CouponSerializer(c).data})

