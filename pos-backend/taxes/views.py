# pos-backend/taxes/views.py
from django.utils import timezone
from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .models import TaxRule, TaxScope
from .serializers import TaxRuleSerializer

class ActiveTaxRulesView(APIView):
    """
    GET /api/v1/taxes/active?store_id=<id>
    Returns all active rules for the current tenant at NOW(),
    including GLOBAL and STORE rules (if store_id is provided).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = request.tenant  # set by middleware
        now = timezone.now()
        store_id = request.query_params.get("store_id")

        qs = (TaxRule.objects
              .filter(tenant=tenant, is_active=True)
              .filter(Q(start_at__isnull=True) | Q(start_at__lte=now))
              .filter(Q(end_at__isnull=True) | Q(end_at__gte=now)))

        # Always include GLOBAL
        cond = Q(scope=TaxScope.GLOBAL)
        # Optionally include STORE rules for the requested store
        if store_id:
            cond = cond | Q(scope=TaxScope.STORE, store_id=store_id)

        qs = qs.filter(cond).order_by("priority", "id")
        data = TaxRuleSerializer(qs, many=True).data
        return Response({"ok": True, "rules": data})
