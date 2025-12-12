# purchasing/urls.py
from django.urls import path
from .api import (
    PurchaseOrderListCreateView, PurchaseOrderDetailView,
    PurchaseOrderSubmitView, PurchaseOrderReceiveView,
    ExternalPOReceiveView,
    VendorListCreateView,
    VendorDetailView,
)

app_name = "purchasing"

urlpatterns = [
    path("pos", PurchaseOrderListCreateView.as_view(), name="po-list-create"),
    path("pos/<int:pk>", PurchaseOrderDetailView.as_view(), name="po-detail"),
    path("pos/<int:pk>/submit", PurchaseOrderSubmitView.as_view(), name="po-submit"),
    path("pos/<int:pk>/receive", PurchaseOrderReceiveView.as_view(), name="po-receive"),
    path("pos/external-receive", ExternalPOReceiveView.as_view(), name="external-po-receive"),
    path("vendors", VendorListCreateView.as_view(), name="vendor-list-create"),
    path("vendors/<int:pk>", VendorDetailView.as_view(), name="vendor-detail"),
]

