# inventory/urls.py
from django.urls import path
from .views import LowStockView
from django.urls import path
from .api import (
    InventoryOverviewView, StockByStoreListView,
    AdjustmentCreateListView, AdjustmentReasonsView,
    LedgerListView, TransferListCreateView, TransferDetailView,
)

from .api_counts import (
    CountSessionListCreateView, CountSessionDetailView,
    CountScanView, CountSetQtyView, CountFinalizeView,
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
    # Support action in path e.g. POST /transfers/1/send
    path("transfers/<int:pk>/<str:action>", TransferDetailView.as_view(), name="transfer-action"),
    path("counts", CountSessionListCreateView.as_view(), name="count_list_create"),
    path("counts/<int:pk>", CountSessionDetailView.as_view(), name="count_detail"),
    path("counts/<int:pk>/scan", CountScanView.as_view(), name="count_scan"),
    path("counts/<int:pk>/set_qty", CountSetQtyView.as_view(), name="count_set_qty"),
    path("counts/<int:pk>/finalize", CountFinalizeView.as_view(), name="count_finalize"),

]
