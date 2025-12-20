---
name: Telangana Liquor ICDC PDF Ingestion Implementation
overview: Comprehensive implementation plan for Telangana Liquor ICDC (Invoice-cum-Delivery Challan) PDF ingestion feature with domain extension framework. Includes PDF parsing (OCR + text), wizard UI, purchase order integration, duplicate detection, draft saving, editing capabilities, and reversal workflow with proper guardrails and audit trails.
todos:
  - id: phase1-tenant-model
    content: Add business_domain and business_domain_config fields to Tenant model with migration
    status: completed
  - id: phase1-icdc-models
    content: Create ICDCInvoice and ICDCInvoiceLine models with all required fields, constraints, and indexes
    status: completed
    dependencies:
      - phase1-tenant-model
  - id: phase1-ledger-types
    content: Add BREAKAGE, SHORTAGE, ICDC_RECEIPT, ICDC_REVERSAL ref_types to StockLedger model
    status: completed
  - id: phase2-framework
    content: Create domain_extensions app structure with base framework and registry pattern
    status: completed
    dependencies:
      - phase1-tenant-model
  - id: phase2-telangana-extension
    content: Create TelanganaLiquorExtension class and register it in the framework
    status: completed
    dependencies:
      - phase2-framework
  - id: phase3-parser-base
    content: Implement base ICDCParser class with parsing result structure and version tracking
    status: completed
    dependencies:
      - phase2-telangana-extension
  - id: phase3-text-parsing
    content: Implement text-based PDF parsing for ICDC header, line items, and summary totals
    status: completed
    dependencies:
      - phase3-parser-base
  - id: phase3-ocr-parsing
    content: Implement OCR-based PDF parsing with table detection and column recognition
    status: completed
    dependencies:
      - phase3-parser-base
  - id: phase3-retry-logic
    content: Implement automatic retry logic with higher DPI, different PSM modes, and deskew options
    status: completed
    dependencies:
      - phase3-ocr-parsing
  - id: phase4-rounding
    content: Implement rounding logic (nearest 0.50, 100+1) with configurable rules from business_domain_config
    status: completed
    dependencies:
      - phase2-telangana-extension
  - id: phase4-calculations
    content: Implement calculation validation for unit rates, line totals, and summary totals with discrepancy detection
    status: completed
    dependencies:
      - phase4-rounding
  - id: phase4-matching
    content: Implement product/variant matching logic (brand_number → Product.code, brand_name → Product.name, variant pattern matching)
    status: completed
    dependencies:
      - phase1-icdc-models
  - id: phase4-categories
    content: Implement category mapping and auto-creation for Product Type (Beer/IML)
    status: completed
    dependencies:
      - phase4-matching
  - id: phase5-duplicate-detection
    content: Implement duplicate ICDC number detection with status-based handling (DRAFT/REVIEW auto-open, RECEIVED block, REVERSED reupload)
    status: completed
    dependencies:
      - phase1-icdc-models
  - id: phase5-status-workflow
    content: Implement status transition logic (DRAFT→REVIEW→RECEIVED→REVERSED) with validation guardrails
    status: completed
    dependencies:
      - phase5-duplicate-detection
  - id: phase6-po-creation
    content: Implement PurchaseOrder creation from ICDCInvoice with proper linking and PO line creation
    status: completed
    dependencies:
      - phase1-icdc-models
      - phase4-matching
  - id: phase6-inventory-posting
    content: Implement inventory update logic with StockLedger entries for receipts, breakage, and shortage
    status: completed
    dependencies:
      - phase6-po-creation
      - phase1-ledger-types
  - id: phase6-cost-update
    content: Implement variant cost update logic with user confirmation and audit logging
    status: completed
    dependencies:
      - phase6-inventory-posting
  - id: phase7-parse-api
    content: Create POST /api/v1/domain-extensions/telangana-liquor/icdc/parse endpoint with file upload and parsing
    status: completed
    dependencies:
      - phase3-retry-logic
  - id: phase7-save-draft-api
    content: Create POST /api/v1/domain-extensions/telangana-liquor/icdc/save-draft endpoint with duplicate handling
    status: completed
    dependencies:
      - phase5-duplicate-detection
      - phase4-calculations
  - id: phase7-submit-api
    content: Create POST /api/v1/domain-extensions/telangana-liquor/icdc/{id}/submit endpoint with PO creation and inventory update
    status: completed
    dependencies:
      - phase6-inventory-posting
      - phase6-cost-update
  - id: phase7-crud-apis
    content: Create GET, PUT, DELETE endpoints for ICDC invoice list, retrieve, update, and cancel operations
    status: completed
    dependencies:
      - phase5-status-workflow
  - id: phase8-reversal
    content: Implement reversal workflow with request, approval, inventory reversal, and audit trail
    status: completed
    dependencies:
      - phase6-inventory-posting
      - phase5-status-workflow
  - id: phase9-modal-step1
    content: "Create ICDCUploadModal Step 1: PDF upload with parsing and error handling"
    status: completed
    dependencies:
      - phase7-parse-api
  - id: phase9-modal-step2
    content: "Create ICDCUploadModal Step 2: Review & edit with product/variant matching and Create New functionality"
    status: completed
    dependencies:
      - phase9-modal-step1
      - phase4-matching
  - id: phase9-modal-step3
    content: "Create ICDCUploadModal Step 3: Validation & resolve with discrepancy display and issue resolution"
    status: completed
    dependencies:
      - phase9-modal-step2
      - phase4-calculations
  - id: phase9-modal-step4
    content: "Create ICDCUploadModal Step 4: Confirm & submit with success handling"
    status: completed
    dependencies:
      - phase9-modal-step3
      - phase7-submit-api
  - id: phase9-product-create
    content: Create ICDCProductCreateModal for creating products/variants from ICDC line data
    status: cancelled
    dependencies:
      - phase9-modal-step2
  - id: phase9-list-integration
    content: Integrate ICDC invoices into POList with button and special indicators
    status: completed
    dependencies:
      - phase9-modal-step4
  - id: phase9-detail-view
    content: Create ICDCDetail view component with editing and reversal capabilities
    status: completed
    dependencies:
      - phase8-reversal
      - phase7-crud-apis
  - id: phase10-integration
    content: Integrate ICDC functionality into PurchaseOrdersPage with feature flag checks
    status: completed
    dependencies:
      - phase9-list-integration
  - id: phase11-validation
    content: Implement comprehensive validation for all inputs, business rules, and state transitions
    status: completed
    dependencies:
      - phase7-submit-api
  - id: phase11-error-handling
    content: Implement error handling with try-catch, transaction rollback, and user-friendly messages
    status: completed
    dependencies:
      - phase11-validation
  - id: phase11-security
    content: "Implement security measures: tenant scoping, permissions, input sanitization, file validation"
    status: completed
    dependencies:
      - phase7-crud-apis
  - id: phase12-testing
    content: Write comprehensive unit, integration, and frontend tests with >80% code coverage
    status: pending
    dependencies:
      - phase10-integration
      - phase11-security
  - id: phase12-documentation
    content: Create API documentation, user guide, developer guide, and code comments
    status: completed
    dependencies:
      - phase12-testing
  - id: phase13-deployment
    content: Plan and execute migration strategy, feature flag rollout, and monitoring setup
    status: pending
    dependencies:
      - phase12-documentation
---

# Telangana Liquor ICDC PDF Ingestion - Implementation Plan

## Architecture Overview

### System Components

- **Domain Extension Framework**: Base framework for domain-specific customizations
- **ICDC Invoice System**: Telangana Liquor-specific document ingestion
- **PDF Parsing Engine**: OCR + text extraction with retry logic
- **Purchase Order Integration**: Links ICDC invoices to existing PO system
- **Wizard UI**: 4-step modal for user-friendly workflow

### Data Flow

```javascript
PDF Upload → Parse → Extract Data → Validate → Review/Edit → 
Match Products → Calculate Totals → Check Duplicates → 
Create Draft/Submit → Create PO → Update Inventory → Ledger Entries
```

---

## Phase 1: Database Schema & Core Models

### 1.1 Tenant Model Extension

**File**: `pos-backend/tenants/models.py`**Tasks**:

- Add `business_domain` CharField (max_length=50, nullable, blank=True, db_index=True)
- Add `business_domain_config` JSONField (default=dict, blank=True)
- Add database constraint: valid business_domain choices (or make it free-form for future)
- Update Meta indexes to include `business_domain`

**Edge Cases**:

- Migration safety: existing tenants have null business_domain (generic)
- Ensure backward compatibility with existing queries

**Testing**:

- Migration test: verify existing tenants unaffected
- Test business_domain filtering/queries
- Test business_domain_config JSON storage/retrieval

### 1.2 Domain Extension Base Models

**File**: `pos-backend/domain_extensions/models.py` (NEW)**Tasks**:

- Create base `DomainExtension` abstract model (for future extensions)
- Create `ICDCInvoice` model:
- Tenant, Store, Vendor FKs
- `icdc_number` CharField (unique per tenant)
- `invoice_date` DateField
- `pdf_file` FK to TenantDoc
- `purchase_order` FK to PurchaseOrder (nullable, created on submit)
- `status` CharField: DRAFT, REVIEW, RECEIVED, REVERSED, CANCELLED
- `raw_extraction` JSONField (complete PDF data)
- `canonical_data` JSONField (user-edited data)
- `parsing_errors` JSONField
- `calculation_discrepancies` JSONField
- `parsing_metadata` JSONField (OCR confidence, parser version)
- `is_reupload` BooleanField (for reversed/cancelled re-uploads)
- Audit fields: created_by, created_at, updated_at, received_at, reversed_at, reversed_by
- Create `ICDCInvoiceLine` model:
- FK to ICDCInvoice
- `line_number` IntegerField
- `brand_number` CharField (preserve leading zeros)
- `brand_name` CharField
- `product_type` CharField (Beer/IML)
- `pack_qty` IntegerField
- `size_ml` IntegerField
- `cases_delivered` IntegerField
- `bottles_delivered` IntegerField (default=0)
- `unit_rate` DecimalField (case rate)
- `btl_rate` DecimalField (bottle rate)
- `total` DecimalField (from PDF)
- `calculated_total` DecimalField (computed)
- `has_discrepancy` BooleanField
- `discrepancy_reason` TextField
- `raw_data` JSONField (pack_type, summary totals, etc.)
- `variant` FK to Variant (nullable until matched)
- `product` FK to Product (nullable until matched)
- Add Meta constraints: unique icdc_number per tenant, indexes for status, dates

**Edge Cases**:

- Ensure brand_number preserves leading zeros (use CharField, not IntegerField)
- Handle null variants during matching phase
- Store pack_type in raw_data JSON (not dedicated field for now)

**Testing**:

- Model creation/validation tests
- Unique constraint tests
- JSONField serialization tests
- Foreign key cascade tests

### 1.3 StockLedger Extension

**File**: `pos-backend/inventory/models.py`**Tasks**:

- Add new REF_TYPES: "BREAKAGE", "SHORTAGE", "ICDC_RECEIPT", "ICDC_REVERSAL"
- Ensure backward compatibility

**Testing**:

- Verify existing ledger entries unaffected
- Test new ref_type values

### 1.4 Migration Files

**Tasks**:

- Create migration for Tenant model changes
- Create migration for domain_extensions app
- Create migration for StockLedger ref_types

**Edge Cases**:

- Migration rollback safety
- Data migration for existing tenants

---

## Phase 2: Domain Extension Framework

### 2.1 Base Framework Structure

**Files**:

- `pos-backend/domain_extensions/__init__.py` (NEW)
- `pos-backend/domain_extensions/apps.py` (NEW)
- `pos-backend/domain_extensions/registry.py` (NEW)

**Tasks**:

- Create Django app structure
- Create extension registry pattern (dictionary-based, code → extension class)
- Create base `DomainExtension` class with hooks:
- `is_enabled(tenant)` - check if extension active
- `get_config(tenant)` - get domain config
- Future hooks for extensibility (pricing, attributes, etc.)
- Create helper functions:
- `get_active_extension(tenant)` - get extension for tenant's business_domain
- `is_extension_enabled(tenant, code)`

**Edge Cases**:

- Handle missing extension gracefully
- Handle multiple extensions (future-proof, but one per tenant for now)

**Testing**:

- Registry registration tests
- Extension lookup tests
- Config retrieval tests

### 2.2 Telangana Liquor Extension Registration

**Files**:

- `pos-backend/domain_extensions/telangana_liquor/__init__.py` (NEW)
- `pos-backend/domain_extensions/telangana_liquor/extension.py` (NEW)

**Tasks**:

- Create TelanganaLiquorExtension class
- Implement is_enabled, get_config methods
- Register extension in apps.py ready() method

**Testing**:

- Extension registration test
- Config retrieval test

---

## Phase 3: PDF Parsing Engine

### 3.1 Parser Base Interface

**File**: `pos-backend/domain_extensions/telangana_liquor/parser.py` (NEW)**Tasks**:

- Create `ICDCParser` class
- Define parsing result structure (header, lines, totals, errors)
- Implement parser version tracking
- Implement OCR confidence tracking

**Edge Cases**:

- Handle corrupted PDFs
- Handle password-protected PDFs
- Handle multi-page PDFs (ICDC might span pages)
- Handle missing/partial data gracefully

### 3.2 Text-Based PDF Parsing

**File**: `pos-backend/domain_extensions/telangana_liquor/parser.py`**Tasks**:

- Use `pdfplumber` or `PyPDF2` for text extraction
- Parse ICDC header fields:
- ICDC number, invoice date, delivery time, TP number
- Retailer info (name, code, address, license)
- Licensee info (license number, PAN, name, phone)
- Gazette code, license issue date
- Parse line items table:
- Brand number, brand name, product type, pack type
- Pack qty/size (parse "96/90" format)
- Cases delivered, bottles delivered
- Unit rate, btl rate, total
- Parse summary totals:
- Invoice value, rounding off, net invoice value
- Special excise cess, TCS
- E-challan/DD amount, previous credit, retailer credit balance
- Breakage/shortage/reverted quantities

**Edge Cases**:

- Handle malformed tables (missing columns, extra columns)
- Handle empty cells/null values
- Handle currency formatting (commas, decimals)
- Handle date formats (DD-MMM-YYYY, etc.)
- Handle text extraction failures (fallback to OCR)

**Testing**:

- Parse sample text-based PDFs
- Test edge cases (missing fields, malformed data)
- Test parsing accuracy

### 3.3 OCR-Based Parsing

**File**: `pos-backend/domain_extensions/telangana_liquor/parser.py`**Tasks**:

- Implement OCR using `pytesseract` or `paddleocr`
- Extract text with bounding boxes
- Implement table detection (row/column grouping by geometry)
- Implement column detection (token clustering by x-coordinates)
- Parse using same logic as text-based after OCR extraction
- Track OCR confidence scores per field

**Edge Cases**:

- Handle rotated/scanned images (deskew)
- Handle low-quality scans
- Handle different page orientations
- Handle handwritten annotations (should ignore)

**Testing**:

- Parse sample scanned PDFs
- Test OCR accuracy
- Test confidence scoring

### 3.4 Parsing Retry Logic

**File**: `pos-backend/domain_extensions/telangana_liquor/parser.py`**Tasks**:

- Implement automatic retry with:
- Higher DPI (300 → 400)
- Different PSM modes (page segmentation modes)
- With/without deskew
- Return best result (highest confidence)
- If all retries fail, return partial data with errors

**Edge Cases**:

- Retry timeout handling
- Memory management for large PDFs
- Handle retry failures gracefully

**Testing**:

- Test retry logic with various PDFs
- Test retry performance

### 3.5 Parsing Service

**File**: `pos-backend/domain_extensions/telangana_liquor/services.py` (NEW)**Tasks**:

- Create `parse_icdc_pdf(file: TenantDoc) -> dict` function
- Coordinate text-based vs OCR parsing
- Handle retry logic
- Format parsing results for storage
- Return parsing metadata (version, confidence, errors)

**Edge Cases**:

- File access errors
- File format errors
- Large file handling

**Testing**:

- Integration tests with real PDFs
- Error handling tests

---

## Phase 4: Business Logic & Calculations

### 4.1 Rounding Logic

**File**: `pos-backend/domain_extensions/telangana_liquor/services.py`**Tasks**:

- Implement rounding to nearest 0.50
- Implement rounding to 100(+1) logic
- Make rounding rules configurable via `business_domain_config`
- Default config: {"rounding_mode": "nearest_0.50", "case_rate_rounding": true}

**Edge Cases**:

- Handle edge cases (exact 0.50 boundaries)
- Handle negative values (should not occur, but validate)
- Handle very large numbers

**Testing**:

- Test rounding functions
- Test configurable rounding
- Test edge cases

### 4.2 Calculation Validation

**File**: `pos-backend/domain_extensions/telangana_liquor/services.py`**Tasks**:

- Calculate unit_rate from btl_rate × pack_qty + rounding
- Calculate line total:
- If bottles_delivered == 0: unit_rate × cases_delivered
- If bottles_delivered > 0: (unit_rate × cases_delivered) + (btl_rate × bottles_delivered)
- Compare calculated vs PDF values
- Store discrepancies in calculation_discrepancies JSON
- Tolerance configurable (default ±0.50 for rates, ±1.00 for totals)

**Edge Cases**:

- Handle division by zero
- Handle overflow (very large quantities)
- Handle precision issues (Decimal arithmetic)

**Testing**:

- Test calculation logic
- Test discrepancy detection
- Test tolerance thresholds

### 4.3 Product/Variant Matching

**File**: `pos-backend/domain_extensions/telangana_liquor/services.py`**Tasks**:

- Match Product by brand_number (exact match, preserve leading zeros)
- Match Product by brand_name (exact match, case-insensitive)
- Match Variant by pattern: `<brand_name>-<size_ml>ml`
- Store match results (matched_product_id, matched_variant_id, match_confidence)
- Handle multiple matches (prefer exact, then first match)
- Handle no matches (flag for user creation)

**Edge Cases**:

- Handle duplicate product codes (shouldn't happen, but validate)
- Handle similar brand names (fuzzy matching fallback?)
- Handle missing size_ml in variant name
- Handle variants with different naming patterns

**Testing**:

- Test product matching
- Test variant matching
- Test edge cases (duplicates, missing matches)

### 4.4 Category Mapping

**File**: `pos-backend/domain_extensions/telangana_liquor/services.py`**Tasks**:

- Map Product Type (Beer/IML) to Category
- Auto-create category if not exists
- Allow mapping to existing category
- Store mapping in canonical_data

**Edge Cases**:

- Handle category name conflicts
- Handle category deletion (orphaned products)

**Testing**:

- Test category creation
- Test category mapping
- Test category conflicts

### 4.5 Summary Totals Validation

**File**: `pos-backend/domain_extensions/telangana_liquor/services.py`**Tasks**:

- Sum line item totals
- Compare against PDF summary totals (invoice_value, net_invoice_value)
- Validate breakage/shortage/reverted quantities match line items
- Store validation results in calculation_discrepancies

**Edge Cases**:

- Handle missing summary totals
- Handle rounding differences in totals
- Handle breakage/shortage not matching line items

**Testing**:

- Test totals validation
- Test breakage/shortage validation
- Test edge cases

---

## Phase 5: Duplicate Detection & Status Management

### 5.1 Duplicate Detection Logic

**File**: `pos-backend/domain_extensions/telangana_liquor/services.py`**Tasks**:

- Check ICDC number uniqueness per tenant
- Handle duplicates based on status:
- DRAFT/REVIEW: Auto-open existing, return with warning
- RECEIVED: Block submission, return error with "View posted receipt" option
- REVERSED/CANCELLED: Allow but set is_reupload=True, require confirmation
- Return duplicate info: existing_invoice_id, existing_status, existing_created_at, existing_created_by

**Edge Cases**:

- Handle concurrent duplicate submissions
- Handle case sensitivity in ICDC numbers
- Handle ICDC number format variations

**Testing**:

- Test duplicate detection
- Test status-based handling
- Test concurrent submissions

### 5.2 Status Workflow Management

**File**: `pos-backend/domain_extensions/telangana_liquor/services.py`**Tasks**:

- Implement status transition logic:
- DRAFT → REVIEW (on first edit/save)
- REVIEW → RECEIVED (on submit)
- RECEIVED → REVERSED (on reversal with approval)
- Any → CANCELLED (on cancellation)
- Validate status transitions (guard rails)
- Store status change audit trail

**Edge Cases**:

- Prevent invalid transitions
- Handle concurrent status changes
- Handle status changes after posting

**Testing**:

- Test status transitions
- Test invalid transition prevention
- Test audit trail

---

## Phase 6: Inventory Posting & Purchase Order Creation

### 6.1 Purchase Order Creation

**File**: `pos-backend/domain_extensions/telangana_liquor/services.py`**Tasks**:

- Create PurchaseOrder when ICDCInvoice submitted (status=RECEIVED)
- Set PurchaseOrder fields:
- is_external=True
- vendor_invoice_number=icdc_number
- vendor_invoice_date=invoice_date
- import_source="PDF"
- invoice_document=pdf_file
- status="RECEIVED" (immediately received)
- Create PurchaseOrderLine for each ICDCInvoiceLine:
- variant, qty_ordered (cases × pack_qty + bottles), unit_cost (btl_rate)
- Link ICDCInvoice to PurchaseOrder
- Generate PO number

**Edge Cases**:

- Handle missing vendor
- Handle missing variants (shouldn't happen after review)
- Handle quantity calculations (cases + bottles)
- Handle cost updates (if variant cost different from btl_rate)

**Testing**:

- Test PO creation
- Test PO line creation
- Test linking
- Test quantity calculations

### 6.2 Inventory Update

**File**: `pos-backend/domain_extensions/telangana_liquor/services.py`**Tasks**:

- Update InventoryItem for each line:
- Calculate total quantity: (cases_delivered × pack_qty) + bottles_delivered
- Add to on_hand
- Use select_for_update() for atomicity
- Create StockLedger entries:
- ref_type="ICDC_RECEIPT" (or reuse "PURCHASE_ORDER_RECEIPT"?)
- ref_id=icdc_invoice.id
- qty_delta, balance_after
- note with ICDC details
- Handle breakage/shortage:
- Create separate ledger entries with ref_type="BREAKAGE" or "SHORTAGE"
- Negative qty_delta
- Document in notes

**Edge Cases**:

- Handle negative quantities (shouldn't happen, but validate)
- Handle concurrent inventory updates
- Handle inventory item creation (first receipt)
- Handle breakage/shortage calculations

**Testing**:

- Test inventory updates
- Test ledger entries
- Test breakage/shortage
- Test concurrent updates

### 6.3 Variant Cost Update

**File**: `pos-backend/domain_extensions/telangana_liquor/services.py`**Tasks**:

- Compare btl_rate with variant.cost
- If different, update variant.cost (with user confirmation flag)
- Log cost change in audit trail
- Store cost update info in canonical_data

**Edge Cases**:

- Handle cost = 0 (shouldn't update)
- Handle very large cost differences (warn user)
- Handle cost update conflicts

**Testing**:

- Test cost comparison
- Test cost update
- Test audit logging

---

## Phase 7: Backend API Endpoints

### 7.1 Parse Endpoint

**File**: `pos-backend/domain_extensions/telangana_liquor/api.py` (NEW)**Endpoint**: `POST /api/v1/domain-extensions/telangana-liquor/icdc/parse`**Tasks**:

- Accept PDF file upload (multipart/form-data)
- Validate file type, size (max 10MB)
- Check tenant business_domain == "telangana_liquor"
- Call parser service
- Return parsed data structure
- Handle parsing errors gracefully

**Request**:

```json
{
  "file": File
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    "header": {...},
    "lines": [...],
    "totals": {...}
  },
  "metadata": {
    "parser_version": "1.0",
    "confidence": 0.95,
    "parsing_method": "text" | "ocr"
  },
  "errors": [],
  "warnings": []
}
```

**Edge Cases**:

- File validation errors
- Parsing failures (return partial data)
- Tenant domain mismatch
- Large file handling

**Testing**:

- Test file upload
- Test parsing
- Test error handling
- Test tenant validation

### 7.2 Save Draft Endpoint

**Endpoint**: `POST /api/v1/domain-extensions/telangana-liquor/icdc/save-draft`**Tasks**:

- Accept parsed data + user edits
- Validate data structure
- Check duplicate (if ICDC number exists, handle per status)
- Create/update ICDCInvoice (status=DRAFT)
- Store raw_extraction and canonical_data
- Return invoice ID

**Request**:

```json
{
  "icdc_number": "ICDC040021225019029",
  "invoice_date": "2025-12-02",
  "store_id": 1,
  "vendor_id": 1,
  "header": {...},
  "lines": [...],
  "totals": {...}
}
```

**Response**:

```json
{
  "id": 123,
  "icdc_number": "ICDC040021225019029",
  "status": "DRAFT",
  "duplicate_info": null
}
```

**Edge Cases**:

- Duplicate handling (return existing invoice)
- Validation errors
- Missing required fields
- Concurrent saves

**Testing**:

- Test draft creation
- Test draft update
- Test duplicate handling
- Test validation

### 7.3 Submit Endpoint

**Endpoint**: `POST /api/v1/domain-extensions/telangana-liquor/icdc/{id}/submit`**Tasks**:

- Load ICDCInvoice (must be DRAFT or REVIEW)
- Validate all data (products matched, calculations correct)
- Check for discrepancies (warn but allow)
- Create PurchaseOrder
- Update inventory
- Create ledger entries
- Update status to RECEIVED
- Return success + PO ID

**Edge Cases**:

- Invalid status (block)
- Missing products/variants (block)
- Calculation discrepancies (warn but allow)
- Inventory update failures (rollback)

**Testing**:

- Test submission
- Test validation
- Test PO creation
- Test inventory update
- Test rollback on errors

### 7.4 Update Endpoint

**Endpoint**: `PUT /api/v1/domain-extensions/telangana-liquor/icdc/{id}`**Tasks**:

- Allow updates if status DRAFT or REVIEW
- Allow updates if RECEIVED (with guardrails - see Phase 8)
- Validate data
- Update canonical_data
- Update status to REVIEW if was DRAFT
- Return updated invoice

**Edge Cases**:

- Status restrictions
- Validation errors
- Concurrent updates

**Testing**:

- Test updates
- Test status restrictions
- Test validation

### 7.5 List/Retrieve Endpoints

**Endpoints**:

- `GET /api/v1/domain-extensions/telangana-liquor/icdc/`
- `GET /api/v1/domain-extensions/telangana-liquor/icdc/{id}/`

**Tasks**:

- List invoices (paginated, filtered by status, date range)
- Retrieve single invoice with lines
- Include purchase_order info if linked
- Tenant-scoped queries

**Edge Cases**:

- Pagination
- Filtering
- Performance (large lists)

**Testing**:

- Test listing
- Test retrieval
- Test filtering
- Test pagination

### 7.6 Delete/Cancel Endpoint

**Endpoint**: `DELETE /api/v1/domain-extensions/telangana-liquor/icdc/{id}`**Tasks**:

- Allow deletion only if DRAFT or REVIEW (soft delete or status=CANCELLED)
- Block if RECEIVED (must use reversal)
- Return success

**Edge Cases**:

- Status restrictions
- Linked PO (prevent deletion)

**Testing**:

- Test deletion
- Test restrictions

---

## Phase 8: Reversal Workflow

### 8.1 Reversal Request Endpoint

**Endpoint**: `POST /api/v1/domain-extensions/telangana-liquor/icdc/{id}/request-reversal`**Tasks**:

- Load ICDCInvoice (must be RECEIVED)
- Create reversal request (store in metadata or separate model)
- Set status to REVERSAL_REQUESTED (or keep RECEIVED, use flag)
- Require reason/notes
- Return reversal request ID

**Edge Cases**:

- Invalid status
- Already reversed
- Missing reason

**Testing**:

- Test reversal request
- Test restrictions

### 8.2 Reversal Approval Endpoint

**Endpoint**: `POST /api/v1/domain-extensions/telangana-liquor/icdc/{id}/approve-reversal`**Tasks**:

- Check user permissions (role-based: owner/manager only)
- Load reversal request
- Create reversal ledger entries (negative qty_delta)
- Reverse inventory (subtract from on_hand)
- Update status to REVERSED
- Store reversal audit trail
- Link reversal to original invoice

**Edge Cases**:

- Permission checks
- Inventory already changed (warn)
- Concurrent reversals

**Testing**:

- Test reversal approval
- Test permissions
- Test inventory reversal
- Test audit trail

### 8.3 Reversal Model (Optional)

**Consider**: Separate `ICDCInvoiceReversal` model for better audit trail**Tasks**:

- Model with FK to ICDCInvoice
- Store reversal reason, approved_by, approved_at
- Store reversal ledger entry IDs
- Track reversal status

**Testing**:

- Test reversal model
- Test audit trail

---

## Phase 9: Frontend UI Components

### 9.1 ICDC Upload Modal - Step 1: Upload

**File**: `pos-frontend/src/features/inventory/operations/telangana-liquor/ICDCUploadModal.tsx` (NEW)**Tasks**:

- Create wizard modal component (similar to ReceiveExternalPOModal)
- Step 1: PDF file upload
- Drag & drop or file picker
- Show file preview/name
- Validate file type/size
- "Parse PDF" button
- Call parse API on upload
- Show parsing progress/status
- Handle parsing errors (show retry button, manual edit option)

**Edge Cases**:

- Large file upload progress
- Parsing timeout
- Network errors
- Invalid file types

**Testing**:

- Test file upload
- Test parsing
- Test error handling
- Test UI responsiveness

### 9.2 ICDC Upload Modal - Step 2: Review & Edit

**Tasks**:

- Display parsed data in editable table
- Header fields: ICDC number, date, retailer info (read-only), store selector, vendor selector
- Line items table (editable):
- Brand number, brand name, product type
- Pack qty/size, cases, bottles
- Rates, totals
- Product/Variant match status (matched/unmatched)
- "Create New" button for unmatched products
- Show calculation discrepancies inline (warning badges)
- Show missing product/variant warnings
- Allow manual edits to all fields
- "Save Draft" button

**Edge Cases**:

- Large number of line items (virtualization?)
- Editing calculations (recalculate totals)
- Product creation modal integration

**Testing**:

- Test data display
- Test editing
- Test validation
- Test product creation flow

### 9.3 ICDC Upload Modal - Step 3: Validate & Resolve

**Tasks**:

- Show summary of discrepancies
- Show missing products/variants list
- Show category mapping options
- Show cost update confirmations
- Show breakage/shortage summary
- Allow resolving issues before submit
- "Submit" button (disabled if critical issues)

**Edge Cases**:

- Many discrepancies (scrollable list)
- Resolving issues inline

**Testing**:

- Test validation display
- Test issue resolution
- Test submit enable/disable

### 9.4 ICDC Upload Modal - Step 4: Confirm & Submit

**Tasks**:

- Show final summary
- Show purchase order preview
- Show inventory impact preview
- Confirm submission
- Handle submission success/error
- Redirect to PO list on success

**Edge Cases**:

- Submission errors
- Network failures

**Testing**:

- Test submission flow
- Test success/error handling

### 9.5 Product/Variant Creation Modal

**File**: `pos-frontend/src/features/inventory/operations/telangana-liquor/ICDCProductCreateModal.tsx` (NEW)**Tasks**:

- Pre-fill form with data from ICDC line
- Brand number → Product code
- Brand name → Product name
- Product type → Category
- Size → Variant name pattern
- Allow user to edit before creating
- Create product + variant
- Return to ICDC modal with updated match

**Edge Cases**:

- Duplicate product codes
- Category creation
- Validation errors

**Testing**:

- Test product creation
- Test variant creation
- Test integration with ICDC modal

### 9.6 ICDC Invoice List Integration

**File**: `pos-frontend/src/features/inventory/operations/purchase-orders/POList.tsx`**Tasks**:

- Add "Receive ICDC Invoice" button (only if business_domain === "telangana_liquor")
- Display ICDC invoices in PO list with special indicator/badge
- Show ICDC number, status, date
- Link to ICDC detail view
- Filter by ICDC invoices

**Edge Cases**:

- Feature flag visibility
- Mixed PO types in list

**Testing**:

- Test button visibility
- Test list display
- Test filtering

### 9.7 ICDC Invoice Detail View

**File**: `pos-frontend/src/features/inventory/operations/telangana-liquor/ICDCDetail.tsx` (NEW)**Tasks**:

- Display invoice details
- Display line items with matches
- Display discrepancies
- Show linked PO
- Show ledger entries
- Allow editing (if status allows)
- Allow reversal (if RECEIVED)
- Show audit trail

**Edge Cases**:

- Read-only vs editable
- Permission checks

**Testing**:

- Test detail display
- Test editing
- Test reversal flow

---

## Phase 10: Integration & Workflow

### 10.1 Purchase Orders Page Integration

**File**: `pos-frontend/src/features/inventory/operations/purchase-orders/PurchaseOrdersPage.tsx`**Tasks**:

- Add "Receive ICDC Invoice" button next to "Receive External PO"
- Conditionally show based on tenant.business_domain
- Integrate ICDCUploadModal
- Refresh PO list after submission

**Edge Cases**:

- Feature flag check
- Modal state management

**Testing**:

- Test button visibility
- Test modal integration
- Test list refresh

### 10.2 Purchase Order Detail Integration

**File**: `pos-frontend/src/features/inventory/operations/purchase-orders/PODetail.tsx`**Tasks**:

- Show ICDC invoice link if PO was created from ICDC
- Show ICDC badge/indicator
- Link to ICDC detail view

**Edge Cases**:

- Missing ICDC link
- Deleted ICDC invoice

**Testing**:

- Test PO detail display
- Test ICDC link

### 10.3 Vendor Suggestion

**Tasks**:

- Extract vendor info from PDF (depot name, address)
- Suggest vendor creation with pre-filled data
- Show "Create Vendor" option in modal

**Edge Cases**:

- Missing vendor info in PDF
- Duplicate vendor names

**Testing**:

- Test vendor suggestion
- Test vendor creation

---

## Phase 11: Error Handling & Validation

### 11.1 Comprehensive Validation

**Files**: All service files**Tasks**:

- Input validation (types, ranges, required fields)
- Business rule validation (quantities, rates, totals)
- Data consistency validation (matches, calculations)
- State validation (status transitions, permissions)
- Return clear error messages

**Edge Cases**:

- Invalid data types
- Out of range values
- Missing required fields
- Invalid state transitions

**Testing**:

- Test all validation rules
- Test error messages

### 11.2 Error Handling

**Tasks**:

- Try-catch blocks around critical operations
- Transaction rollback on errors
- Graceful degradation (partial data, manual entry fallback)
- User-friendly error messages
- Log errors for debugging

**Edge Cases**:

- Database errors
- File system errors
- Network errors
- Parsing errors

**Testing**:

- Test error scenarios
- Test rollback
- Test error messages

### 11.3 Security Considerations

**Tasks**:

- Tenant scoping (all queries)
- Permission checks (role-based)
- Input sanitization
- SQL injection prevention (Django ORM)
- File upload validation
- XSS prevention (frontend)

**Edge Cases**:

- Cross-tenant access attempts
- Unauthorized actions
- Malicious file uploads

**Testing**:

- Test tenant isolation
- Test permissions
- Test security

---

## Phase 12: Testing & Documentation

### 12.1 Unit Tests

**Tasks**:

- Test all models (creation, validation, constraints)
- Test all services (parsing, calculations, matching, posting)
- Test all API endpoints
- Test edge cases
- Achieve >80% code coverage

**Files**:

- `pos-backend/domain_extensions/telangana_liquor/tests.py` (NEW)
- `pos-backend/domain_extensions/telangana_liquor/tests_parser.py` (NEW)
- `pos-backend/domain_extensions/telangana_liquor/tests_services.py` (NEW)
- `pos-backend/domain_extensions/telangana_liquor/tests_api.py` (NEW)

### 12.2 Integration Tests

**Tasks**:

- Test full workflow (upload → parse → review → submit)
- Test PO creation integration
- Test inventory update integration
- Test reversal workflow
- Test duplicate handling
- Test with real PDF samples

### 12.3 Frontend Tests

**Tasks**:

- Test modal workflows
- Test form validation
- Test API integration
- Test error handling

### 12.4 Documentation

**Tasks**:

- API documentation (OpenAPI/Swagger)
- User guide (PDF ingestion workflow)
- Developer guide (extension framework)
- Code comments
- README for domain_extensions app

---

## Phase 13: Deployment & Rollout

### 13.1 Migration Strategy

**Tasks**:

- Test migrations on staging
- Backup production database
- Run migrations
- Verify data integrity
- Rollback plan

### 13.2 Feature Flag Rollout

**Tasks**:

- Enable for test tenant first
- Monitor errors/logs
- Gradual rollout to production tenants
- Kill switch (disable feature if needed)

### 13.3 Monitoring & Logging

**Tasks**:

- Log all parsing operations (success/failure)
- Log all submissions
- Log all reversals
- Monitor performance (parsing time, API response time)
- Alert on errors

---

## Dependencies & Requirements

### Backend Dependencies

- `pdfplumber` or `PyPDF2` (PDF text extraction)
- `pytesseract` or `paddleocr` (OCR)
- `Pillow` (image processing)
- `pdf2image` (PDF to image conversion)

### Configuration

- Tesseract OCR installation (system dependency)
- OCR configuration in settings
- File upload limits
- Parsing timeout settings

---

## Open Questions & TODOs

### TODO: Configuration Management

- [ ] Decide on rounding rules default values
- [ ] Decide on tolerance thresholds (default values)
- [ ] Document configuration options in business_domain_config

### TODO: Performance Optimization

- [ ] Consider async/background job for PDF parsing (if slow)
- [ ] Consider caching parsed results
- [ ] Consider pagination for large line item lists

### TODO: Future Enhancements

- [ ] Multi-page PDF support (if needed)
- [ ] Batch PDF upload
- [ ] PDF template recognition (different ICDC formats)
- [ ] Export ICDC data to CSV/Excel
- [ ] ICDC invoice printing

### TODO: Edge Cases to Monitor

- [ ] Monitor real-world PDF variations
- [ ] Monitor OCR accuracy in production
- [ ] Monitor calculation discrepancies frequency
- [ ] Monitor duplicate detection effectiveness

---

## Success Criteria

1. ✅ PDF parsing works for both text-based and scanned PDFs
2. ✅ All ICDC data extracted and stored accurately
3. ✅ Duplicate detection works correctly
4. ✅ Purchase orders created and linked properly
5. ✅ Inventory updated correctly with audit trail
6. ✅ Reversal workflow works with approvals
7. ✅ UI is user-friendly and intuitive
8. ✅ All edge cases handled gracefully
9. ✅ Performance acceptable (<30s for parsing, <5s for submission)
10. ✅ Code coverage >80%
11. ✅ Production-ready (error handling, logging, monitoring)

---

## Estimated Timeline

- Phase 1-2: 2-3 days (Database & Framework)
- Phase 3: 3-4 days (PDF Parsing)
- Phase 4: 2-3 days (Business Logic)
- Phase 5: 1-2 days (Duplicate & Status)
- Phase 6: 2-3 days (Inventory & PO)
- Phase 7: 3-4 days (Backend API)
- Phase 8: 2-3 days (Reversal)
- Phase 9: 5-7 days (Frontend UI)
- Phase 10: 1-2 days (Integration)