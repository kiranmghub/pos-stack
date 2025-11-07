# pos-backend/orders/urls.py
from django.urls import path
from .views import RecentSalesView, SalesListView, SaleDetailView


app_name = "orders"

urlpatterns = [
    path("recent/", RecentSalesView.as_view(), name="recent"),
    path("", SalesListView.as_view(), name="sales-list"),
    path("<int:pk>", SaleDetailView.as_view(), name="sales-detail"),
]