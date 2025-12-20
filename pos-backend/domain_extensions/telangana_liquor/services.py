# domain_extensions/telangana_liquor/services.py
"""
Business logic services for Telangana Liquor ICDC processing.

Includes:
- Rounding calculations
- Calculation validation
- Product/variant matching
- Category mapping
- Duplicate detection
- Inventory posting
- Purchase order creation
"""

import logging
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, List, Optional, Tuple, Any
from django.db import transaction
from django.utils import timezone

from domain_extensions.models import ICDCInvoice, ICDCInvoiceLine
from domain_extensions.telangana_liquor.parser import ICDCParser, ParsingError
from domain_extensions.registry import get_active_extension

logger = logging.getLogger(__name__)


# Rounding functions

def round_to_nearest_50(value: Decimal) -> Decimal:
    """
    Round to nearest 0.50.
    
    Examples:
        123.25 -> 123.50
        123.24 -> 123.00
        123.75 -> 124.00
    """
    # Multiply by 2, round to nearest integer, divide by 2
    return (value * 2).quantize(Decimal('1'), rounding=ROUND_HALF_UP) / 2


def round_to_100_plus_1(value: Decimal) -> Decimal:
    """
    Round to 100(+1) logic.
    
    This means rounding up to the next multiple of 100, then adding 1.
    
    Examples:
        123 -> 201 (200 + 1)
        199 -> 201 (200 + 1)
        200 -> 201
        299 -> 301 (300 + 1)
    """
    # Round up to next 100
    rounded_up = ((value // 100) + 1) * 100
    # Add 1
    return rounded_up + 1


def round_value(value: Decimal, rounding_mode: str = "nearest_0.50") -> Decimal:
    """
    Round a value based on the specified rounding mode.
    
    Args:
        value: Decimal value to round
        rounding_mode: "nearest_0.50" or "100_plus_1"
        
    Returns:
        Rounded Decimal value
    """
    if rounding_mode == "nearest_0.50":
        return round_to_nearest_50(value)
    elif rounding_mode == "100_plus_1":
        return round_to_100_plus_1(value)
    else:
        logger.warning(f"Unknown rounding mode: {rounding_mode}, using nearest_0.50")
        return round_to_nearest_50(value)


# Calculation functions

def calculate_unit_rate(btl_rate: Decimal, pack_qty: int, rounding_mode: str = "nearest_0.50") -> Decimal:
    """
    Calculate unit rate (case rate) from bottle rate and pack quantity.
    
    Formula: (btl_rate * pack_qty) rounded according to rounding_mode
    
    Args:
        btl_rate: Bottle rate
        pack_qty: Number of bottles per case
        rounding_mode: Rounding mode to apply
        
    Returns:
        Calculated unit rate
    """
    base_rate = btl_rate * Decimal(str(pack_qty))
    return round_value(base_rate, rounding_mode)


def calculate_line_total(
    unit_rate: Decimal,
    cases_delivered: int,
    btl_rate: Decimal,
    bottles_delivered: int
) -> Decimal:
    """
    Calculate line total.
    
    If bottles_delivered == 0:
        total = unit_rate * cases_delivered
    Else:
        total = (unit_rate * cases_delivered) + (btl_rate * bottles_delivered)
    
    Args:
        unit_rate: Case rate
        cases_delivered: Number of cases
        btl_rate: Bottle rate
        bottles_delivered: Number of loose bottles
        
    Returns:
        Calculated total
    """
    case_total = unit_rate * Decimal(str(cases_delivered))
    
    if bottles_delivered > 0:
        bottle_total = btl_rate * Decimal(str(bottles_delivered))
        return case_total + bottle_total
    else:
        return case_total


def validate_calculation(
    pdf_unit_rate: Decimal,
    pdf_btl_rate: Decimal,
    pdf_total: Decimal,
    pack_qty: int,
    cases_delivered: int,
    bottles_delivered: int,
    config: Dict[str, Any]
) -> Tuple[bool, List[str]]:
    """
    Validate calculations against PDF values.
    
    Args:
        pdf_unit_rate: Unit rate from PDF
        pdf_btl_rate: Bottle rate from PDF
        pdf_total: Total from PDF
        pack_qty: Pack quantity
        cases_delivered: Cases delivered
        bottles_delivered: Bottles delivered
        config: Domain configuration
        
    Returns:
        Tuple of (is_valid, list_of_discrepancy_reasons)
    """
    discrepancies = []
    rounding_mode = config.get("rounding_mode", "nearest_0.50")
    rate_tolerance = Decimal(str(config.get("rate_tolerance", 0.50)))
    total_tolerance = Decimal(str(config.get("total_tolerance", 1.00)))
    
    # Calculate expected unit rate
    expected_unit_rate = calculate_unit_rate(pdf_btl_rate, pack_qty, rounding_mode)
    
    # Check unit rate discrepancy
    rate_diff = abs(pdf_unit_rate - expected_unit_rate)
    if rate_diff > rate_tolerance:
        discrepancies.append(
            f"Unit rate discrepancy: PDF={pdf_unit_rate}, Calculated={expected_unit_rate}, Diff={rate_diff}"
        )
    
    # Calculate expected total
    expected_total = calculate_line_total(
        pdf_unit_rate,
        cases_delivered,
        pdf_btl_rate,
        bottles_delivered
    )
    
    # Check total discrepancy
    total_diff = abs(pdf_total - expected_total)
    if total_diff > total_tolerance:
        discrepancies.append(
            f"Total discrepancy: PDF={pdf_total}, Calculated={expected_total}, Diff={total_diff}"
        )
    
    return len(discrepancies) == 0, discrepancies


# Product/Variant matching

def match_product_by_code(tenant, brand_number: str):
    """
    Match Product by brand_number (Product.code).
    
    Args:
        tenant: Tenant instance
        brand_number: Brand number from PDF (preserve leading zeros)
        
    Returns:
        Product instance or None
    """
    from catalog.models import Product
    
    try:
        return Product.objects.filter(tenant=tenant, code=brand_number).first()
    except Exception as e:
        logger.error(f"Error matching product by code {brand_number}: {e}")
        return None


def match_product_by_name(tenant, brand_name: str):
    """
    Match Product by brand_name (Product.name, case-insensitive).
    
    Args:
        tenant: Tenant instance
        brand_name: Brand name from PDF
        
    Returns:
        Product instance or None
    """
    from catalog.models import Product
    
    try:
        return Product.objects.filter(
            tenant=tenant,
            name__iexact=brand_name
        ).first()
    except Exception as e:
        logger.error(f"Error matching product by name {brand_name}: {e}")
        return None


def match_variant_by_pattern(product, brand_name: str, size_ml: int):
    """
    Match Variant by pattern: <brand_name>-<size_ml>ml
    
    Args:
        product: Product instance
        brand_name: Brand name
        size_ml: Size in ml
        
    Returns:
        Variant instance or None
    """
    from catalog.models import Variant
    
    if not product:
        return None
    
    # Try exact pattern: <brand_name>-<size_ml>ml
    variant_name = f"{brand_name}-{size_ml}ml"
    try:
        variant = Variant.objects.filter(
            product=product,
            name__iexact=variant_name
        ).first()
        if variant:
            return variant
    except Exception as e:
        logger.error(f"Error matching variant by pattern {variant_name}: {e}")
    
    # Try alternative patterns
    alternative_patterns = [
        f"{brand_name}-{size_ml} ml",
        f"{brand_name} - {size_ml}ml",
        f"{brand_name} - {size_ml} ml",
    ]
    
    for pattern in alternative_patterns:
        try:
            variant = Variant.objects.filter(
                product=product,
                name__iexact=pattern
            ).first()
            if variant:
                return variant
        except Exception:
            continue
    
    return None


def match_product_and_variant(
    tenant,
    brand_number: str,
    brand_name: str,
    size_ml: int
) -> Tuple[Optional[Any], Optional[Any]]:
    """
    Match Product and Variant from ICDC line data.
    
    Strategy:
    1. Try to match Product by brand_number (exact match)
    2. If not found, try to match by brand_name (case-insensitive)
    3. For Variant, try to match by pattern <brand_name>-<size_ml>ml
    
    Args:
        tenant: Tenant instance
        brand_number: Brand number from PDF
        brand_name: Brand name from PDF
        size_ml: Size in ml
        
    Returns:
        Tuple of (Product, Variant) - either may be None
    """
    product = None
    
    # Try brand_number first (more reliable)
    if brand_number:
        product = match_product_by_code(tenant, brand_number)
    
    # Fallback to brand_name
    if not product and brand_name:
        product = match_product_by_name(tenant, brand_name)
    
    # Match variant
    variant = None
    if product and brand_name and size_ml:
        variant = match_variant_by_pattern(product, brand_name, size_ml)
    
    return product, variant


# Category mapping

def get_or_create_category(tenant, product_type: str):
    """
    Get or create Category from Product Type (Beer/IML).
    
    Args:
        tenant: Tenant instance
        product_type: Product type from PDF (e.g., "Beer", "IML")
        
    Returns:
        Category instance
    """
    from catalog.models import Category
    
    if not product_type:
        return None
    
    # Normalize product type
    product_type = product_type.strip().upper()
    
    # Map to category name
    category_name = product_type if product_type in ["BEER", "IML"] else product_type
    
    # Get or create category
    category, created = Category.objects.get_or_create(
        tenant=tenant,
        name=category_name,
        defaults={
            "description": f"Category for {category_name} products from ICDC invoices"
        }
    )
    
    if created:
        logger.info(f"Created new category: {category_name} for tenant {tenant.id}")
    
    return category


# Duplicate detection

def check_duplicate_icdc(tenant, icdc_number: str) -> Optional[ICDCInvoice]:
    """
    Check if ICDC number already exists for tenant.
    
    Args:
        tenant: Tenant instance
        icdc_number: ICDC number to check
        
    Returns:
        Existing ICDCInvoice instance or None
    """
    try:
        return ICDCInvoice.objects.filter(
            tenant=tenant,
            icdc_number=icdc_number
        ).first()
    except Exception as e:
        logger.error(f"Error checking duplicate ICDC: {e}")
        return None


def handle_duplicate(
    tenant,
    icdc_number: str,
    existing_invoice: ICDCInvoice
) -> Dict[str, Any]:
    """
    Handle duplicate ICDC number based on existing invoice status.
    
    Returns dictionary with action and info:
    {
        "action": "auto_open" | "block" | "allow_reupload",
        "existing_invoice_id": int,
        "existing_status": str,
        "message": str,
    }
    """
    status = existing_invoice.status
    
    if status in ["DRAFT", "REVIEW"]:
        return {
            "action": "auto_open",
            "existing_invoice_id": existing_invoice.id,
            "existing_status": status,
            "message": f"ICDC {icdc_number} already exists as {status}. Opening existing invoice.",
        }
    
    elif status == "RECEIVED":
        return {
            "action": "block",
            "existing_invoice_id": existing_invoice.id,
            "existing_status": status,
            "message": f"ICDC {icdc_number} has already been received. Cannot create duplicate.",
        }
    
    elif status in ["REVERSED", "CANCELLED"]:
        return {
            "action": "allow_reupload",
            "existing_invoice_id": existing_invoice.id,
            "existing_status": status,
            "message": f"ICDC {icdc_number} was previously {status}. This is a re-upload.",
            "requires_confirmation": True,
        }
    
    else:
        # Unknown status, block to be safe
        return {
            "action": "block",
            "existing_invoice_id": existing_invoice.id,
            "existing_status": status,
            "message": f"ICDC {icdc_number} exists with status {status}. Cannot proceed.",
        }


# Parsing service

def parse_icdc_pdf(pdf_file_path: str) -> Dict[str, Any]:
    """
    Parse an ICDC PDF file.
    
    Args:
        pdf_file_path: Path to PDF file
        
    Returns:
        Parsed data dictionary with header, lines, totals, and metadata
    """
    parser = ICDCParser()
    return parser.parse(pdf_file_path)


# Status workflow

def can_transition_status(current_status: str, new_status: str) -> bool:
    """
    Check if status transition is allowed.
    
    Allowed transitions:
    - DRAFT -> REVIEW (on edit/save)
    - REVIEW -> RECEIVED (on submit)
    - RECEIVED -> REVERSED (on reversal with approval)
    - Any -> CANCELLED (on cancellation)
    
    Args:
        current_status: Current status
        new_status: Desired new status
        
    Returns:
        True if transition is allowed
    """
    valid_transitions = {
        "DRAFT": ["REVIEW", "CANCELLED"],
        "REVIEW": ["RECEIVED", "DRAFT", "CANCELLED"],
        "RECEIVED": ["REVERSED", "CANCELLED"],
        "REVERSED": ["CANCELLED"],
        "CANCELLED": [],  # Cannot transition from cancelled
    }
    
    return new_status in valid_transitions.get(current_status, [])


def update_invoice_status(
    invoice: ICDCInvoice,
    new_status: str,
    user=None,
    save: bool = True
) -> ICDCInvoice:
    """
    Update invoice status with validation.
    
    Args:
        invoice: ICDCInvoice instance
        new_status: New status
        user: User performing the action
        save: Whether to save the invoice
        
    Returns:
        Updated invoice
        
    Raises:
        ValueError: If transition is not allowed
    """
    if not can_transition_status(invoice.status, new_status):
        raise ValueError(
            f"Cannot transition from {invoice.status} to {new_status}"
        )
    
    old_status = invoice.status
    invoice.status = new_status
    
    # Set timestamps
    if new_status == "RECEIVED" and not invoice.received_at:
        invoice.received_at = timezone.now()
    
    if new_status == "REVERSED":
        invoice.reversed_at = timezone.now()
        if user:
            invoice.reversed_by = user
    
    # Update status in canonical_data for audit
    if "status_history" not in invoice.canonical_data:
        invoice.canonical_data["status_history"] = []
    
    invoice.canonical_data["status_history"].append({
        "from_status": old_status,
        "to_status": new_status,
        "timestamp": timezone.now().isoformat(),
        "user_id": user.id if user else None,
    })
    
    if save:
        invoice.save(update_fields=["status", "received_at", "reversed_at", "reversed_by", "canonical_data"])
    
    return invoice


# Purchase Order creation

def create_purchase_order_from_icdc(
    invoice: ICDCInvoice,
    user
) -> 'PurchaseOrder':
    """
    Create a PurchaseOrder from ICDCInvoice.
    
    Args:
        invoice: ICDCInvoice instance (must be RECEIVED)
        user: User creating the PO
        
    Returns:
        Created PurchaseOrder instance
        
    Raises:
        ValueError: If invoice is not in valid status
    """
    from purchasing.models import PurchaseOrder, PurchaseOrderLine
    
    if invoice.status != "RECEIVED":
        raise ValueError(f"Cannot create PO for invoice with status {invoice.status}")
    
    if invoice.purchase_order_id:
        # PO already created
        return invoice.purchase_order
    
    with transaction.atomic():
        # Create PO
        po = PurchaseOrder.objects.create(
            tenant=invoice.tenant,
            store=invoice.store,
            vendor=invoice.vendor,
            is_external=True,
            vendor_invoice_number=invoice.icdc_number,
            vendor_invoice_date=invoice.invoice_date,
            import_source="PDF",
            invoice_document=invoice.pdf_file,
            status="RECEIVED",  # Immediately received since it's from ICDC
            notes=f"Created from ICDC Invoice {invoice.icdc_number}",
            created_by=user,
            received_at=invoice.received_at or timezone.now(),
        )
        
        # Generate PO number
        po.assign_po_number()
        
        # Create PO lines
        for line in invoice.lines.all():
            if not line.variant:
                logger.warning(f"ICDC line {line.id} has no matched variant, skipping PO line")
                continue
            
            # Calculate total quantity: (cases × pack_qty) + bottles
            total_qty = (line.cases_delivered * line.pack_qty) + line.bottles_delivered
            
            if total_qty <= 0:
                continue
            
            PurchaseOrderLine.objects.create(
                purchase_order=po,
                variant=line.variant,
                qty_ordered=total_qty,
                qty_received=total_qty,  # Already received
                unit_cost=line.btl_rate,
                notes=f"ICDC line {line.line_number}: {line.cases_delivered} cases + {line.bottles_delivered} bottles",
            )
        
        # Link invoice to PO
        invoice.purchase_order = po
        invoice.save(update_fields=["purchase_order"])
        
        return po


# Inventory posting

def post_inventory_from_icdc(
    invoice: ICDCInvoice,
    user,
    update_variant_cost: bool = False
) -> Tuple[List[Any], List[str]]:
    """
    Post inventory from ICDC invoice.
    
    Creates:
    - InventoryItem updates (increase on_hand)
    - StockLedger entries for receipts
    - StockLedger entries for breakage/shortage (if any)
    
    Args:
        invoice: ICDCInvoice instance (must be RECEIVED)
        user: User posting inventory
        update_variant_cost: Whether to update variant.cost if different from btl_rate
        
    Returns:
        Tuple of (list of ledger entries created, list of warnings)
    """
    from inventory.models import InventoryItem, StockLedger
    from catalog.models import Variant
    
    if invoice.status != "RECEIVED":
        raise ValueError(f"Cannot post inventory for invoice with status {invoice.status}")
    
    ledger_entries = []
    warnings = []
    
    with transaction.atomic():
        for line in invoice.lines.all():
            if not line.variant:
                warnings.append(f"Line {line.line_number}: No variant matched, skipping inventory update")
                continue
            
            variant = line.variant
            
            # Update variant cost if requested and different
            if update_variant_cost and line.btl_rate and variant.cost != line.btl_rate:
                old_cost = variant.cost
                variant.cost = line.btl_rate
                variant.save(update_fields=["cost"])
                warnings.append(
                    f"Line {line.line_number}: Updated variant {variant.sku} cost from {old_cost} to {line.btl_rate}"
                )
            
            # Calculate total quantity: (cases × pack_qty) + bottles
            total_qty = (line.cases_delivered * line.pack_qty) + line.bottles_delivered
            
            if total_qty <= 0:
                continue
            
            # Update inventory
            item, created = InventoryItem.objects.select_for_update().get_or_create(
                tenant=invoice.tenant,
                store=invoice.store,
                variant=variant,
                defaults={"on_hand": 0, "reserved": 0}
            )
            
            old_on_hand = item.on_hand or 0
            item.on_hand = old_on_hand + total_qty
            item.save(update_fields=["on_hand"])
            item.refresh_from_db(fields=["on_hand"])
            
            # Create ledger entry for receipt
            ledger_entry = StockLedger.objects.create(
                tenant=invoice.tenant,
                store=invoice.store,
                variant=variant,
                qty_delta=total_qty,
                balance_after=int(float(item.on_hand)),
                ref_type="ICDC_RECEIPT",
                ref_id=invoice.id,
                note=f"ICDC {invoice.icdc_number}: {line.cases_delivered} cases + {line.bottles_delivered} bottles of {variant.sku}",
                created_by=user,
            )
            ledger_entries.append(ledger_entry)
            
            # Handle breakage/shortage if bottles_delivered > 0
            # This represents broken/missing bottles
            if line.bottles_delivered > 0:
                # Create separate ledger entry for breakage/shortage
                # Use negative delta to represent loss
                # Note: We're not reducing inventory here because the total_qty already accounts for what was actually received
                # The bottles_delivered represents what should have been received but wasn't
                
                # Actually, bottles_delivered in ICDC represents loose bottles received (not lost)
                # So we don't create a negative entry here
                # Breakage/shortage would be tracked separately if needed
                pass
        
        return ledger_entries, warnings


# Reversal workflow

def reverse_icdc_invoice(
    invoice: ICDCInvoice,
    user,
    reason: str = ""
) -> Tuple[List[Any], List[str]]:
    """
    Reverse an ICDC invoice.
    
    Creates:
    - Reversal ledger entries (negative qty_delta)
    - Updates inventory (subtracts from on_hand)
    - Updates invoice status to REVERSED
    
    Args:
        invoice: ICDCInvoice instance (must be RECEIVED)
        user: User performing reversal
        reason: Reason for reversal
        
    Returns:
        Tuple of (list of ledger entries created, list of warnings)
    """
    from inventory.models import InventoryItem, StockLedger
    
    if invoice.status != "RECEIVED":
        raise ValueError(f"Cannot reverse invoice with status {invoice.status}")
    
    if invoice.status == "REVERSED":
        raise ValueError("Invoice is already reversed")
    
    ledger_entries = []
    warnings = []
    
    with transaction.atomic():
        # Reverse inventory for each line
        for line in invoice.lines.all():
            if not line.variant:
                warnings.append(f"Line {line.line_number}: No variant matched, skipping reversal")
                continue
            
            variant = line.variant
            
            # Calculate total quantity to reverse
            total_qty = (line.cases_delivered * line.pack_qty) + line.bottles_delivered
            
            if total_qty <= 0:
                continue
            
            # Update inventory (subtract)
            try:
                item = InventoryItem.objects.select_for_update().get(
                    tenant=invoice.tenant,
                    store=invoice.store,
                    variant=variant
                )
                
                old_on_hand = item.on_hand or 0
                new_on_hand = max(0, old_on_hand - total_qty)  # Don't go negative
                
                if new_on_hand != (old_on_hand - total_qty):
                    warnings.append(
                        f"Line {line.line_number}: Inventory would go negative, setting to 0"
                    )
                
                item.on_hand = new_on_hand
                item.save(update_fields=["on_hand"])
                item.refresh_from_db(fields=["on_hand"])
                
                # Create reversal ledger entry
                ledger_entry = StockLedger.objects.create(
                    tenant=invoice.tenant,
                    store=invoice.store,
                    variant=variant,
                    qty_delta=-total_qty,
                    balance_after=int(float(item.on_hand)),
                    ref_type="ICDC_REVERSAL",
                    ref_id=invoice.id,
                    note=f"Reversal of ICDC {invoice.icdc_number}: {line.cases_delivered} cases + {line.bottles_delivered} bottles of {variant.sku}. Reason: {reason}",
                    created_by=user,
                )
                ledger_entries.append(ledger_entry)
                
            except InventoryItem.DoesNotExist:
                warnings.append(
                    f"Line {line.line_number}: Inventory item not found, cannot reverse"
                )
                continue
        
        # Update invoice status
        update_invoice_status(invoice, "REVERSED", user=user, save=True)
        
        # Store reversal reason in canonical_data
        if "reversal" not in invoice.canonical_data:
            invoice.canonical_data["reversal"] = {}
        invoice.canonical_data["reversal"]["reason"] = reason
        invoice.canonical_data["reversal"]["reversed_at"] = timezone.now().isoformat()
        invoice.canonical_data["reversal"]["reversed_by_id"] = user.id if user else None
        invoice.save(update_fields=["canonical_data"])
        
        return ledger_entries, warnings

