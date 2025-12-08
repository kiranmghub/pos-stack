# Phase 2 – Operational Inventory (Implementation Plan v1)

> **Goal:** Build on Phase 1’s hardening work to deliver day-to-day operational capabilities (transfers, counts, purchasing, APIs, UX) by extending existing Django apps instead of inventing new systems.

---

## 0. Guiding Constraints

- **Single ledger:** Continue to use `inventory.models.StockLedger`. If new `ref_type`s are needed (e.g., `TRANSFER_OUT` vs `TRANSFER_IN`), add them via migrations before referencing them.
- **Existing APIs first:** Extend `inventory/api.py`, `inventory/api_counts.py`, `inventory/api_transfers` (same file) rather than adding parallel endpoints.
- **Shared models:** Transfers, counts, purchase orders rely on `InventoryItem`, `InventoryTransfer`, `CountSession`, `PurchaseOrder` (new) but should reuse stores, variants, tenants.
- **Performance via ORM tools:** Prefer `select_related` / `prefetch_related` to minimize changes.

---

## Increment 1 – Ledger RefTypes & Query API

**Objective:** Make `StockLedger` a complete record for operational analytics.  
**Code:** `inventory/models.py`, `inventory/api.py`, `inventory/admin.py`, tests.

1. Add migrations that extend `StockLedger.REF_TYPES` to `TRANSFER_OUT`, `TRANSFER_IN`, `COUNT_RECONCILE`, `PURCHASE_ORDER_RECEIPT`, `WASTE`. Existing rows keep their old values.
2. Update any code writing ledger entries (Phase 1 increments) to use the correct enum constant.
3. Expand `/api/v1/inventory/ledger` to support filters: `store_id`, `variant_id`, `ref_type`, `date_from/date_to`, `ref_id`, search text. Reuse the current class-based view; add query params.
4. Improve Django admin registration for `StockLedger` to include list filters for the new types.

---

## Increment 2 – Transfers v2 (Send/Receive + In-Transit)

**Objective:** Upgrade `InventoryTransfer` to match real-world steps using the existing models.  
**Code:** `inventory/models.py`, `inventory/api.py` (transfer endpoints), `pos-frontend/src/features/inventory/TransfersPage.tsx`.

1. Extend `InventoryTransfer.status` choices to include `IN_TRANSIT` and `PARTIAL_RECEIVED`.  
2. In `InventoryTransferLine`, add nullable `qty_sent` and `qty_received`. Use defaults of `qty` for backwards compatibility.
3. Update `TransferDetailView` actions:
   - `send`: lock source `InventoryItem` rows, validate `on_hand >= qty`, decrement, set `line.qty_sent = qty`, set transfer status `IN_TRANSIT`, log `TRANSFER_OUT`.
   - `receive`: accept payload `{variant_id, qty_receive}`, update `line.qty_received`, lock destination `InventoryItem`, increment `on_hand`, log `TRANSFER_IN`. If all lines received, status `RECEIVED`, else `PARTIAL_RECEIVED`.
4. (Optional) expose per-line `qty_remaining = qty_sent - qty_received` so UI can show outstanding items.
5. React UI already has partial receive scaffolding; wire it to the updated response shape.

---

## Increment 3 – Cycle Counts v2 (Scopes & Variance)

**Objective:** Enhance `CountSession` to prevent overlaps and expose variance before finalization.  
**Code:** `inventory/models_counts.py`, `inventory/api_counts.py`, `src/features/inventory/CountsPage.tsx`.

1. Add `scope` (`FULL_STORE`, `ZONE`) and optional `zone_name` fields to `CountSession`.  
2. Validate in `CountSessionListCreateView` that only one active (`DRAFT`/`IN_PROGRESS`) `FULL_STORE` session exists per store. Zone sessions can overlap.
3. Store `expected_qty` snapshot the first time a line is scanned (already done) and add a new endpoint `/api/v1/inventory/counts/<id>/variance` that reads `CountLine` deltas (expected vs counted).
4. During `CountFinalizeView`, write ledger with `ref_type="COUNT_RECONCILE"` (added in Increment 1). Keep adjustments exactly as in Phase 1 but update `StockLedger` to use the new ref_type.
5. Front-end: show scope/zone, block creation of new full-store counts if one exists, add a “Variance Preview” panel using the new endpoint.

---

## Increment 4 – Reorder Suggestions (Low-Stock Workflow)

**Objective:** Turn the configurable thresholds from Phase 1 into actionable reorder lists.  
**Code:** `inventory/api.py`, `catalog/models.py`, `owner dashboard`.

1. Extend existing API module with `ReorderSuggestionView` (`/api/v1/inventory/reorder_suggestions`). It should:
   - Iterate InventoryItems (optionally filtered by store/category).
   - Use `variant.reorder_point` or tenant default.
   - If `on_hand <= threshold`, include the row with suggested quantity (`threshold - on_hand` or a fixed `reorder_qty` field if we add it).
2. Add optional `reorder_qty` to `Variant` if needed; default to threshold minus on_hand.
3. Front-end:
   - Inventory tab: add “Reorder” section listing suggestions with export (CSV).
   - Owner dashboard: show top items nearing zero with `threshold` metadata.

---

## Increment 5 – Purchase Orders v1 (Inbound Stock)

**Objective:** Introduce POs using a new `purchasing` module that still relies on existing stores/variants/ledger.  
**Code:** new `pos-backend/purchasing/` app, `inventory/api.py` (for ledger reuse), front-end PO components.

1. Create `purchasing` app with models `Vendor`, `PurchaseOrder`, `PurchaseOrderLine` referencing `stores.Store` & `catalog.Variant`.
2. Provide CRUD endpoints under `/api/v1/purchasing/pos`:
   - create/update DRAFT PO with lines.
   - submit PO (status `SUBMITTED`).
   - `POST /receive` to record partial/complete receipts.
3. During receive:
   - Lock destination `InventoryItem`.
   - Increment `on_hand`.
   - Write `StockLedger` with `ref_type="PURCHASE_ORDER_RECEIPT"`.
4. Minimal React UI: list POs per store, create, and receive. Reuse existing component patterns (tables, modals).
5. Keep security identical to other inventory endpoints (tenant checks, store scoping).

---

## Increment 6 – Inventory APIs & Performance

**Objective:** Improve existing endpoints rather than adding new ones everywhere.  
**Code:** `inventory/api.py`, `catalog/api.py`.

1. Ensure `/api/v1/inventory/stock` and `/api/v1/inventory/overview` accept `page`, `page_size`, `category`, `search`. Use Django pagination classes already configured in DRF settings.
2. Add a new aggregated endpoint `/api/v1/inventory/stock_summary` that:
   - Aggregates per variant across stores using Django ORM (`values` + `annotate`).
   - Returns `total_on_hand`, `per_store` breakdown (can be nested).
3. Address N+1 issues flagged earlier:
   - `Variant` queries in Pos products should `select_related("product", "tax_category", "product__tax_category")`.
   - Inventory API should `select_related("variant__product")`.

---

## Increment 7 – UX Enhancements

**Objective:** Surface the new data in the existing React dashboards.  
**Scope:** `src/features/inventory`, `src/features/owner`, `src/features/pos`.

1. Inventory overview page: add KPI cards for `total_skus`, `total_qty`, `total_value` (already available from `_inventory_summary`), and “Transfers in transit”.
2. Transfers tab: show new statuses (DRAFT/IN_TRANSIT/PARTIAL/RECEIVED) with filters.
3. Counts tab: highlight active sessions per store with scope/zone metadata.
4. POS product cards: continue using backend-provided `is_low_stock` and reorder thresholds from Phase 1; no new calculations.

---

## Increment 8 – Tests & Health Checks (Phase 2 Scope)

**Objective:** Extend the test suite to cover Phase 2 behavior.  
**Code:** `inventory/tests.py`, `purchasing/tests.py`, `analytics` tests.

1. Transfers tests: send + partial receive + final receive, verifying ledger entries and statuses.
2. Counts tests: overlapping scope enforcement, variance endpoint, ledger reconciliation.
3. Purchase order tests: DRAFT → SUBMITTED → partial receive. Ensure ledger/warnings align.
4. Expand `inventory_check` command to optionally compare ledger deltas grouped by `ref_type`.

---

## Suggested Order

1. Increment 1 (ledger ref types/API) – prerequisite for the rest.
2. Increment 2 (transfers) – relies on new ref types.
3. Increment 3 (counts) – uses new ledger entries too.
4. Increment 4 (reorder suggestions).
5. Increment 5 (purchase orders).
6. Increment 6 (API/perf).
7. Increment 7 (UX).
8. Increment 8 (tests/health checks).

Each increment can be handed to Codex with objective, touched files, tasks, and acceptance criteria as above.

```markdown
(End of Phase 2 Plan v1)
```
