# discounts/views.py
from django.utils import timezone
from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import DiscountRule, Coupon, DiscountScope
from .serializers import DiscountRuleSerializer, CouponSerializer

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

        qs = qs.filter(cond).order_by("priority", "id")
        data = DiscountRuleSerializer(qs, many=True).data
        return Response({"ok": True, "rules": data})

class CouponLookupView(APIView):
    """
    GET /api/v1/discounts/coupon?code=ABC123
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = request.tenant
        code = (request.query_params.get("code") or "").strip()
        now = timezone.now()
        c = (Coupon.objects
             .filter(tenant=tenant, code__iexact=code, is_active=True)
             .filter(Q(start_at__isnull=True) | Q(start_at__lte=now))
             .filter(Q(end_at__isnull=True) | Q(end_at__gte=now))
             .first())
        if not c:
            return Response({"ok": False, "detail": "Coupon not found"}, status=404)
        return Response({"ok": True, "coupon": CouponSerializer(c).data})
