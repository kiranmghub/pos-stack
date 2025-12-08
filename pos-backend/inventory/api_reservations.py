# inventory/api_reservations.py
from django.utils import timezone
from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from tenants.models import Tenant
from stores.models import Store
from catalog.models import Variant
from .models_reservations import Reservation
from .reservations import (
    reserve_stock,
    release_reservation,
    commit_reservation,
    ReservationError,
    InsufficientStockError,
)


def _resolve_request_tenant(request):
    """Resolve tenant from request (reuse pattern from inventory/api.py)"""
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


class ReservationListView(APIView):
    """
    GET /api/v1/inventory/reservations?store_id=&variant_id=&status=&channel=&page=&page_size=
    List active reservations with optional filters.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"results": [], "count": 0}, status=200)

        page = int(request.GET.get("page") or "1")
        page_size = int(request.GET.get("page_size") or "50")
        store_id = request.GET.get("store_id")
        variant_id = request.GET.get("variant_id")
        status_f = (request.GET.get("status") or "").strip().upper()
        channel = (request.GET.get("channel") or "").strip()

        qs = Reservation.objects.filter(tenant=tenant).select_related(
            "store", "variant", "variant__product", "created_by"
        ).order_by("-created_at")

        if store_id:
            try:
                qs = qs.filter(store_id=int(store_id))
            except (ValueError, TypeError):
                pass

        if variant_id:
            try:
                qs = qs.filter(variant_id=int(variant_id))
            except (ValueError, TypeError):
                pass

        if status_f:
            qs = qs.filter(status=status_f)

        if channel:
            qs = qs.filter(channel=channel)

        total = qs.count()
        rows = qs[(page - 1) * page_size : page * page_size]

        data = [{
            "id": r.id,
            "store_id": r.store_id,
            "store_name": r.store.name,
            "store_code": r.store.code,
            "variant_id": r.variant_id,
            "sku": r.variant.sku,
            "product_name": r.variant.product.name if r.variant.product else r.variant.name,
            "quantity": r.quantity,
            "status": r.status,
            "ref_type": r.ref_type,
            "ref_id": r.ref_id,
            "channel": r.channel,
            "note": r.note or "",
            "expires_at": r.expires_at,
            "created_at": r.created_at,
            "created_by": r.created_by.username if r.created_by else None,
        } for r in rows]

        return Response({"results": data, "count": total}, status=200)


class ReservationCreateView(APIView):
    """
    POST /api/v1/inventory/reservations/reserve
    Body: {
      "store_id": 1,
      "variant_id": 123,
      "quantity": 5,
      "ref_type": "POS_CART",
      "ref_id": 456,  // optional
      "channel": "POS",  // optional, default "POS"
      "note": "Cart reservation",  // optional
      "expires_at": "2024-01-01T12:00:00Z"  // optional
    }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)

        payload = request.data or {}
        store_id = payload.get("store_id")
        variant_id = payload.get("variant_id")
        quantity = payload.get("quantity")
        ref_type = payload.get("ref_type")
        ref_id = payload.get("ref_id")
        channel = payload.get("channel") or "POS"
        note = payload.get("note") or ""
        expires_at = payload.get("expires_at")

        if not store_id:
            return Response({"error": "store_id required"}, status=400)
        if not variant_id:
            return Response({"error": "variant_id required"}, status=400)
        if not quantity:
            return Response({"error": "quantity required"}, status=400)
        if not ref_type:
            return Response({"error": "ref_type required"}, status=400)

        try:
            quantity = int(quantity)
        except (ValueError, TypeError):
            return Response({"error": "quantity must be a positive integer"}, status=400)

        if quantity <= 0:
            return Response({"error": "quantity must be greater than 0"}, status=400)

        # Parse expires_at if provided
        if expires_at:
            try:
                from django.utils.dateparse import parse_datetime
                expires_at = parse_datetime(expires_at)
            except (ValueError, TypeError):
                return Response({"error": "Invalid expires_at format"}, status=400)

        try:
            reservation = reserve_stock(
                tenant=tenant,
                store_id=store_id,
                variant_id=variant_id,
                qty=quantity,
                ref_type=ref_type,
                ref_id=ref_id,
                channel=channel,
                user=request.user,
                note=note,
                expires_at=expires_at,
            )
            return Response({
                "id": reservation.id,
                "status": reservation.status,
                "quantity": reservation.quantity,
            }, status=201)
        except InsufficientStockError as e:
            return Response({"error": str(e)}, status=400)
        except Exception as e:
            return Response({"error": str(e)}, status=400)


class ReservationReleaseView(APIView):
    """
    POST /api/v1/inventory/reservations/<id>/release
    Release an active reservation.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)

        try:
            reservation = release_reservation(
                reservation_id=pk,
                tenant=tenant,
                user=request.user,
            )
            return Response({
                "id": reservation.id,
                "status": reservation.status,
            }, status=200)
        except Reservation.DoesNotExist:
            return Response({"error": "Reservation not found"}, status=404)
        except Exception as e:
            return Response({"error": str(e)}, status=400)


class ReservationCommitView(APIView):
    """
    POST /api/v1/inventory/reservations/<id>/commit
    Commit an active reservation, converting it to actual inventory movement.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)

        try:
            reservation, item = commit_reservation(
                reservation_id=pk,
                tenant=tenant,
                user=request.user,
            )
            return Response({
                "id": reservation.id,
                "status": reservation.status,
                "on_hand_after": int(float(item.on_hand)),
                "reserved_after": int(float(item.reserved)),
            }, status=200)
        except Reservation.DoesNotExist:
            return Response({"error": "Reservation not found"}, status=404)
        except Exception as e:
            return Response({"error": str(e)}, status=400)

