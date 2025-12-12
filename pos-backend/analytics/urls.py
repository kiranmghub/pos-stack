# analytics/urls.py
from django.urls import path
from . import views
from .metrics import MetricsOverviewView
from .api_vendor import VendorScorecardView
from .api_inventory_health import (
    ShrinkageReportView,
    AgingReportView,
    CountCoverageView,
    InventoryHealthSummaryView,
)
from .api_exports import (
    ExportSnapshotView,
    ExportDeltaView,
    ExportTrackingListView,
    ReportExportView,
)
from .api_reports import (
    SalesSummaryReportView,
    SalesDetailReportView,
    ProductPerformanceReportView,
    FinancialSummaryReportView,
    CustomerAnalyticsReportView,
    EmployeePerformanceReportView,
    ReturnsAnalysisReportView,
)

urlpatterns = [
    path("owner/summary", views.OwnerSummaryView.as_view()),
    path("owner/sales_trend", views.OwnerSalesTrendView.as_view()),
    path("owner/revenue_by_store", views.OwnerRevenueByStoreView.as_view()),
    path("owner/top_products", views.OwnerTopProductsView.as_view()),
    path("metrics/overview", MetricsOverviewView.as_view()),
    path("vendors/<int:id>/scorecard", VendorScorecardView.as_view(), name="vendor-scorecard"),
    path("inventory/shrinkage", ShrinkageReportView.as_view(), name="inventory-shrinkage"),
    path("inventory/aging", AgingReportView.as_view(), name="inventory-aging"),
    path("inventory/coverage", CountCoverageView.as_view(), name="inventory-coverage"),
    path("inventory/health", InventoryHealthSummaryView.as_view(), name="inventory-health"),
    path("exports/snapshot", ExportSnapshotView.as_view(), name="export-snapshot"),
    path("exports/delta", ExportDeltaView.as_view(), name="export-delta"),
    path("exports/tracking", ExportTrackingListView.as_view(), name="export-tracking"),
    path("reports/export", ReportExportView.as_view(), name="report-export"),
    # Report endpoints
    path("reports/sales/summary", SalesSummaryReportView.as_view(), name="sales-summary-report"),
    path("reports/sales/detail", SalesDetailReportView.as_view(), name="sales-detail-report"),
    path("reports/products/performance", ProductPerformanceReportView.as_view(), name="product-performance-report"),
    path("reports/financial/summary", FinancialSummaryReportView.as_view(), name="financial-summary-report"),
    path("reports/customers/analytics", CustomerAnalyticsReportView.as_view(), name="customer-analytics-report"),
    path("reports/employees/performance", EmployeePerformanceReportView.as_view(), name="employee-performance-report"),
    path("reports/returns/analysis", ReturnsAnalysisReportView.as_view(), name="returns-analysis-report"),
]
