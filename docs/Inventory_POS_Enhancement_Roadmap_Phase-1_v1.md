# Phase 1 – Inventory & POS Hardening (Implementation Plan v1)

> **Goal:** Use what already exists in the repository to fix correctness, safety, and observability gaps without inventing brand-new paradigms. We only extend models/APIs when there is no reusable construct, and every change must preserve current validations and security posture.

---

## 0. Scope Principles

- **Reuse first.** e.g., reuse `inventory.models.StockLedger` (choices: `ADJUSTMENT`, `SALE`, `RETURN`, `TRANSFER`, `RECEIPT`, `COUNT`) instead of creating a second ledger model.
- **Guard existing flows.** Adjust `pos/views.py`, `orders/views.py`, `inventory/api.py`, etc., rather than rewriting them.
- **One source of truth.** `InventoryItem.on_hand` remains canonical; any derived `available` values come from the existing `reserved` column.
- **Security-aware.** Tenant scoping via `common.middleware.TenantContextMiddleware` and register-session middleware stays in place; new features must enforce them rather than bypassing them.

---

## Increment 1 – POS Checkout Inventory & Ledger Parity

**Objective:** Make `/api/v1/pos/checkout` update `InventoryItem` correctly and write `StockLedger` entries using the existing `SALE` ref_type.  
**Code:** `pos/views.py`, `inventory/models.py`, `inventory/api.py` (ledger listing), `pos/tests.py`.

1. Wrap the checkout mutation block in `transaction.atomic()` (already present but verify).  
2. Replace the clamp-to-zero logic (`inv.on_hand = max(0, on_hand - qty)`) with:
   - `InventoryItem.objects.select_for_update()` per line.
   - If `on_hand < qty`, raise a 409/422 response (insufficient stock). Tenant config for oversell will come later; do not allow negatives in Phase 1.
3. After persisting `SaleLine`, append a `StockLedger` row (existing model) with:
   - `ref_type="SALE"` (already allowed)
   - `ref_id=sale.id`
   - `qty_delta=-qty`
   - `balance_after=item.on_hand`
   - `note` reuses existing sale metadata.
4. Update `/api/v1/inventory/ledger` to include these new entries with no schema change.
5. Tests: add regression cases for success, insufficient stock, and ledger creation under `pos/tests.py`.

---

## Increment 2 – Canonical Totals & SaleLine Fields

**Objective:** Ensure `SaleLine` data matches what `pos/services/totals.py::compute_receipt` returns, so downstream refunds and analytics rely on persisted facts rather than UI math.  
**Code:** `pos/views.py`, `pos/services/totals.py`, `orders/models.py`, `orders/serializers.py`, `orders/tests.py`.

1. Continue to use `compute_receipt` (already shared by quote & checkout) as the single source of subtotal/discount/tax/grand total.  
2. After computing `ReceiptOut`, write the following to each `SaleLine`:
   - `unit_price`
   - `discount` (line-level)
   - `tax`
   - `line_total` (net + tax + fee).  
   `orders.models.SaleLine` already exposes these fields; just trust `compute_receipt`.
3. Persist Sale-level totals (`subtotal`, `discount_total`, `tax_total`, `total`). Add columns if necessary but prefer reusing `Sale.total` and storing the other values in `receipt_data` until a migration is in place.
4. Reject any client-provided monetary overrides. Allow only `{variant_id, qty, unit_price}` like today; `unit_price` continues to be validated against catalog pricing rules if needed.
5. Add tests verifying `quoteTotals` == persisted Sale totals and that returns (next increment) use those numbers.

---

## Increment 3 – Returns & Restock Ledger Alignment

**Objective:** Move returns away from the legacy `StockLedgerEntry` helper and onto `inventory.models.StockLedger`, without changing business semantics.  
**Code:** `orders/views.py` (ReturnFinalizeView), `orders/serializers.py`, `inventory/models.py`, `inventory/tests.py`.

1. Inside `ReturnFinalizeView`, reuse the same locking approach as checkout:
   - `InventoryItem.objects.select_for_update()` for each restocked variant.
   - `on_hand += qty_returned` (no clamp; returns always increase stock).
2. Replace `StockLedgerEntry` usage with `StockLedger`:
   - `ref_type="RETURN"` (already in choices)
   - `ref_id=return.id`
   - `qty_delta=+qty`
   - `balance_after=item.on_hand`
3. Ensure refund calculations pull from canonical `SaleLine` fields updated in Increment 2 (`unit_price`, `discount`, `tax`). The helper `Refund.compute_line_refund` already does this; just confirm it’s using the updated data.
4. Tests: finalize return should increase `on_hand`, create ledger rows, and use canonical monetary data.

---

## Increment 4 – Centralize Stock Mutation Hooks

**Objective:** Guarantee that any creation of `SaleLines` (POS, admin, seeds) hits the same inventory+ledger logic.  
**Code:** `orders/apps.py`, `orders/signals.py`, `inventory/models.py`.

1. In `orders/apps.py`, implement `OrdersConfig.ready()` that imports `orders.signals`.  
2. Update `orders/signals.update_inventory_on_sale_line` to:
   - Use `select_for_update()`.
   - Block if invoked for `Sale` objects already processed via POS (avoid double depletion). Easiest approach: only act when `sale.status` transitions to `completed` or when a specific flag (`sale.source != 'pos'`) is set.
   - Write `StockLedger` entries instead of `StockLedgerEntry`.
3. If we need reusable utilities, add them under `inventory/utils.py` (new file) rather than inventing an unrelated service layer.
4. Tests: creating a sale via ORM/admin triggers the same inventory change.

---

## Increment 5 – Configurable Low-Stock Thresholds

**Objective:** Remove hard-coded thresholds (`<= 5` or `<= 10`) from API/UI and instead reuse existing models for configuration.  
**Code:** `catalog/models.py` (Variant), `tenants/models.py`, `inventory/api.py`, `pos-frontend/src/features/*`.

1. Add nullable `reorder_point` and `reorder_point_override` fields to `catalog.Variant` (existing model).  
2. Add tenant-level defaults to `tenants.Tenant` (e.g., `default_reorder_point`).  
3. Update `inventory/api.py::InventoryOverviewView`, `StockByStoreListView`, and `inventory/views.LowStockView` to compute `is_low_stock` via:
   ```
   threshold = variant.reorder_point or tenant.default_reorder_point or 0
   is_low_stock = on_hand <= threshold
   ```
4. Return both `is_low_stock` and `threshold` in responses; front-end simply displays them. Remove front-end constants (`LOW_STOCK_THRESHOLD = 5` in `PosScreen.tsx` & `InventoryRoute.tsx`).
5. Tests: verify low-stock counts respect per-variant and tenant defaults.

---

## Increment 6 – Register Session + Store Access Enforcement

**Objective:** Use the existing `pos.middleware.RegisterSessionMiddleware` and `TenantUser.stores` relationship to restrict POS activity.  
**Code:** `pos/views.py`, `pos/views_register.py`, `pos/permissions.py`, `stores/models.py`.

1. Checkout and quote endpoints should require `request.register_session_id` (already set by middleware). If missing, return 401.  
2. Validate that the register session belongs to the requested store (`RegisterSession.register.store_id == store_id`). Use existing `RegisterSession` model; no new schema needed.
3. Enforce store assignments: ensure the acting user has either:
   - `TenantUser.stores` empty (meaning all stores), or
   - Contains the target store. Reuse existing `TenantUser` relation.
4. Front-end: ensure register-session token is sent via `Authorization: Register <token>`; reuse existing start/end session endpoints. Add fallback UI prompts rather than new APIs.
5. Tests: unauthorized store or missing session should fail; authorized scenarios pass.

---

## Increment 7 – Minimal Regression Suite & Health Check Command

**Objective:** Add guard rails using Django tests and a management command.  
**Code:** `pos/tests.py`, `orders/tests.py`, `inventory/tests.py`, `inventory/management/commands/inventory_check.py`.

1. Tests to cover:
   - POS checkout success/failure (ledger + on_hand).
   - Return restock.
   - Admin-created sale triggers inventory update via signals.
   - Low-stock calculation respects configuration.
2. Create `inventory/management/commands/inventory_check.py` that:
   - Pulls each `InventoryItem`.
   - Recomputes `on_hand` from `StockLedger` deltas grouped by variant+store.
   - Logs any mismatches (non-zero difference).
3. Command should exit 0 if clean, non-zero if mismatches found (so ops can wire it into CI/manual audits).

---

## Execution Order (Safe Dependency Chain)

1. Increment 1 (checkout fix) – unlocks ledger parity.
2. Increment 2 (canonical totals) – ensures data quality before returns.
3. Increment 3 (returns) – depends on increments 1–2.
4. Increment 4 (signals) – ensures non-POS paths align.
5. Increment 5 (low-stock config) – independent once ledger is reliable.
6. Increment 6 (register enforcement) – security improvement after core flows work.
7. Increment 7 (tests + health check) – freeze safety rails at end of phase.

Each increment can be turned into a Codex ticket with **objective**, **files**, **steps**, and **acceptance criteria** exactly as described above.

```markdown
(End of Phase 1 Plan v1)
```
