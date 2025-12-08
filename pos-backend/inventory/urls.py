# inventory/urls.py
from django.urls import path
from .views import LowStockView
from .api import (
    InventoryOverviewView, StockByStoreListView, StockAcrossStoresView,
    AdjustmentCreateListView, AdjustmentReasonsView,
    LedgerListView, TransferListCreateView, TransferDetailView,
    ReorderSuggestionView, StockSummaryView,
)

from .api_counts import (
    CountSessionListCreateView, CountSessionDetailView,
    CountScanView, CountSetQtyView, CountFinalizeView, CountVarianceView,
)
from .api_reservations import (
    ReservationListView, ReservationCreateView,
    ReservationReleaseView, ReservationCommitView,
)
from .api_channels import (
    AvailabilityView, ChannelReserveView,
    ChannelReleaseView, ChannelCommitView,
)
from .api_forecast import (
    ReorderForecastView, AtRiskItemsView,
)
app_name = "inventory"

urlpatterns = [
    path("overview", InventoryOverviewView.as_view(), name="overview"),
    path("stock", StockByStoreListView.as_view(), name="stock"),
    path("stock-across-stores", StockAcrossStoresView.as_view(), name="stock-across-stores"),
    path("stock_summary", StockSummaryView.as_view(), name="stock-summary"),
    path("adjustments", AdjustmentCreateListView.as_view(), name="adjustments"),
    path("reasons", AdjustmentReasonsView.as_view(), name="reasons"),
    path("ledger", LedgerListView.as_view(), name="ledger"),
    path("low_stock", LowStockView.as_view()),
    path("reorder_suggestions", ReorderSuggestionView.as_view(), name="reorder_suggestions"),
    path("transfers", TransferListCreateView.as_view(), name="transfer-list"),
    path("transfers/<int:pk>", TransferDetailView.as_view(), name="transfer-detail"),
    # Support action in path e.g. POST /transfers/1/send
    path("transfers/<int:pk>/<str:action>", TransferDetailView.as_view(), name="transfer-action"),
    path("counts", CountSessionListCreateView.as_view(), name="count_list_create"),
    path("counts/<int:pk>", CountSessionDetailView.as_view(), name="count_detail"),
    path("counts/<int:pk>/scan", CountScanView.as_view(), name="count_scan"),
    path("counts/<int:pk>/set_qty", CountSetQtyView.as_view(), name="count_set_qty"),
    path("counts/<int:pk>/variance", CountVarianceView.as_view(), name="count_variance"),
    path("counts/<int:pk>/finalize", CountFinalizeView.as_view(), name="count_finalize"),
    path("reservations", ReservationListView.as_view(), name="reservation-list"),
    path("reservations/reserve", ReservationCreateView.as_view(), name="reservation-create"),
    path("reservations/<int:pk>/release", ReservationReleaseView.as_view(), name="reservation-release"),
    path("reservations/<int:pk>/commit", ReservationCommitView.as_view(), name="reservation-commit"),
    # Multi-channel API endpoints
    path("availability", AvailabilityView.as_view(), name="availability"),
    path("reserve", ChannelReserveView.as_view(), name="channel-reserve"),
    path("release", ChannelReleaseView.as_view(), name="channel-release"),
    path("commit", ChannelCommitView.as_view(), name="channel-commit"),
    path("reorder_forecast", ReorderForecastView.as_view(), name="reorder-forecast"),
    path("at_risk_items", AtRiskItemsView.as_view(), name="at-risk-items"),

]
