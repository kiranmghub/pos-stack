# Sales Module Roadmap & Design Spec

> **Context**
>
> - Multi-tenant POS system (`pos-backend` + `pos-frontend`)
> - Current `Sales` page at `/sales` with:
>   - Sales list (polished table)
>   - Detail drawer (sale details, items, payments)
>   - Full Returns subsystem (wizard modal + Returns tab in drawer)
> - This document defines **future features as separate tabs in the `/sales` page**, *not* more tabs inside the sale drawer.

---

## 0. Global Principles & Non-Negotiable Rules

These rules **must** be followed by any developer or AI agent working on this module.

### 0.1 Backend is the Single Source of Truth

- **All business logic lives in the backend.**
  - Pricing
  - Discount logic
  - Tax calculation
  - Return/refund calculation
  - Risk scoring
  - Aggregated KPIs (where feasible)
- Frontend **never** recomputes business values; it only:
  - Displays values returned by the backend.
  - May perform **simple aggregation** (e.g. summing already-computed totals per row for a banner), but:
    - Must not re-implement pricing/discount/tax logic.
    - Must not make assumptions that contradict backend constraints.

### 0.2 Security & Multitenancy

- Every API call must be tenant-scoped:
  - Use existing patterns for resolving tenant from:
    - `request.tenant`
    - JWT claims
    - `TenantUser` relationships
- Views must use:
  - Existing permission mixins and tenant filters where possible.
  - Role-based permissions for sensitive operations:
    - Voiding sales
    - Issuing refunds
    - Overriding policies (returns outside window, tax exemptions, etc.)
- Never expose:
  - Data from another tenant.
  - Internal identifiers or implementation details beyond what’s already exposed in existing serializers.
- Follow the established DRF patterns already used in `orders`, `inventory`, `catalog`, etc.

### 0.3 Reuse Before Adding

- If a concept already exists:
  - Reuse **models** (`Sale`, `SaleLine`, `SalePayment`, `Return`, `ReturnItem`, `Refund`, etc.)
  - Reuse **serializers** where possible (extend instead of duplicating).
  - Reuse **views** and query patterns (tenant filtering, date filters).
  - Reuse **frontend patterns**:
    - Full-screen wizards for complex workflows.
    - Drawer for sale details.
    - Tabbed content for subviews.
    - `useNotify` for toasts.
    - `useMoney` (`safeMoney`) for currency formatting.
- Avoid introducing new models or endpoints if the same can be achieved by extending existing ones in a clear, non-breaking way.

### 0.4 Frontend Conventions

- Stack: React + TypeScript + Vite + Tailwind.
- Styling:
  - Use existing dark theme palette and utility classes.
  - Use `tabular-nums` for numeric columns in tables.
  - Use chips/badges for statuses and indicators (e.g., `completed`, `draft`, `void`).
- State:
  - Use the same data fetch patterns (`listSales`, `getSale`, `listReturnsForSale`, etc.).
  - Avoid recalculating business logic — rely on backend fields.
- All new UI for the Sales module should live under:
  - `src/features/sales/` and `src/features/sales/components/`.

---

## 1. High-Level Structure of the Sales Area

The **Sales page** at `/sales` will have **top-level tabs**, each representing a distinct view of sales data:

1. **Overview** (current main table + KPIs)
2. **Returns Management**
3. **Payments & Refunds**
4. **Discounts & Promotions**
5. **Customers & Loyalty**
6. **Taxes & Compliance**
7. **Audit & Activity**
8. **Analytics & KPIs**
9. **Risk & Fraud Signals**
10. **Attachments & Evidence**
11. **Exports & Integrations** (optional / later)

**The Sale drawer and Return wizard remain as shared UI primitives**:
- Drawer continues to show **Details** and **Returns** for a single sale.
- Wizard continues to implement the full **return creation** flow.

Each tab will:
- Reuse the existing sales list (or filtered variants) as needed.
- Optionally show its own specialized table / charts.
- Be reachable via navigation tabs on the Sales page (e.g., “Overview | Returns | Payments | Discounts | …”).

---

## 2. Overview Tab (Existing, to be Refined)

### 2.1 Purpose

Provide a **high-level view** of all sales in the current filter range:

- By store, date, status.
- With quick access to:
  - Sale details
  - Returns for a sale

### 2.2 Current Capabilities

- Sales table with:
  - Receipt ID + “View returns (N)” link.
  - Date/time.
  - Store / cashier.
  - Status chip.
  - Lines count.
  - Subtotal, discount, tax, total.
- KPI banner:
  - Total Sales.
  - Total Tax.
  - Total Refunded (currently a simple approximation — see below).
  - Receipts count.

### 2.3 Backend Requirements

- `GET /api/v1/orders/` list already supports:
  - Tenant scoping.
  - Date range and status filters.
  - Aggregated fields: `subtotal`, `discount_total`, `tax_total`, `fee_total`, `total`.
  - `total_returns` per sale (annotated as count of related `Return`).  
- Future improvements:
  - Potentially add `refunded_total_per_sale` (sum of finalized `Return.refund_total`).

### 2.4 Frontend Requirements

- Keep the current `SalesToolbar`, `SalesTable` and KPI banner.
- IMPORTANT: KPI “Total Refunded” should eventually rely on a **backend-provided aggregate** (e.g., `refund_total` per sale) instead of heuristic counts.

### 2.5 Security

- Same filters as today:
  - Tenant, store, date range, status.
- Only show sales belonging to the current tenant.

---

## 3. Returns Management Tab

This tab reuses the same sales list, but is **returns-centric**.

### 3.1 Purpose

- Provide a **global view of returns** across all sales for a tenant.
- Allow staff to:
  - See all returns (draft, finalized, void).
  - Search returns by:
    - Receipt.
    - Return number.
    - Cashier.
    - Reason code.
    - Date range.
  - Open a specific sale’s drawer directly on the Returns tab.
  - Manage draft returns:
    - Void draft.
    - Delete draft.
    - Resume editing via the Return wizard.

### 3.2 Backend

**Option A (simple):**

- Reuse `GET /api/v1/orders/<sale_id>/returns` for per-sale returns.
- Add `GET /api/v1/returns/` global list endpoint:
  - `GET /api/v1/returns/?status=&date_from=&date_to=&store_id=`
  - Returns `ReturnSerializer` list (with `items` summarized or omitted via a lightweight serializer).

**Option B (for performance):**

- Implement a dedicated `ReturnListSerializer` that:
  - Includes:
    - return id, number, status.
    - sale id, receipt.
    - store, cashier, created_at.
    - `refund_total`, `refund_subtotal_total`, `refund_tax_total`.
  - Omits heavy nested items by default, with an optional `?include_items=true`.

> **Rule:**  
> All return financial values must use the backend `Refund.compute_line_refund` and `Return` aggregates; frontend must not recompute.

### 3.3 Frontend

- New tab toggle at `/sales` (e.g., using a local tabs state or router sub-routes).
- In **Returns tab**:
  - Use a dedicated returns table:
    - Return No.
    - Sale receipt.
    - Store / cashier.
    - Status chip.
    - Reason summary.
    - Refund total.
  - Clicking a row:
    - Opens the Sale drawer, active tab: “Returns”, and expands the relevant return.
- Filter bar:
  - Reuse `SalesToolbar` semantics where possible:
    - Date range.
    - Store filter.
    - (Optional) Return status filter.

### 3.4 Security

- Same tenant scoping as other Sales endpoints.
- Respect existing permissions:
  - Only users with appropriate roles can:
    - Create returns.
    - Void returns.
    - Delete draft returns.

---

## 4. Payments & Refunds Tab

### 4.1 Purpose

Give finance/operations teams a focused view of **tenders**:

- Which payment methods are used.
- How much is refunded via which methods.
- Reconciliation support.

### 4.2 Backend

- Existing model: `SalePayment` (line-level payments).
- Existing model: `Refund` (per-return refunds).
- Required endpoints (read-only first):

1. `GET /api/v1/payments/?date_from=&date_to=&store_id=&method=`
   - Returns paginated list of `SalePayment`.
   - Fields:
     - id, sale_id, sale_receipt.
     - store, cashier.
     - method (CASH/CARD/STORE_CREDIT/OTHER).
     - amount, received, change, txn_ref.
     - created_at.

2. `GET /api/v1/refunds/?date_from=&date_to=&store_id=&method=`
   - Returns `Refund` list:
     - id, return_id, sale_id, receipt.
     - method, amount, external_ref.
     - created_at.

> **NOTE:** For search and filtering, reuse existing DRF patterns: Q objects, pagination, tenant scoping.

### 4.3 Frontend

Payments tab view:

- Filters: date range, store, payment method.
- Table: each row = one `SalePayment`.
  - Receipt (clickable → Sale drawer).
  - Store / cashier.
  - Payment method chip.
  - Amount.
  - Change given.
  - Reference.

Refunds section (same tab or sub-tab):

- Table: each row = one `Refund`.
  - Return No. (clickable).
  - Sale receipt.
  - Method.
  - Amount.
  - Created_at.

KPI banner:

- Total paid by method (CASH, CARD, etc.).
- Total refunded by method.
- Net by method.

> **IMPORTANT:**  
> KPI numbers must be computed in the backend (aggregated totals API) or via summing fields already returned (strictly display logic).

### 4.4 Security

- View only for users with appropriate roles (`finance.view_payments`, `sales.view_all` etc.).
- No mutation APIs in this tab initially.

---

## 5. Discounts & Promotions Tab

### 5.1 Purpose

Surface how discounts are applied across sales:

- Which rules are used most.
- Total discount given.
- Identify abuse or misconfiguration.

### 5.2 Backend

Existing sources:

- `SaleLine.discount` (total discount per line).
- `receipt_data.totals.discount_by_rule` (if stored on `Sale` as JSON snapshot).
- `ReturnItem` discount context via `original_discount` (per-line discount on original sale).

Needed endpoints:

1. `GET /api/v1/discounts/summary?date_from=&date_to=&store_id=`
   - Returns:
     - total_discount (Decimal).
     - breakdown by rule:
       - rule_name, rule_code, total_discount_amount, number_of_sales.

2. `GET /api/v1/discounts/sales?rule_code=&date_from=&date_to=`
   - Returns filtered sales list where a discount rule was applied.

### 5.3 Frontend

- Tab layout:
  - Banner:
    - Total discount in period.
    - Top N rules by amount.
  - Table:
    - One row per discount rule:
      - Rule name & code.
      - Total discount.
      - # of sales.
  - Clicking a rule:
    - Shows list of impacted sales (either in a side panel or below).
    - Optionally open sale drawer for detail.

### 5.4 Security

- Read-only access restricted to roles like `manager`, `owner`, or `admin`.
- Aggregations must be tenant-scoped.

---

## 6. Customers & Loyalty Tab

### 6.1 Purpose

Expose **customer-centric view** of sales:

- Which customers buy the most.
- Which have the highest return rate.
- Loyalty program tie-ins.

### 6.2 Backend

Assuming there is a `Customer` model and `Sale` can be associated with it (if not, this tab may be deferred).

Endpoints to add:

1. `GET /api/v1/customers/sales-summary?date_from=&date_to=`
   - For each customer:
     - id, name, email/phone.
     - total_sales.
     - total_returns.
     - net_spend.
     - # of visits (sales count).

2. `GET /api/v1/customers/<id>/sales?date_from=&date_to=`
   - List of sales for a specific customer.

### 6.3 Frontend

- Customers table:
  - Name.
  - Contact.
  - Total spend.
  - Returns count.
  - Net spend.
- Clicking a row opens:
  - Either a drawer or a full-page view showing:
    - Sales history.
    - Returns history.
    - Loyalty points (if available).

### 6.4 Security

- Restricted to managers, owners, and staff with CRM permissions.
- Ensure no cross-tenant leakage (customer belongs to tenant).

---

## 7. Taxes & Compliance Tab

### 7.1 Purpose

Give accounting teams a focused view on **tax collected**:

- By store.
- By tax rule.
- Within date ranges.

### 7.2 Backend

Existing sources:

- `SaleLine.tax` and `SaleLine.fee`.
- `SaleDetailSerializer` aggregates: `tax_total`, `fee_total`.
- `receipt_data.totals.tax_by_rule` if present.

Endpoints:

1. `GET /api/v1/taxes/summary?date_from=&date_to=&store_id=`
   - Returns:
     - total_tax.
     - breakdown by tax rule codes.

2. `GET /api/v1/taxes/sales?rule_code=&date_from=&date_to=`
   - List of sales where that rule applied.

### 7.3 Frontend

- Tab:
  - Banner: total tax, # of taxed sales.
  - Table: tax rule → amount, # of sales.
  - Optionally: chart of tax over time.
- Detailed view:
  - List of sales with that tax rule.

### 7.4 Security

- Highly restricted (accounting / admin roles).
- No modifications from this tab.

---

## 8. Audit & Activity Tab

### 8.1 Purpose

Log and display all **important actions** related to Sales:

- Sale creation.
- Item additions/removals.
- Price or discount overrides.
- Return operations (draft, finalize, void, delete).
- Manager approvals.

### 8.2 Backend

Introduce an `AuditLog` model:

```py
class AuditLog(models.Model):
    id = ...
    tenant = FK(Tenant)
    sale = FK(Sale, null=True)
    user = FK(User or TenantUser)
    action = CharField(...)  # e.g., SALE_CREATED, RETURN_FINALIZED
    metadata = JSONField(...)  # details: items & amounts
    created_at = DateTimeField(auto_now_add=True)
