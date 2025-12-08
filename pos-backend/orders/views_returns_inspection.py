# orders/views_returns_inspection.py
"""
Advanced Returns & Inspection Workflow API endpoints.
"""
from decimal import Decimal
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Return, ReturnItem
from .serializers import ReturnSerializer, ReturnItemSerializer
from .views import _resolve_request_tenant


class ReturnSubmitForInspectionView(APIView):
    """
    POST /api/v1/returns/{pk}/submit_for_inspection
    
    Submit a draft return for inspection.
    Changes status from 'draft' to 'awaiting_inspection'.
    
    Security:
    - Requires authentication
    - Tenant-scoped
    - Only draft returns can be submitted
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)

        ret = get_object_or_404(Return, pk=pk, tenant=tenant)
        
        if ret.status != "draft":
            return Response(
                {"error": f"Only draft returns can be submitted for inspection. Current status: {ret.status}"},
                status=400
            )
        
        if not ret.items.exists():
            return Response({"error": "Cannot submit return without items"}, status=400)

        with transaction.atomic():
            ret.status = "awaiting_inspection"
            ret.save(update_fields=["status"])

        return Response(ReturnSerializer(ret).data, status=200)


class ReturnInspectionView(APIView):
    """
    POST /api/v1/returns/{pk}/inspect
    
    Inspect return items and set disposition (RESTOCK or WASTE) for each item.
    
    Body: {
      "items": [
        {
          "return_item_id": 123,
          "disposition": "RESTOCK",  // or "WASTE"
          "condition": "RESALEABLE",  // optional, updates condition
          "notes": "Optional inspection notes"
        },
        ...
      ]
    }
    
    Security:
    - Requires authentication
    - Tenant-scoped
    - Only awaiting_inspection returns can be inspected
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)

        ret = get_object_or_404(Return, pk=pk, tenant=tenant)
        
        if ret.status != "awaiting_inspection":
            return Response(
                {"error": f"Only returns awaiting inspection can be inspected. Current status: {ret.status}"},
                status=400
            )

        payload = request.data or {}
        items_data = payload.get("items", [])
        
        if not items_data:
            return Response({"error": "items array required"}, status=400)

        with transaction.atomic():
            # Process each inspection item
            inspected_count = 0
            for item_data in items_data:
                return_item_id = item_data.get("return_item_id")
                disposition = item_data.get("disposition")
                condition = item_data.get("condition")
                notes = item_data.get("notes")
                
                if not return_item_id:
                    return Response({"error": "return_item_id required for each item"}, status=400)
                
                if not disposition:
                    return Response({"error": "disposition required for each item"}, status=400)
                
                if disposition not in ["RESTOCK", "WASTE"]:
                    return Response(
                        {"error": f"Invalid disposition: {disposition}. Must be RESTOCK or WASTE"},
                        status=400
                    )
                
                # Get return item
                try:
                    return_item = ret.items.get(id=return_item_id)
                except ReturnItem.DoesNotExist:
                    return Response(
                        {"error": f"ReturnItem {return_item_id} not found in this return"},
                        status=404
                    )
                
                # Update disposition
                return_item.disposition = disposition
                return_item.inspected_by = request.user
                return_item.inspected_at = timezone.now()
                
                # Update condition if provided
                if condition:
                    if condition not in [choice[0] for choice in ReturnItem.CONDITION_CHOICES]:
                        return Response({"error": f"Invalid condition: {condition}"}, status=400)
                    return_item.condition = condition
                
                # Update notes if provided
                if notes:
                    return_item.notes = (return_item.notes or "") + f"\n[Inspection] {notes}"
                
                # Sync restock field for backward compatibility
                return_item.restock = (disposition == "RESTOCK")
                
                return_item.save()
                inspected_count += 1
            
            # Check if all items have been inspected
            all_items = ret.items.all()
            all_inspected = all(
                item.disposition in ["RESTOCK", "WASTE"]
                for item in all_items
            )
            
            if all_inspected:
                # Determine overall return status based on dispositions
                has_restock = any(item.disposition == "RESTOCK" for item in all_items)
                has_waste = any(item.disposition == "WASTE" for item in all_items)
                
                # If all items are waste, mark as rejected
                # Otherwise, mark as accepted (can proceed to finalization)
                if has_waste and not has_restock:
                    ret.status = "rejected"
                else:
                    ret.status = "accepted"
                
                ret.save(update_fields=["status"])

        return Response({
            "message": f"Inspected {inspected_count} item(s)",
            "return": ReturnSerializer(ret).data
        }, status=200)


class ReturnAcceptView(APIView):
    """
    POST /api/v1/returns/{pk}/accept
    
    Accept a return after inspection.
    Changes status from 'awaiting_inspection' or 'accepted' to 'accepted'.
    All items must have been inspected (disposition set).
    
    Security:
    - Requires authentication
    - Tenant-scoped
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)

        ret = get_object_or_404(Return, pk=pk, tenant=tenant)
        
        if ret.status not in ["awaiting_inspection", "accepted"]:
            return Response(
                {"error": f"Return must be awaiting inspection or accepted. Current status: {ret.status}"},
                status=400
            )
        
        # Verify all items have been inspected
        all_items = ret.items.all()
        uninspected = [item for item in all_items if item.disposition == "PENDING"]
        
        if uninspected:
            return Response(
                {"error": f"{len(uninspected)} item(s) still pending inspection"},
                status=400
            )

        with transaction.atomic():
            ret.status = "accepted"
            ret.save(update_fields=["status"])

        return Response(ReturnSerializer(ret).data, status=200)


class ReturnRejectView(APIView):
    """
    POST /api/v1/returns/{pk}/reject
    
    Reject a return after inspection.
    Changes status to 'rejected'.
    Typically used when all items are marked as WASTE.
    
    Security:
    - Requires authentication
    - Tenant-scoped
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        tenant = _resolve_request_tenant(request)
        if not tenant:
            return Response({"error": "No tenant"}, status=400)

        ret = get_object_or_404(Return, pk=pk, tenant=tenant)
        
        if ret.status not in ["awaiting_inspection", "accepted"]:
            return Response(
                {"error": f"Return must be awaiting inspection or accepted. Current status: {ret.status}"},
                status=400
            )

        with transaction.atomic():
            ret.status = "rejected"
            ret.save(update_fields=["status"])

        return Response(ReturnSerializer(ret).data, status=200)


class ReturnInspectionQueueView(generics.ListAPIView):
    """
    GET /api/v1/returns/inspection_queue?store_id=
    
    List returns awaiting inspection.
    
    Security:
    - Requires authentication
    - Tenant-scoped
    - Filterable by store
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ReturnSerializer

    def get_queryset(self):
        tenant = _resolve_request_tenant(self.request)
        if not tenant:
            return Return.objects.none()
        
        qs = Return.objects.filter(
            tenant=tenant,
            status="awaiting_inspection"
        ).select_related("sale", "store", "processed_by").prefetch_related("items")
        
        store_id = self.request.GET.get("store_id")
        if store_id:
            try:
                qs = qs.filter(store_id=int(store_id))
            except (ValueError, TypeError):
                pass
        
        return qs.order_by("created_at", "id")

