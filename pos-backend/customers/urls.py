# pos-backend/customers/urls.py

from django.urls import path

from .views import (
    CustomerListCreateView,
    CustomerDetailView,
    CustomerSalesView,
    CustomerSalesSummaryView,
)

app_name = "customers"

urlpatterns = [
    path("customers/", CustomerListCreateView.as_view(), name="customer-list"),
    path("customers/sales-summary", CustomerSalesSummaryView.as_view(), name="customer-sales-summary"),
    path("customers/<int:pk>", CustomerDetailView.as_view(), name="customer-detail"),
    path("customers/<int:pk>/sales", CustomerSalesView.as_view(), name="customer-sales"),
]
