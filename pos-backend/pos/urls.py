# pos/urls.py
from django.urls import path
# from .views import ProductsForPOSView, POSLookupBarcodeView, POSCheckoutView, POSStoresView
from .views import ProductsForPOSView, POSCheckoutView, POSStoresView, POSRegistersView, POSLookupBarcodeView, POSQuoteView
from .views_register import start_register_session, end_register_session


app_name = "pos"

urlpatterns = [
    path("stores", POSStoresView.as_view(), name="stores"),
    path("registers", POSRegistersView.as_view(), name="registers"),
    path("products", ProductsForPOSView.as_view(), name="products"),
    path("lookup_barcode", POSLookupBarcodeView.as_view(), name="lookup_barcode"),
    path("checkout", POSCheckoutView.as_view(), name="checkout"),
    path("quote", POSQuoteView.as_view(), name="quote"),
    path("register-session/start", start_register_session, name="pos_register_start"),
    path("register-session/end", end_register_session, name="pos_register_end"),
]
