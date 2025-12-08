# webhooks/api.py
"""
Webhook subscription API endpoints.
"""
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from tenants.models import Tenant
from .models import WebhookSubscription, WebhookDelivery


def _resolve_request_tenant(request):
    """Resolve tenant from request"""
    from django.shortcuts import get_object_or_404
    t = getattr(request, "tenant", None)
    if t:
        return t
    payload = getattr(request, "auth", None)
    if isinstance(payload, dict) and payload.get("tenant_id"):
        return get_object_or_404(Tenant, id=payload["tenant_id"])
    user = getattr(request, "user", None)
    if user is not None:
        if getattr(user, "tenant", None):
            return user.tenant
        if getattr(user, "active_tenant", None):
            return user.active_tenant
    return None


class WebhookSubscriptionListCreateView(APIView):
    """
    GET  /api/v1/webhooks/subscriptions?event_type=
    POST /api/v1/webhooks/subscriptions
    
    List or create webhook subscriptions.
    
    POST Body: {
      "url": "https://example.com/webhook",
      "event_types": ["inventory.stock_changed", "inventory.transfer_sent"],
      "description": "Optional description",
      "max_retries": 3,
      "retry_backoff_seconds": 60
    }
    
    Security:
    - Requires authentication
    - Tenant-scoped
    - Input validation
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"results": [], "count": 0}, status=200)

        event_type = request.GET.get("event_type")
        subscriptions = WebhookSubscription.objects.filter(tenant=tenant)
        
        if event_type:
            subscriptions = subscriptions.filter(event_types__contains=[event_type])
        
        subscriptions = subscriptions.order_by("-created_at")
        
        data = [{
            "id": sub.id,
            "url": sub.url,
            "event_types": sub.event_types,
            "is_active": sub.is_active,
            "description": sub.description or "",
            "max_retries": sub.max_retries,
            "retry_backoff_seconds": sub.retry_backoff_seconds,
            "last_triggered_at": sub.last_triggered_at,
            "last_success_at": sub.last_success_at,
            "last_failure_at": sub.last_failure_at,
            "failure_count": sub.failure_count,
            "created_at": sub.created_at,
        } for sub in subscriptions]
        
        return Response({"results": data, "count": len(data)}, status=200)

    def post(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)

        payload = request.data or {}
        url = payload.get("url")
        event_types = payload.get("event_types", [])
        description = payload.get("description", "")
        max_retries = payload.get("max_retries", 3)
        retry_backoff_seconds = payload.get("retry_backoff_seconds", 60)

        # Validate required fields
        if not url:
            return Response({"error": "url required"}, status=400)
        if not event_types:
            return Response({"error": "event_types required (list)"}, status=400)
        if not isinstance(event_types, list):
            return Response({"error": "event_types must be a list"}, status=400)

        # Validate event types
        valid_events = [event[0] for event in WebhookSubscription.EVENT_TYPES]
        for event_type in event_types:
            if event_type not in valid_events:
                return Response({"error": f"Invalid event type: {event_type}"}, status=400)

        # Validate URL format
        try:
            from django.core.validators import URLValidator
            validator = URLValidator()
            validator(url)
        except Exception:
            return Response({"error": "Invalid URL format"}, status=400)

        # Validate retry settings
        if max_retries < 0 or max_retries > 10:
            return Response({"error": "max_retries must be between 0 and 10"}, status=400)
        if retry_backoff_seconds < 1 or retry_backoff_seconds > 3600:
            return Response({"error": "retry_backoff_seconds must be between 1 and 3600"}, status=400)

        try:
            subscription = WebhookSubscription.objects.create(
                tenant=tenant,
                url=url,
                event_types=event_types,
                description=description,
                max_retries=max_retries,
                retry_backoff_seconds=retry_backoff_seconds,
            )
            return Response({
                "id": subscription.id,
                "url": subscription.url,
                "event_types": subscription.event_types,
                "secret": subscription.secret,  # Return secret for initial setup
                "is_active": subscription.is_active,
            }, status=201)
        except Exception as e:
            return Response({"error": str(e)}, status=400)


class WebhookSubscriptionDetailView(APIView):
    """
    GET    /api/v1/webhooks/subscriptions/<id>
    PUT    /api/v1/webhooks/subscriptions/<id>
    DELETE /api/v1/webhooks/subscriptions/<id>
    
    Get, update, or delete a webhook subscription.
    """
    permission_classes = [IsAuthenticated]

    def get_obj(self, request, pk):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return None
        from django.shortcuts import get_object_or_404
        return get_object_or_404(WebhookSubscription, id=pk, tenant=tenant)

    def get(self, request, pk):
        subscription = self.get_obj(request, pk)
        if not subscription:
            return Response({"error": "No tenant"}, status=400)
        
        return Response({
            "id": subscription.id,
            "url": subscription.url,
            "event_types": subscription.event_types,
            "is_active": subscription.is_active,
            "description": subscription.description or "",
            "max_retries": subscription.max_retries,
            "retry_backoff_seconds": subscription.retry_backoff_seconds,
            "last_triggered_at": subscription.last_triggered_at,
            "last_success_at": subscription.last_success_at,
            "last_failure_at": subscription.last_failure_at,
            "failure_count": subscription.failure_count,
            "created_at": subscription.created_at,
            "updated_at": subscription.updated_at,
        }, status=200)

    def put(self, request, pk):
        subscription = self.get_obj(request, pk)
        if not subscription:
            return Response({"error": "No tenant"}, status=400)

        payload = request.data or {}
        
        # Update allowed fields
        if "event_types" in payload:
            event_types = payload["event_types"]
            if not isinstance(event_types, list):
                return Response({"error": "event_types must be a list"}, status=400)
            valid_events = [event[0] for event in WebhookSubscription.EVENT_TYPES]
            for event_type in event_types:
                if event_type not in valid_events:
                    return Response({"error": f"Invalid event type: {event_type}"}, status=400)
            subscription.event_types = event_types
        
        if "is_active" in payload:
            subscription.is_active = bool(payload["is_active"])
        
        if "description" in payload:
            subscription.description = str(payload["description"])[:200]
        
        if "max_retries" in payload:
            max_retries = int(payload["max_retries"])
            if max_retries < 0 or max_retries > 10:
                return Response({"error": "max_retries must be between 0 and 10"}, status=400)
            subscription.max_retries = max_retries
        
        if "retry_backoff_seconds" in payload:
            retry_backoff_seconds = int(payload["retry_backoff_seconds"])
            if retry_backoff_seconds < 1 or retry_backoff_seconds > 3600:
                return Response({"error": "retry_backoff_seconds must be between 1 and 3600"}, status=400)
            subscription.retry_backoff_seconds = retry_backoff_seconds
        
        subscription.save()
        
        return Response({
            "id": subscription.id,
            "url": subscription.url,
            "event_types": subscription.event_types,
            "is_active": subscription.is_active,
        }, status=200)

    def delete(self, request, pk):
        subscription = self.get_obj(request, pk)
        if not subscription:
            return Response({"error": "No tenant"}, status=400)
        
        subscription.delete()
        return Response(status=204)


class WebhookDeliveryListView(APIView):
    """
    GET /api/v1/webhooks/subscriptions/<id>/deliveries?status=&page=&page_size=
    
    List webhook delivery attempts for a subscription.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, subscription_id):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"results": [], "count": 0}, status=200)

        from django.shortcuts import get_object_or_404
        subscription = get_object_or_404(WebhookSubscription, id=subscription_id, tenant=tenant)
        
        status_filter = request.GET.get("status")
        page = int(request.GET.get("page") or "1")
        page_size = int(request.GET.get("page_size") or "50")
        
        deliveries = WebhookDelivery.objects.filter(subscription=subscription)
        
        if status_filter:
            deliveries = deliveries.filter(status=status_filter.upper())
        
        deliveries = deliveries.order_by("-created_at")
        
        total = deliveries.count()
        rows = deliveries[(page - 1) * page_size : page * page_size]
        
        data = [{
            "id": d.id,
            "event_type": d.event_type,
            "status": d.status,
            "attempt_count": d.attempt_count,
            "max_retries": d.max_retries,
            "response_status_code": d.response_status_code,
            "error_message": d.error_message or "",
            "created_at": d.created_at,
            "delivered_at": d.delivered_at,
            "next_retry_at": d.next_retry_at,
        } for d in rows]
        
        return Response({"results": data, "count": total}, status=200)


class WebhookTestView(APIView):
    """
    POST /api/v1/webhooks/subscriptions/<id>/test
    
    Test a webhook subscription by sending a sample payload.
    
    POST Body: {
      "event_type": "inventory.stock_changed"  // Optional, defaults to first event type
    }
    
    Security:
    - Requires authentication
    - Tenant-scoped
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)

        from django.shortcuts import get_object_or_404
        subscription = get_object_or_404(WebhookSubscription, id=pk, tenant=tenant)

        # Get event type from request, or use first from subscription
        event_type = request.data.get("event_type")
        if not event_type:
            if subscription.event_types:
                event_type = subscription.event_types[0]
            else:
                return Response({"error": "No event types configured for this subscription"}, status=400)

        # Validate event type is in subscription's event types
        if event_type not in subscription.event_types:
            return Response({"error": f"Event type {event_type} is not configured for this subscription"}, status=400)

        # Generate sample payload for the event type
        from django.utils import timezone
        sample_payload = self._generate_sample_payload(tenant, event_type, request.user)

        # Create a test delivery record
        import json
        from .services import deliver_webhook_sync
        payload_json = json.dumps(sample_payload, sort_keys=True)
        signature = subscription.generate_signature(payload_json)

        from .models import WebhookDelivery
        delivery = WebhookDelivery.objects.create(
            subscription=subscription,
            event_type=event_type,
            payload=sample_payload,
            signature=signature,
            status="PENDING",
            max_retries=subscription.max_retries,
        )

        # Deliver synchronously for immediate response
        deliver_webhook_sync(delivery.id)

        # Refresh delivery to get updated status
        delivery.refresh_from_db()

        return Response({
            "success": delivery.status == "SUCCESS",
            "delivery_id": delivery.id,
            "event_type": event_type,
            "payload": sample_payload,
            "status": delivery.status,
            "response_status_code": delivery.response_status_code,
            "error_message": delivery.error_message,
            "attempt_count": delivery.attempt_count,
            "delivered_at": delivery.delivered_at.isoformat() if delivery.delivered_at else None,
        }, status=200)

    def _generate_sample_payload(self, tenant, event_type: str, user):
        """Generate a sample payload for testing"""
        from django.utils import timezone

        if event_type == "inventory.stock_changed":
            return {
                "event": "inventory.stock_changed",
                "timestamp": timezone.now().isoformat(),
                "tenant_id": tenant.id,
                "tenant_code": tenant.code,
                "data": {
                    "store_id": 1,
                    "store_code": "STORE1",
                    "store_name": "Sample Store",
                    "variant_id": 1,
                    "sku": "TEST-SKU-001",
                    "product_name": "Test Product",
                    "old_on_hand": 10,
                    "new_on_hand": 15,
                    "delta": 5,
                    "ref_type": "ADJUSTMENT",
                    "ref_id": 999,
                    "user_id": user.id if user else None,
                    "user_username": user.username if user else None,
                }
            }
        elif event_type == "inventory.transfer_sent":
            return {
                "event": "inventory.transfer_sent",
                "timestamp": timezone.now().isoformat(),
                "tenant_id": tenant.id,
                "tenant_code": tenant.code,
                "data": {
                    "transfer_id": 999,
                    "from_store_id": 1,
                    "from_store_code": "STORE1",
                    "to_store_id": 2,
                    "to_store_code": "STORE2",
                    "status": "SENT",
                    "lines": [
                        {
                            "variant_id": 1,
                            "sku": "TEST-SKU-001",
                            "qty": 5,
                            "qty_sent": 5,
                        }
                    ],
                    "user_id": user.id if user else None,
                    "user_username": user.username if user else None,
                }
            }
        elif event_type == "inventory.transfer_received":
            return {
                "event": "inventory.transfer_received",
                "timestamp": timezone.now().isoformat(),
                "tenant_id": tenant.id,
                "tenant_code": tenant.code,
                "data": {
                    "transfer_id": 999,
                    "from_store_id": 1,
                    "from_store_code": "STORE1",
                    "to_store_id": 2,
                    "to_store_code": "STORE2",
                    "status": "RECEIVED",
                    "lines": [
                        {
                            "variant_id": 1,
                            "sku": "TEST-SKU-001",
                            "qty": 5,
                            "qty_received": 5,
                            "qty_remaining": 0,
                        }
                    ],
                    "user_id": user.id if user else None,
                    "user_username": user.username if user else None,
                }
            }
        elif event_type == "inventory.count_finalized":
            return {
                "event": "inventory.count_finalized",
                "timestamp": timezone.now().isoformat(),
                "tenant_id": tenant.id,
                "tenant_code": tenant.code,
                "data": {
                    "count_session_id": 999,
                    "store_id": 1,
                    "store_code": "STORE1",
                    "scope": "ZONE",
                    "zone_name": "Aisle 1",
                    "lines": [
                        {
                            "variant_id": 1,
                            "sku": "TEST-SKU-001",
                            "expected_qty": 10,
                            "counted_qty": 12,
                            "variance": 2,
                        }
                    ],
                    "user_id": user.id if user else None,
                    "user_username": user.username if user else None,
                }
            }
        elif event_type == "purchase_order.received":
            return {
                "event": "purchase_order.received",
                "timestamp": timezone.now().isoformat(),
                "tenant_id": tenant.id,
                "tenant_code": tenant.code,
                "data": {
                    "purchase_order_id": 999,
                    "po_number": "PO-TEST-001",
                    "store_id": 1,
                    "store_code": "STORE1",
                    "vendor_id": 1,
                    "vendor_name": "Test Vendor",
                    "status": "RECEIVED",
                    "received_at": timezone.now().isoformat(),
                    "lines": [
                        {
                            "variant_id": 1,
                            "sku": "TEST-SKU-001",
                            "qty_ordered": 20,
                            "qty_received": 20,
                            "qty_remaining": 0,
                            "unit_cost": "10.00",
                        }
                    ],
                    "user_id": user.id if user else None,
                    "user_username": user.username if user else None,
                }
            }
        else:
            # Generic fallback
            return {
                "event": event_type,
                "timestamp": timezone.now().isoformat(),
                "tenant_id": tenant.id,
                "tenant_code": tenant.code,
                "data": {
                    "test": True,
                    "message": "This is a test webhook payload",
                }
            }

