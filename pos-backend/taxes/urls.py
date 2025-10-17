# pos-backend/taxes/urls.py
from django.urls import path
from .views import ActiveTaxRulesView

app_name = "taxes"

urlpatterns = [
    path("active", ActiveTaxRulesView.as_view(), name="active"),
]
