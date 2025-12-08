# webhooks/urls.py
from django.urls import path
from .api import (
    WebhookSubscriptionListCreateView,
    WebhookSubscriptionDetailView,
    WebhookDeliveryListView,
    WebhookTestView,
)

app_name = "webhooks"

urlpatterns = [
    path("subscriptions", WebhookSubscriptionListCreateView.as_view(), name="subscription-list-create"),
    path("subscriptions/<int:pk>", WebhookSubscriptionDetailView.as_view(), name="subscription-detail"),
    path("subscriptions/<int:subscription_id>/deliveries", WebhookDeliveryListView.as_view(), name="delivery-list"),
    path("subscriptions/<int:pk>/test", WebhookTestView.as_view(), name="subscription-test"),
]

