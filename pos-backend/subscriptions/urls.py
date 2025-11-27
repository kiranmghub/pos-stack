from django.urls import path
from .views import PlanListView, TenantCreateTrialSubscriptionView

urlpatterns = [
    path("plans", PlanListView.as_view(), name="subscription-plans"),
    path("tenants/create-trial", TenantCreateTrialSubscriptionView.as_view(), name="tenant-create-trial-sub"),
]
