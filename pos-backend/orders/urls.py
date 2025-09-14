# orders/urls.py
from django.urls import path
from .views import RecentSalesView
# urlpatterns = [path("recent", RecentSalesView.as_view())]


app_name = "orders"

urlpatterns = [
    path("recent/", RecentSalesView.as_view(), name="recent"),
]