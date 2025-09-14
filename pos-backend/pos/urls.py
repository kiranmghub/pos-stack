# pos/urls.py
from django.urls import path
from .views import ProductsForPOSView, POSLookupBarcodeView, POSCheckoutView, POSStoresView

app_name = "pos"

urlpatterns = [
    path("stores", POSStoresView.as_view(), name="stores"),
    path("products", ProductsForPOSView.as_view(), name="products"),
    path("lookup_barcode", POSLookupBarcodeView.as_view(), name="lookup_barcode"),
    path("checkout", POSCheckoutView.as_view(), name="checkout"),
]
