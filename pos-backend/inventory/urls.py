# inventory/urls.py
from django.urls import path
from .views import LowStockView
from django.urls import path
from .api import (
    InventoryOverviewView, StockByStoreListView,
    AdjustmentCreateListView, AdjustmentReasonsView,
    LedgerListView, TransferListCreateView, TransferDetailView,
)

app_name = "inventory"

urlpatterns = [
    path("overview", InventoryOverviewView.as_view(), name="overview"),
    path("stock", StockByStoreListView.as_view(), name="stock"),
    path("adjustments", AdjustmentCreateListView.as_view(), name="adjustments"),
    path("reasons", AdjustmentReasonsView.as_view(), name="reasons"),
    path("ledger", LedgerListView.as_view(), name="ledger"),
    path("low_stock", LowStockView.as_view()),
    path("transfers", TransferListCreateView.as_view(), name="transfer-list"),
    path("transfers/<int:pk>", TransferDetailView.as_view(), name="transfer-detail"),

]
