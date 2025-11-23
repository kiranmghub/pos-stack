# pos-backend/orders/urls.py
from django.urls import path
from .views import (
    RecentSalesView, SalesListView, SaleDetailView, SaleReturnsListCreate, ReturnAddItemsView, ReturnFinalizeView, ReturnDetailView,
    ReturnItemDeleteView, ReturnVoidView, ReturnListView, PaymentListView, RefundListView, PaymentSummaryView, PaymentExportView,
    DiscountSummaryView, DiscountSalesListView, DiscountExportView,
    TaxSummaryView, TaxSalesListView, AuditLogListView, AuditLogDetailView,
)


app_name = "orders"

urlpatterns = [
    path("recent/", RecentSalesView.as_view(), name="recent"),
    path("", SalesListView.as_view(), name="sales-list"),
    path("<int:pk>", SaleDetailView.as_view(), name="sales-detail"),
    path("<int:pk>/returns", SaleReturnsListCreate.as_view(), name="sale-returns"),
    path("returns/", ReturnListView.as_view(), name="return-list"),
    path("payments/", PaymentListView.as_view(), name="payments-list"),
    path("payments/summary", PaymentSummaryView.as_view(), name="payments-summary"),
    path("payments/export", PaymentExportView.as_view(), name="payments-export"),
    path("refunds/", RefundListView.as_view(), name="refunds-list"),
    path("discounts/summary", DiscountSummaryView.as_view(), name="discounts-summary"),
    path("discounts/sales", DiscountSalesListView.as_view(), name="discounts-sales"),
    path("discounts/export", DiscountExportView.as_view(), name="discounts-export"),
    path("taxes/summary", TaxSummaryView.as_view(), name="taxes-summary"),
    path("taxes/sales", TaxSalesListView.as_view(), name="taxes-sales"),
    path("audit/logs", AuditLogListView.as_view(), name="audit-logs"),
    path("audit/logs/<int:pk>", AuditLogDetailView.as_view(), name="audit-log-detail"),
    path("returns/<int:pk>/items", ReturnAddItemsView.as_view(), name="return-items"),
    path("returns/<int:pk>/finalize", ReturnFinalizeView.as_view(), name="return-finalize"),
    path("returns/<int:pk>", ReturnDetailView.as_view(), name="return-detail"),
    path("return-items/<int:pk>", ReturnItemDeleteView.as_view(), name="return-item-delete"),
    path("returns/<int:pk>/void", ReturnVoidView.as_view(), name="return-void"),

]
