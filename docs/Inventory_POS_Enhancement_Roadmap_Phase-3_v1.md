# Phase 3 – Multi-Channel & Predictive Inventory (Implementation Plan v1)

> **Goal:** Layer advanced capabilities (reservations, omnichannel APIs, forecasting, analytics, integrations) on top of the hardened + operational stack from Phases 1–2, while reusing existing Django apps wherever possible.

---

## Shared Assumptions

- `InventoryItem` remains the canonical store/variant record with `on_hand` and `reserved`. We only introduce new tables when no equivalent exists (e.g., `webhooks` or `purchasing` extensions).
- `StockLedger` continues to house all audit data. Any new event (reservations, waste, etc.) must map to a defined `ref_type`.
- Channel-specific APIs should live under `inventory/api.py` or a companion module (`inventory/api_channels.py`) but reuse DRF config and middleware.
- Forecasting/analytics leverage existing sales data (`orders.SaleLine`), ledger entries, and counts. Heavy computations can live under an `analytics` package.

---

## Increment 1 – Reservations & Backorders Engine

**Objective:** Activate `InventoryItem.reserved` so multiple channels can safely hold stock.  
**Code:** `inventory/models.py`, `inventory/api.py`, `pos/views.py`, `orders/api.py`, tests.

1. Define a service/helper (e.g., `inventory/reservations.py`) with functions:
   - `reserve_stock(store_id, variant_id, qty, ref_type, ref_id)`
   - `release_reservation(...)`
   - `commit_reservation(...)`
   Implementation should lock `InventoryItem` row and adjust `reserved`.
2. Add API endpoints under `/api/v1/inventory/reservations` that wrap these helpers; reuse JWT tenant context.
3. Update POS “parked cart” flows (if/when implemented) to call `reserve -> commit/release` rather than reducing `on_hand` immediately.
4. Introduce tenant flag `allow_backorders`. If true, `reserve_stock` can exceed `on_hand`; `commit` writes ledger with negative balances as today’s clamp removal.
5. Tests: reservations update `reserved`, do not change `on_hand` until commit, and respect tenant settings.

---

## Increment 2 – Multi-Channel Inventory API

**Objective:** Expose a single API for POS, web, marketplaces, etc., to query availability and perform reservations.  
**Code:** `inventory/api.py` (or `inventory/api_channels.py`), `inventory/auth.py` (optional), documentation.

1. Endpoints:
   - `GET /api/v1/inventory/availability?variant_id=&store_id=` returning `{on_hand, reserved, available, in_transit}`.
   - `POST /api/v1/inventory/reserve`, `/release`, `/commit` delegating to Increment 1 helpers.
2. Add a `channel` string on reservations & ledger metadata (`POS`, `WEB`, `MARKETPLACE`, etc.).  
3. Rate limiting / throttling can reuse DRF throttles or a middleware to avoid abusive clients.
4. Document usage (OpenAPI via `drf-spectacular`) so external channels can integrate.

---

## Increment 3 – Forecasting & Predictive Reorder

**Objective:** Build demand forecasts using existing sales + inventory data.  
**Code:** new module `analytics/forecast.py`, extend `inventory/api.py`, front-end dashboards.

1. Compute rolling sales velocity per variant/store (7/30/90 day windows) from `orders.SaleLine`. Use Django ORM aggregations or cached queries.
2. Add vendor lead-time + safety-stock metadata (reuse Phase 2 purchase-order data) to calculate recommended reorder quantity.
3. Endpoint `/api/v1/inventory/reorder_forecast` returns:
   - `predicted_stockout_date`
   - `recommended_order_qty`
   - `confidence_score` (basic heuristic).
4. Owner dashboard: show “At-risk items” list and projection charts.

---

## Increment 4 – Vendor Analytics & Scorecards

**Objective:** Provide insights using the purchase-order data from Phase 2.  
**Code:** `purchasing/models.py`, `analytics/api_vendor.py`, UI components.

1. Metrics: on-time %, average lead time, fill rate, cost variance, price history. Compute via aggregations on `PurchaseOrder` and `PurchaseOrderLine`.
2. Endpoint `/api/v1/analytics/vendors/<id>/scorecard`.
3. Front-end: vendor detail page showing KPIs, charts, and alert thresholds (e.g., late deliveries).

---

## Increment 5 – Shrinkage, Aging, and Cycle Count Analytics

**Objective:** Turn ledger + count data into actionable reports.  
**Code:** `analytics/services/shrinkage.py`, `inventory/api_counts.py`, dashboards.

1. Shrinkage: sum negative deltas from `CountSession` adjustments and categorize by reason (damage, theft, etc., derived from `AdjustmentReason`).
2. Aging: identify variants with no sales in X days using `orders.SaleLine`.
3. Coverage: compute `% of catalog counted` within given period.
4. UI: Inventory Health tab with charts/trends.

---

## Increment 6 – Real-Time Notifications & Webhooks

**Objective:** Notify external systems of stock events.  
**Code:** new `webhooks` app (if not already present), `inventory/events.py`.

1. Define webhook subscriptions per tenant with event types: `inventory.stock_changed`, `inventory.transfer_sent`, `inventory.transfer_received`, `inventory.count_finalized`, `purchase_order.received`.
2. Hook into existing code paths (checkout, returns, transfers, counts, PO receive) to publish events after successful transactions.
3. Implement signing + retry/backoff (reuse Django signals or Celery if already configured).
4. Provide documentation & example payloads.

---

## Increment 7 – Advanced Returns & Lifecycle

**Objective:** Extend returns workflow for inspection/disposition without replacing existing models.  
**Code:** `orders/models.py` (Return/ReturnItem), `orders/views.py`, `inventory/models.py`.

1. Add status fields for returns (e.g., `draft`, `awaiting_inspection`, `accepted`, `rejected`).
2. Add inspection endpoints that set disposition per return line (restock vs waste).  
3. Restock path: same as Phase 1 ledger logic.  
   Waste path: create `StockLedger` entry using existing `ref_type="TRANSFER"` or new `WASTE` (added in Phase 2). Decrement `on_hand` accordingly.
4. POS/back-office UI: show inspection queues and actions.

---

## Increment 8 – Enterprise Auditing & Data Exports

**Objective:** Provide first-class export and audit tooling.  
**Code:** `inventory/management/commands/`, `analytics/export.py`.

1. Snapshot export command: dumps inventory, ledger, transfers, counts, POs to CSV/JSON.  
2. Delta export: only ledger rows since last run (store “last exported id” per tenant).  
3. Audit trail: extend `AuditLog` (already in `orders.models`) or create similar logs in other apps to capture who changed inventory settings, POs, counts, etc.
4. Optional S3/SFTP uploader using existing settings.

---

## Suggested Order

1. Reservations/backorders (Increment 1) – foundation for multi-channel.
2. Multi-channel API (Increment 2) – exposes the reservation engine.
3. Forecasting (Increment 3) – relies on stable ledger/sales data.
4. Vendor analytics (Increment 4) – leverages POs from Phase 2.
5. Shrinkage/aging analytics (Increment 5).
6. Webhooks/integrations (Increment 6).
7. Advanced returns (Increment 7).
8. Auditing/export (Increment 8).

Each increment should be turned into a task with objective, touched files, precise steps, and acceptance criteria to keep development predictable and secure.

```markdown
(End of Phase 3 Plan v1)
```
