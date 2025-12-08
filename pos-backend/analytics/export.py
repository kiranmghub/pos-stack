# analytics/export.py
"""
Export utilities for inventory data (CSV/JSON).
"""
import csv
import json
from io import StringIO, BytesIO
from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Any, Optional
from django.db.models import QuerySet
from django.utils import timezone


class DecimalEncoder(json.JSONEncoder):
    """JSON encoder that handles Decimal types"""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)


def export_to_csv(rows: List[Dict[str, Any]], fieldnames: Optional[List[str]] = None) -> str:
    """
    Export a list of dictionaries to CSV format.
    
    Args:
        rows: List of dictionaries to export
        fieldnames: Optional list of field names (if not provided, uses keys from first row)
    
    Returns:
        CSV string
    """
    if not rows:
        return ""
    
    output = StringIO()
    if fieldnames is None:
        fieldnames = list(rows[0].keys())
    
    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction='ignore')
    writer.writeheader()
    
    for row in rows:
        # Convert Decimal to string for CSV
        csv_row = {}
        for key, value in row.items():
            if isinstance(value, Decimal):
                csv_row[key] = str(value)
            elif isinstance(value, datetime):
                csv_row[key] = value.isoformat()
            elif value is None:
                csv_row[key] = ""
            else:
                csv_row[key] = value
        writer.writerow(csv_row)
    
    return output.getvalue()


def export_to_json(rows: List[Dict[str, Any]], indent: int = 2) -> str:
    """
    Export a list of dictionaries to JSON format.
    
    Args:
        rows: List of dictionaries to export
        indent: JSON indentation (default: 2)
    
    Returns:
        JSON string
    """
    return json.dumps(rows, cls=DecimalEncoder, indent=indent, ensure_ascii=False)


def prepare_inventory_item_row(item) -> Dict[str, Any]:
    """Prepare inventory item data for export"""
    return {
        "id": item.id,
        "tenant_id": item.tenant_id,
        "store_id": item.store_id,
        "store_code": item.store.code if item.store else None,
        "store_name": item.store.name if item.store else None,
        "variant_id": item.variant_id,
        "sku": item.variant.sku if item.variant else None,
        "product_name": item.variant.product.name if item.variant and item.variant.product else None,
        "on_hand": int(float(item.on_hand)) if item.on_hand else 0,
        "reserved": int(float(item.reserved)) if item.reserved else 0,
        "available": int(float(item.on_hand or 0) - float(item.reserved or 0)),
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


def prepare_ledger_row(entry) -> Dict[str, Any]:
    """Prepare stock ledger entry data for export"""
    return {
        "id": entry.id,
        "tenant_id": entry.tenant_id,
        "store_id": entry.store_id,
        "store_code": entry.store.code if entry.store else None,
        "store_name": entry.store.name if entry.store else None,
        "variant_id": entry.variant_id,
        "sku": entry.variant.sku if entry.variant else None,
        "product_name": entry.variant.product.name if entry.variant and entry.variant.product else None,
        "qty_delta": entry.qty_delta,
        "balance_after": entry.balance_after,
        "ref_type": entry.ref_type,
        "ref_id": entry.ref_id,
        "note": entry.note or "",
        "created_by": entry.created_by.username if entry.created_by else None,
        "created_at": entry.created_at,
    }


def prepare_transfer_row(transfer) -> Dict[str, Any]:
    """Prepare inventory transfer data for export"""
    return {
        "id": transfer.id,
        "tenant_id": transfer.tenant_id,
        "from_store_id": transfer.from_store_id,
        "from_store_code": transfer.from_store.code if transfer.from_store else None,
        "to_store_id": transfer.to_store_id,
        "to_store_code": transfer.to_store.code if transfer.to_store else None,
        "status": transfer.status,
        "notes": transfer.notes or "",
        "created_by": transfer.created_by.username if transfer.created_by else None,
        "created_at": transfer.created_at,
    }


def prepare_transfer_line_row(line) -> Dict[str, Any]:
    """Prepare inventory transfer line data for export"""
    return {
        "transfer_id": line.transfer_id,
        "variant_id": line.variant_id,
        "sku": line.variant.sku if line.variant else None,
        "qty": line.qty,
        "qty_sent": line.qty_sent or 0,
        "qty_received": line.qty_received or 0,
        "qty_remaining": line.qty_remaining,
    }


def prepare_count_session_row(session) -> Dict[str, Any]:
    """Prepare count session data for export"""
    return {
        "id": session.id,
        "tenant_id": session.tenant_id,
        "store_id": session.store_id,
        "store_code": session.store.code if session.store else None,
        "code": session.code or "",
        "status": session.status,
        "scope": session.scope,
        "zone_name": session.zone_name or "",
        "note": session.note or "",
        "created_by": session.created_by.username if session.created_by else None,
        "started_at": session.started_at,
        "finalized_at": session.finalized_at,
        "created_at": session.created_at,
        "updated_at": session.updated_at,
    }


def prepare_count_line_row(line) -> Dict[str, Any]:
    """Prepare count line data for export"""
    return {
        "session_id": line.session_id,
        "variant_id": line.variant_id,
        "sku": line.variant.sku if line.variant else None,
        "expected_qty": line.expected_qty or 0,
        "counted_qty": line.counted_qty or 0,
        "variance": (line.counted_qty or 0) - (line.expected_qty or 0),
        "method": line.method or "",
        "location": line.location or "",
    }


def prepare_purchase_order_row(po) -> Dict[str, Any]:
    """Prepare purchase order data for export"""
    return {
        "id": po.id,
        "tenant_id": po.tenant_id,
        "store_id": po.store_id,
        "store_code": po.store.code if po.store else None,
        "vendor_id": po.vendor_id,
        "vendor_name": po.vendor.name if po.vendor else None,
        "po_number": po.po_number or "",
        "status": po.status,
        "notes": po.notes or "",
        "created_by": po.created_by.username if po.created_by else None,
        "created_at": po.created_at,
        "updated_at": po.updated_at,
        "submitted_at": po.submitted_at,
        "received_at": po.received_at,
    }


def prepare_purchase_order_line_row(line) -> Dict[str, Any]:
    """Prepare purchase order line data for export"""
    return {
        "purchase_order_id": line.purchase_order_id,
        "variant_id": line.variant_id,
        "sku": line.variant.sku if line.variant else None,
        "qty_ordered": line.qty_ordered,
        "qty_received": line.qty_received or 0,
        "qty_remaining": line.qty_remaining,
        "unit_cost": str(line.unit_cost),
    }

