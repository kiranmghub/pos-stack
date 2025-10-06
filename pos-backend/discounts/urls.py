# discounts/urls.py
from django.urls import path
from .views import ActiveDiscountRulesView, CouponLookupView

app_name = "discounts"

urlpatterns = [
    path("active", ActiveDiscountRulesView.as_view(), name="active"),
    path("active/", ActiveDiscountRulesView.as_view()),  # alias with slash

    path("coupon", CouponLookupView.as_view(), name="coupon"),
    path("coupon/", CouponLookupView.as_view()),        # alias with slash

]
