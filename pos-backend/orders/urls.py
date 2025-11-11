# pos-backend/orders/urls.py
from django.urls import path
from .views import (
    RecentSalesView, SalesListView, SaleDetailView, SaleReturnsListCreate, ReturnAddItemsView, ReturnFinalizeView, ReturnDetailView,
    ReturnItemDeleteView, ReturnVoidView, )


app_name = "orders"

urlpatterns = [
    path("recent/", RecentSalesView.as_view(), name="recent"),
    path("", SalesListView.as_view(), name="sales-list"),
    path("<int:pk>", SaleDetailView.as_view(), name="sales-detail"),
    path("<int:pk>/returns", SaleReturnsListCreate.as_view(), name="sale-returns"),
    path("returns/<int:pk>/items", ReturnAddItemsView.as_view(), name="return-items"),
    path("returns/<int:pk>/finalize", ReturnFinalizeView.as_view(), name="return-finalize"),
    path("returns/<int:pk>", ReturnDetailView.as_view(), name="return-detail"),
    path("return-items/<int:pk>", ReturnItemDeleteView.as_view(), name="return-item-delete"),
    path("returns/<int:pk>/void", ReturnVoidView.as_view(), name="return-void"),

]