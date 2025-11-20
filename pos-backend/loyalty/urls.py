# pos-backend/loyalty/urls.py

from django.urls import path

from .views import LoyaltyProgramView, LoyaltyAccountDetailView, LoyaltyHistoryView

app_name = "loyalty"

urlpatterns = [
    path("loyalty/program", LoyaltyProgramView.as_view(), name="program"),
    path("loyalty/accounts/<int:customer_id>", LoyaltyAccountDetailView.as_view(), name="account-detail"),
    path("loyalty/accounts/<int:customer_id>/history", LoyaltyHistoryView.as_view(), name="account-history"),
]
