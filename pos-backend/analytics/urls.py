# analytics/urls.py
from django.urls import path
from . import views

urlpatterns = [
    path("owner/summary", views.OwnerSummaryView.as_view()),
    path("owner/sales_trend", views.OwnerSalesTrendView.as_view()),
    path("owner/revenue_by_store", views.OwnerRevenueByStoreView.as_view()),
    path("owner/top_products", views.OwnerTopProductsView.as_view()),
]
