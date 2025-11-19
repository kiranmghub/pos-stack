+# POS Stack Knowledge Map
+
+## A. Executive Summary
+### Non-technical Overview
+- The platform delivers a multi-tenant point-of-sale (POS) solution that supports store operations (register sessions, checkout, inventory tracking) and business oversight via owner dashboards and tenant administration consoles.
+- Store staff authenticate with tenant-scoped JWTs, access assigned stores, and operate tills; owners configure stores, taxes, discounts, and users while monitoring sales KPIs through browser-based workflows.
+
+### Technical Overview
+- **Backend**: Django 4.2 with Django REST Framework, SimpleJWT, Channels, and Celery. Tenancy is enforced through middleware that resolves `TenantUser` memberships from JWT claims, attaching the tenant to each request before domain apps execute.
+- **Domain apps** cover catalog, pricing, inventory, orders, payments, analytics, and POS workflows. Serializers encapsulate business rules (e.g., protecting the last owner), while viewsets automatically scope queries by tenant.
+- **Frontend**: Vite + React with TanStack Query, Radix UI, and shadcn-style components. Shared auth utilities handle token storage and refresh, injecting tenant headers into requests. Feature modules (POS, owner dashboard, inventory) consume REST APIs through typed API helpers.
+
+## B. Repository Map
+### Directory Highlights
+- `pos-backend/core` – Django project configuration, settings, URL routing, ASGI/WSGI entrypoints.
+- `pos-backend/common` – Shared middleware, permissions, authentication serializers, and utilities.
+- `pos-backend/tenants` – Models for tenants and tenant memberships anchoring multi-tenant behavior.
+- `pos-backend/tenant_admin` – Tenant administration APIs for user management, stores, registers, taxes, discounts, and coupons.
+- `pos-backend/catalog`, `inventory`, `orders`, `payments`, `taxes`, `discounts`, `analytics`, `pos` – Domain-specific apps implementing catalog management, stock control, order processing, payment capture, tax/discount rules, analytics, and POS logic.
+- `pos-frontend/src` – React application source: routing, features, shared UI/auth utilities.
+- `pos-frontend/public`, `assets`, `ui` – Static assets, global styles, component primitives.
+
+### Component & Service Inventory
+| Component | Layer | Key Dependencies | Key Files |
+| --- | --- | --- | --- |
+| Tenant context middleware | Backend | SimpleJWT, `Tenant`, `TenantUser` | `pos-backend/common/middleware.py` |
+| Catalog service | Backend | `Product`, `Variant`, inventory linkage | `pos-backend/catalog/models.py`, `pos-backend/catalog/api.py` |
+| Inventory service | Backend | `InventoryItem`, adjustments, ledger, transfers | `pos-backend/inventory/api.py`, `pos-backend/inventory/api_counts.py` |
+| POS checkout | Backend | Discounts, taxes, register sessions, orders | `pos-backend/pos/views.py`, `pos-backend/pos/services/totals.py` |
+| Tenant admin API | Backend | DRF viewsets, serializers, role guard | `pos-backend/tenant_admin/views.py`, `pos-backend/tenant_admin/serializers.py` |
+| Owner analytics | Backend | `Sale`, `Store`, `SaleLine` aggregations | `pos-backend/analytics/views.py` |
+| Auth utilities | Frontend | Local storage, token refresh, fetch wrapper | `pos-frontend/src/lib/auth.ts` |
+| POS frontend API | Frontend | Tenant headers, coupon/tax fetching, checkout | `pos-frontend/src/features/pos/api.ts` |
+| Owner dashboard | Frontend | Analytics endpoints, mock fallbacks | `pos-frontend/src/features/owner/OwnerDashboard.tsx` |
+| Inventory UI | Frontend | Auth fetch helpers, stock adjustments, counts | `pos-frontend/src/features/inventory/api.ts`, `pos-frontend/src/features/inventory/countsApi.ts` |
+
+## C. Architecture & Data Flow
+### Django Request Lifecycle
+```mermaid
+sequenceDiagram
+    participant Client
+    participant Middleware
+    participant Viewset
+    participant Serializer
+    participant Model
+    Client->>Middleware: JWT + X-Tenant headers
+    Middleware->>Middleware: Validate token, resolve tenant membership
+    Middleware->>Viewset: request.user + request.tenant
+    Viewset->>Serializer: Validate payload (role/tenant rules)
+    Serializer->>Model: Create/update tenant-scoped objects
+    Model-->>Viewset: ORM results (tenant-filtered queryset)
+    Viewset-->>Client: JSON response
+```
+Tenant resolution and access checks occur in `TenantContextMiddleware`. Admin viewsets delegate to serializers that enforce tenant scoping and business rules before touching models such as `TenantUser`, `Store`, discounts, and tax rules.
+
+### Frontend Data Fetching Flow
+```mermaid
+flowchart LR
+    Component["React component\n(e.g., POS screen)"]
+    Hook["Custom hook / API helper\n(getMyStores, checkout)"]
+    Auth["auth.ts apiFetch /\nensureAuthedFetch"]
+    Backend["Django REST endpoint"]
+    Store["TanStack Query cache\nor local state"]
+
+    Component --> Hook --> Auth --> Backend
+    Backend --> Auth --> Hook --> Store --> Component
+```
+Feature components call feature-specific API helpers that wrap shared fetch utilities, ensuring bearer tokens and tenant headers before calling DRF endpoints. Responses populate React Query caches or component state for rendering.
+
+## D. API & Data Model Overview
+### Representative Endpoints
+| Method & Path | Purpose | Notes |
+| --- | --- | --- |
+| `POST /api/v1/auth/token/` | Obtain tenant-scoped JWT access and refresh tokens. | Serializer embeds tenant ID and role claims into the JWT payload. |
+| `POST /api/v1/pos/register-session/start` | Issue a register session token after validating register code and PIN. | Creates a `RegisterSession` record and returns a signed session token. |
+| `POST /api/v1/pos/checkout` | Create a sale, apply discounts/taxes, and record payments. | Aggregates discount/tax rules and inventory, using `compute_receipt` for totals. |
+| `GET /api/v1/inventory/overview` | Retrieve tenant inventory summary metrics. | Aggregates recent ledger entries and low-stock counts. |
+| `POST /api/v1/inventory/adjustments` | Submit stock adjustments with ledger entries. | Validates lines, updates `InventoryItem`, and writes `StockLedger` rows. |
+| `GET /api/v1/inventory/counts` | List inventory count sessions with search filters. | Supports filter params and generates codes for new sessions. |
+| `GET /api/v1/analytics/owner/*` | Fetch owner KPIs such as revenue trends and top products. | Owner-only endpoints aggregating `Sale` and `SaleLine` data. |
+| `GET /api/v1/tenant-admin/*` | Manage tenant users, stores, registers, taxes, discounts, coupons. | DRF viewsets guarded by role-based permissions. |
+| `GET /api/v1/orders/recent/` | Retrieve recent sales per tenant for dashboards. | `ListAPIView` filters by tenant from request context. |
+
+### Key Entities & Relationships
+- **Tenancy**: `Tenant` with `TenantUser` membership. `TenantUser` maps to stores via many-to-many relations and carries role choices from `TenantRole`.
+- **Store & Registers**: `Store` and `Register` share tenant-scoped unique codes. `RegisterSession` persists issued tokens, expiry, and revocation status.
+- **Catalog**: `Product` and `Variant` tie to `TaxCategory`, support image uploads, and enforce unique tenant/SKU/barcode combinations.
+- **Inventory**: `InventoryItem` tracks quantities per tenant/store/variant. `InventoryAdjustment` headers/lines mutate stock under transactions and log immutable `StockLedger` entries. `InventoryTransfer` moves stock between stores with associated lines.
+- **Orders**: `Sale`, `SaleLine`, `SalePayment`, and `SaleReceipt` link to tenants, stores, registers, users, and variants, with status flags and monetary totals.
+- **Taxes & Discounts**: Rules define scopes, apply types, priorities, and temporal windows. Coupons reference discount rules and enforce usage caps or minimum purchase thresholds.
+- **Analytics**: Aggregations over `Sale` and `SaleLine` provide tenant dashboards for revenue, trends, and top products.
+
+## E. Config & Operations
+### Environment Variables
+| Variable | Location / Default | Purpose |
+| --- | --- | --- |
+| `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS` | `pos-backend/core/settings.py` | Core Django configuration with `.env` fallback; default secret is insecure and for development only. |
+| `USE_S3_MEDIA`, `AWS_*` | `pos-backend/core/settings.py` | Configure optional S3 storage for media uploads. |
+| `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` | `pos-backend/core/settings.py` | PostgreSQL connection defaults to `posdb` on port `55432`. |
+| `REGISTER_SESSION_TTL_HOURS` | `pos-backend/pos/tokens.py` | Overrides register session token lifespan (default 8 hours). |
+| `VITE_API_BASE` | `pos-frontend/vite.config.ts` | Defines API base URL for frontend fetch helpers; dev proxy used if unset. |
+
+### Build, Run, and Test Commands
+- **Backend**
+  - Install dependencies: `pip install -r requirements.txt`
+  - Apply migrations: `python manage.py migrate`
+  - Run development server: `python manage.py runserver`
+  - Optional workers: `celery -A core worker`, `daphne core.asgi`
+- **Frontend**
+  - Install dependencies: `npm install`
+  - Development server: `npm run dev`
+  - Production build: `npm run build`
+  - Type checking: `npm run typecheck`
+- **Auth Workflow**
+  - Frontend login posts to `/api/v1/auth/token/`, stores JWT pair in `localStorage`, and gates routes with token-aware guards.
+
+## F. Dependency Highlights
+- Middleware establishes tenant context from JWT claims (`TenantContextMiddleware`), underpinning authorization across all domain apps.
+- POS checkout orchestrates discounts, taxes, and inventory adjustments via `pos/services/totals.py`, persisting sales, payments, and ledger updates.
+- Tenant admin viewsets rely on serializers to enforce role safeguards, unique codes, and store assignments when managing stores, registers, taxes, discounts, and coupons.
+- Analytics views aggregate `Sale` and `SaleLine` data for owner dashboards; frontend owner features call these endpoints directly.
+- Frontend API helpers (`auth.ts`, `features/*/api.ts`) wrap fetch calls with token refresh and tenant header injection, feeding TanStack Query caches.
+
+## G. Conventions & Patterns Cheat-Sheet
+- **Tenant enforcement**: Always access tenant-scoped models via `request.tenant`; viewsets often define `tenant_field` or `tenant_path` to automate filtering.
+- **Role-based permissions**: `TenantRole` aligns with permission classes (`IsTenantAdmin`, `IsOwner`, `RoleRequired`) and serializer checks (e.g., preventing removal of the last owner).
+- **Data normalization**: Percentages are normalized to decimal form (up to six decimal places) before persistence in tax/discount models.
+- **Inventory consistency**: Stock adjustments and transfers run within transactions, using `select_for_update()` to protect balances and ledger history.
+- **Frontend auth**: `ensureAuthedFetch` and `apiFetch` coordinate token refresh, Authorization headers, and tenant headers for consistent API access.
+- **UI structure**: `AppShell` manages layout, keep-alive logic, and route guards; feature modules plug into shared shells/components.
+
+## H. Questions & Unknowns
+1. Should register session issuance validate that the requesting user is assigned to the register's store to prevent cross-store access?
+2. The owner dashboard bypasses the shared auth refresh helper—should it adopt `ensureAuthedFetch` for consistency?
+3. What process generates `SaleReceipt` QR codes and receipts, given the existing model fields but absent generation logic?
+4. Do inventory transfers guard against sending quantities beyond on-hand stock, or is additional validation required?
+5. Should analytics endpoints respect per-tenant or per-store time zones instead of server defaults?
+6. Is there a retention policy or cleanup job for expired/revoked `RegisterSession` records?
+7. Can discount/tax admin serializers be unified with public catalog endpoints to reduce normalization duplication?
+8. Is offline support planned for the POS frontend (no service worker or caching is present)?
+9. Should POS checkout support multiple coupon codes in the frontend payload, mirroring backend capabilities?
+10. Do tenant admins need configurable low-stock thresholds beyond the current hard-coded value?
+
+## Additional Notes
+- No repository files were modified during the source analysis that informed this document.
+- Skipped directories during analysis: `pos-frontend/node_modules` (third-party dependencies) and `pos-backend/media/tenants/*` (binary assets).
+
