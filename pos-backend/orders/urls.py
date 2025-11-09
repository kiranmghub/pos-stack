# pos-backend/orders/urls.py
from django.urls import path
from .views import RecentSalesView, SalesListView, SaleDetailView, SaleReturnsListCreate, ReturnAddItemsView, ReturnFinalizeView


app_name = "orders"

urlpatterns = [
    path("recent/", RecentSalesView.as_view(), name="recent"),
    path("", SalesListView.as_view(), name="sales-list"),
    path("<int:pk>", SaleDetailView.as_view(), name="sales-detail"),
    path("orders/<int:pk>/returns", SaleReturnsListCreate.as_view()),
    path("returns/<int:pk>/items", ReturnAddItemsView.as_view()),
    path("returns/<int:pk>/finalize", ReturnFinalizeView.as_view()),
]