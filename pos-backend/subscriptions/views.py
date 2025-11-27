from rest_framework import generics, permissions, status
from rest_framework.response import Response

from tenants.models import Tenant
from discounts.models import Coupon
from django.db.models import F
from django.db import transaction
from .models import PlanPrice, Plan
from .serializers import PlanPriceSerializer, SubscriptionSerializer
from .services import (
    get_plan_prices_for_country,
    create_trial_subscription,
    validate_signup_coupon,
    apply_coupon_to_amount,
)


class PlanListView(generics.GenericAPIView):
    serializer_class = PlanPriceSerializer
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request, *args, **kwargs):
        country = request.query_params.get("country")
        currency = request.query_params.get("currency")
        prices = get_plan_prices_for_country(country, currency)
        serializer = self.get_serializer(prices, many=True)
        return Response(serializer.data)


class TenantCreateTrialSubscriptionView(generics.GenericAPIView):
    serializer_class = SubscriptionSerializer
    authentication_classes = []  # public for signup flow
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        tenant_id = request.data.get("tenant_id")
        plan_code = request.data.get("plan_code")
        country = request.data.get("country")
        currency = request.data.get("currency")
        coupon_code = request.data.get("coupon_code")

        if not tenant_id or not plan_code:
            return Response({"detail": "tenant_id and plan_code are required"}, status=status.HTTP_400_BAD_REQUEST)

        tenant = Tenant.objects.get(id=tenant_id)
        plan = Plan.objects.get(code=plan_code)
        prices = get_plan_prices_for_country(country, currency)
        price = next((p for p in prices if p.plan_id == plan.id), None)
        if not price:
            return Response({"detail": "Plan not available in this region/currency."}, status=status.HTTP_400_BAD_REQUEST)

        coupon = None
        amount = price.amount

        # Optional coupon for signup
        if coupon_code:
            try:
                coupon = validate_signup_coupon(coupon_code, plan.code, country, tenant=tenant)
                amount = apply_coupon_to_amount(price.amount, coupon)
            except ValueError as exc:
                return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            if coupon:
                # Atomic guard against overuse
                if coupon.max_uses is not None:
                    updated = Coupon.objects.filter(id=coupon.id, used_count__lt=coupon.max_uses).update(
                        used_count=F("used_count") + 1
                    )
                    if updated == 0:
                        return Response({"detail": "Coupon usage limit reached"}, status=status.HTTP_400_BAD_REQUEST)
                else:
                    Coupon.objects.filter(id=coupon.id).update(used_count=F("used_count") + 1)

            sub = create_trial_subscription(
                tenant,
                plan,
                price,
                trial_days=None,
                coupon=coupon,
                amount_override=amount,
            )

        serializer = self.get_serializer(sub)
        return Response(serializer.data)
