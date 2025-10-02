# discounts/urls.py
from django.urls import path
from .views import ActiveDiscountRulesView, CouponLookupView

app_name = "discounts"

urlpatterns = [
    path("active", ActiveDiscountRulesView.as_view(), name="active"),
    path("coupon", CouponLookupView.as_view(), name="coupon"),
]
