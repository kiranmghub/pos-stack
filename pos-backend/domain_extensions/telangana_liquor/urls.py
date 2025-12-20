# domain_extensions/telangana_liquor/urls.py
from django.urls import path
from .api import (
    ICDCParseView,
    ICDCSaveDraftView,
    ICDCSubmitView,
    ICDCListView,
    ICDCDetailView,
    ICDCReversalView,
)

app_name = "telangana_liquor"

urlpatterns = [
    path("icdc/parse", ICDCParseView.as_view(), name="icdc-parse"),
    path("icdc/save-draft", ICDCSaveDraftView.as_view(), name="icdc-save-draft"),
    path("icdc/<int:pk>/submit", ICDCSubmitView.as_view(), name="icdc-submit"),
    path("icdc/", ICDCListView.as_view(), name="icdc-list"),
    path("icdc/<int:pk>/", ICDCDetailView.as_view(), name="icdc-detail"),
    path("icdc/<int:pk>/reverse", ICDCReversalView.as_view(), name="icdc-reverse"),
]

