# Inventory Frontend Rebuild - Implementation Plan

> **Goal:** Build a first-class, production-ready Inventory Management frontend that fully leverages all backend capabilities implemented across Phase 1, Phase 2, and Phase 3.

---

## Executive Summary

This document outlines a comprehensive plan to rebuild the Inventory Management frontend from scratch. The new frontend will be:

- **Dashboard-first**: Rich overview with KPIs, charts, and quick actions
- **Feature-complete**: All Phase 1, 2, and 3 backend features integrated
- **User-friendly**: Advanced filtering, bulk operations, real-time updates
- **Visually rich**: Data visualizations, charts, and interactive components
- **Production-ready**: Error handling, loading states, responsive design
- **Performant**: Optimized data fetching, caching, and rendering

### Migration Strategy: Fresh Start

**Decision:** Delete all existing inventory frontend files and start fresh with a clean, production-grade structure.

**Rationale:**
- Existing code is minimal and doesn't match the comprehensive plan
- Current structure is flat and doesn't support the planned feature set
- Starting fresh avoids technical debt and confusion
- Enables building with best practices from the start
- Cleaner, more maintainable codebase

**Existing Files to Remove:**
- `pos-frontend/src/features/inventory/api.ts`
- `pos-frontend/src/features/inventory/countsApi.ts`
- `pos-frontend/src/features/inventory/CountsPage.tsx`
- `pos-frontend/src/features/inventory/InventoryRoute.tsx`
- `pos-frontend/src/features/inventory/transfersApi.ts`
- `pos-frontend/src/features/inventory/TransfersPage.tsx`

**Note:** The route in `main.tsx` will be temporarily broken until the new `InventoryRoute.tsx` is created. This is acceptable as we're doing a complete rebuild.

### Scope

This rebuild will cover **all** features documented in `Inventory_System_Complete_Documentation.md`:

**Phase 1 Features:**
- Stock Lookup & Cross-Store Visibility
- Inventory Overview Dashboard
- Stock Adjustments
- Stock Ledger

**Phase 2 Features:**
- Inventory Transfers (Send/Receive workflow)
- Cycle Counts (Scopes & Variance)
- Purchase Orders (Vendor management, receiving)
- Reorder Suggestions
- Stock Summary

**Phase 3 Features:**
- Reservations & Backorders
- Multi-Channel Inventory API
- Forecasting & Predictive Reorder
- Vendor Analytics & Scorecards
- Shrinkage, Aging, and Coverage Analytics
- Webhooks & Real-Time Notifications
- Advanced Returns & Inspection Workflow
- Data Exports

---

## Design Principles

### 1. Information Hierarchy

- **Most important information first**: KPIs, alerts, and critical actions at the top
- **Progressive disclosure**: Show summary, allow drill-down to details
- **Contextual actions**: Actions available where they're needed
- **Visual indicators**: Colors, badges, icons for quick status recognition

### 2. Data Visualization

- **Charts for trends**: Stock levels over time, movements by type
- **Heatmaps**: Stock distribution across stores
- **Sparklines**: Quick trend indicators in tables
- **Progress indicators**: For operations in progress
- **Status badges**: Color-coded status indicators

### 3. Advanced Filtering & Search

- **Multi-criteria filters**: Store, category, status, date range, etc.
- **Saved filter presets**: Quick access to common views
- **Quick filters**: Low stock, out of stock, high value, etc.
- **Global search**: Autocomplete with product/variant search
- **URL state**: Shareable filtered views

### 4. Bulk Operations

- **Multi-select**: Checkboxes for selecting multiple items
- **Bulk actions**: Adjust, transfer, export multiple items
- **Selection persistence**: Maintain selection across pagination
- **Bulk confirmation**: Clear feedback on bulk operations

### 5. Real-Time Updates

- **Optimistic updates**: Immediate UI feedback
- **Polling**: Auto-refresh for critical data (30s intervals)
- **Toast notifications**: Success/error feedback
- **Activity feed**: Recent changes timeline

### 6. Mobile-First Responsive

- **Touch-friendly**: Large tap targets, swipe gestures
- **Responsive tables**: Cards on mobile, tables on desktop
- **Bottom sheets**: Mobile-friendly modals
- **Adaptive layouts**: Stack on mobile, side-by-side on desktop

### 7. Performance

- **Virtual scrolling**: For large lists (1000+ items)
- **Pagination with infinite scroll**: Optional for better UX
- **Debounced search**: Reduce API calls
- **Lazy loading**: Load tabs/components on demand
- **Caching**: React Query for intelligent caching

### 8. Accessibility

- **Keyboard navigation**: Full keyboard support
- **Screen reader support**: ARIA labels, semantic HTML
- **Focus management**: Logical tab order
- **Color contrast**: WCAG AA compliant

---

## Architecture Overview

### Store Filtering Strategy

**Decision:** Per-tab store filters (not global dropdown)

**Rationale:**
- Different tabs have different requirements (Stock requires a store, Overview/Ledger can aggregate across stores)
- Clearer UX - users see exactly what they're filtering in each tab
- More flexible for future tabs with different needs
- Better for power users who want different store contexts in different tabs
- No disabled states - all tabs remain functional

**Implementation:**
- **Overview Tab**: Filter bar with store dropdown (includes "All Stores" option for aggregated view)
- **Stock Management Tab**: Required store selector in filter bar (no "All Stores" - API requirement)
- **Ledger Tab**: Filter bar with store dropdown (includes "All Stores" option)
- **Future Tabs**: Per-tab requirements (Transfers, Counts, etc. will have their own filter logic)

**Benefits:**
- Each tab can have its own filter logic
- "All Stores" option only appears where applicable
- Clear context - user knows exactly what they're filtering
- More flexible for future tabs
- Better for power users - can have different store contexts in different tabs

### Component Structure

```
src/features/inventory/
├── components/              # Shared components
│   ├── KpiCard.tsx
│   ├── StockBadge.tsx
│   ├── StatusBadge.tsx
│   ├── FilterBar.tsx
│   ├── BulkActionsBar.tsx
│   ├── DataTable.tsx
│   ├── ChartCard.tsx
│   └── QuickFilters.tsx
├── dashboard/              # Dashboard components
│   ├── OverviewDashboard.tsx
│   ├── KpiSection.tsx
│   ├── ChartsSection.tsx
│   ├── AlertsSection.tsx
│   └── ActivityFeed.tsx
├── stock/                  # Stock management
│   ├── StockListPage.tsx
│   ├── StockDetailDrawer.tsx
│   ├── CrossStoreView.tsx
│   ├── BulkAdjustModal.tsx
│   └── StockSummaryPage.tsx
├── operations/             # Operations (transfers, counts, POs)
│   ├── transfers/
│   │   ├── TransfersPage.tsx
│   │   ├── TransferList.tsx
│   │   ├── TransferDetail.tsx
│   │   ├── CreateTransferModal.tsx
│   │   └── ReceiveTransferModal.tsx
│   ├── counts/
│   │   ├── CountsPage.tsx
│   │   ├── CountSessionList.tsx
│   │   ├── CountSessionDetail.tsx
│   │   ├── CreateCountModal.tsx
│   │   └── VariancePreview.tsx
│   ├── purchase-orders/
│   │   ├── PurchaseOrdersPage.tsx
│   │   ├── POList.tsx
│   │   ├── PODetail.tsx
│   │   ├── CreatePOModal.tsx
│   │   └── ReceivePOModal.tsx
│   └── adjustments/
│       ├── AdjustmentsPage.tsx
│       └── AdjustmentModal.tsx
├── planning/               # Planning & analytics
│   ├── reorder/
│   │   ├── ReorderSuggestionsPage.tsx
│   │   └── CreatePOFromSuggestions.tsx
│   ├── forecasting/
│   │   ├── ForecastingDashboard.tsx
│   │   ├── AtRiskItemsPage.tsx
│   │   └── ForecastDetail.tsx
│   └── health/
│       ├── InventoryHealthPage.tsx
│       ├── ShrinkageReport.tsx
│       ├── AgingReport.tsx
│       └── CoverageReport.tsx
├── multi-channel/          # Multi-channel features
│   ├── ReservationsPage.tsx
│   ├── ReservationList.tsx
│   ├── AvailabilityView.tsx
│   └── BackordersPage.tsx
├── vendors/                # Vendor management
│   ├── VendorsPage.tsx
│   ├── VendorList.tsx
│   ├── VendorDetail.tsx
│   ├── VendorScorecard.tsx
│   └── VendorModal.tsx
├── audit/                  # Audit & compliance
│   ├── LedgerPage.tsx
│   ├── LedgerTable.tsx
│   ├── LedgerFilters.tsx
│   └── AuditLogsPage.tsx
├── settings/               # Settings & integrations
│   ├── WebhooksPage.tsx
│   ├── WebhookSubscriptions.tsx
│   ├── WebhookDeliveries.tsx
│   └── ExportSettings.tsx
├── api/                    # API functions
│   ├── inventory.ts
│   ├── transfers.ts
│   ├── counts.ts
│   ├── purchaseOrders.ts
│   ├── reservations.ts
│   ├── forecasting.ts
│   ├── analytics.ts
│   ├── vendors.ts
│   └── webhooks.ts
├── hooks/                  # Custom hooks
│   ├── useInventory.ts
│   ├── useStock.ts
│   ├── useTransfers.ts
│   ├── useCounts.ts
│   ├── usePurchaseOrders.ts
│   └── useForecasting.ts
├── types/                  # TypeScript types
│   ├── inventory.ts
│   ├── transfers.ts
│   ├── counts.ts
│   ├── purchaseOrders.ts
│   └── analytics.ts
└── InventoryRoute.tsx      # Main route component
```

### State Management

- **React Query**: Server state, caching, background updates
- **Zustand/Context**: UI state (modals, filters, selections)
- **URL State**: Filters, pagination, active tab

### Data Fetching Strategy

- **React Query** for all API calls
- **Optimistic updates** for mutations
- **Background refetching** for critical data
- **Pagination** with infinite scroll option
- **Debounced search** (300ms)

---

## Phase 1: Foundation & Core UI

**Goal:** Build the foundation with enhanced dashboard, improved stock management, and core UI components.

**Implementation Order:** We'll start with Increment 1.4 (Core UI Components) first to establish the foundation, then build Increment 1.1 (Dashboard) using those components.

### Increment 1.4: Core UI Components Library

**Objective:** Build reusable UI components used throughout the inventory system. **This should be built FIRST** as it provides the foundation for all other components.

**Components:**
- `KpiCard.tsx` - KPI card with trend
- `StockBadge.tsx` - Stock level badge
- `StatusBadge.tsx` - Status badge (transfer, PO, count)
- `DataTable.tsx` - Enhanced data table
- `FilterBar.tsx` - Reusable filter bar
- `BulkActionsBar.tsx` - Bulk actions toolbar
- `ChartCard.tsx` - Chart container card
- `LoadingSkeleton.tsx` - Loading states
- `EmptyState.tsx` - Empty state component
- `ErrorBoundary.tsx` - Error handling

**Features:**
- Consistent styling across all components
- Accessibility support
- Responsive design
- Loading and error states
- TypeScript types

**Design:**
- Follow existing design system
- Use shadcn/ui components as base
- Consistent spacing and colors
- Dark mode support

**Acceptance Criteria:**
- [ ] All components are reusable
- [ ] Consistent styling
- [ ] Accessibility tested
- [ ] TypeScript types complete
- [ ] Storybook stories (optional)

---

### Increment 1.1: Enhanced Overview Dashboard

**Objective:** Create a rich, data-dense dashboard with KPIs, charts, and quick actions.

**Components:**
- `OverviewDashboard.tsx` - Main dashboard container
- `KpiSection.tsx` - KPI cards with trends
- `ChartsSection.tsx` - Stock value, movements charts
- `AlertsSection.tsx` - Low stock, at-risk items
- `ActivityFeed.tsx` - Recent movements timeline
- `QuickActions.tsx` - Quick action buttons

**Features:**
- 5 KPI cards: Total SKUs, Total Quantity, On-hand Value, Low Stock Items, Transfers in Transit
- Stock value trend chart (last 30 days)
- Movements by type chart (pie/bar)
- Low stock alerts list (top 10)
- Recent activity feed (last 20 movements)
- Quick actions: Create Transfer, Start Count, Create PO, Bulk Adjust
- **Store filter with "All Stores" option** - Allows viewing aggregated data across all stores or filtering by specific store

**API Endpoints:**
- `GET /api/v1/inventory/overview?store_id={id}` - Enhanced with summary data (store_id optional for "All Stores")
- `GET /api/v1/inventory/at_risk_items?limit=10&store_id={id}` - At-risk items (store_id optional)

**Design:**
- Grid layout: 2 columns on mobile, 4 on desktop
- KPI cards with trend indicators (↑↓)
- Interactive charts (Recharts)
- Clickable alerts → navigate to detail
- Activity feed with expandable details
- **Store filter in filter bar** - Dropdown with "All Stores" + individual stores

**Acceptance Criteria:**
- [ ] Dashboard loads with all KPIs
- [ ] Charts render correctly
- [ ] Alerts are clickable and navigate
- [ ] Activity feed shows recent movements
- [ ] Quick actions work
- [ ] Responsive on mobile/tablet
- [ ] Uses components from Increment 1.4
- [ ] Store filter works with "All Stores" option
- [ ] Aggregated data displays correctly when "All Stores" selected

---

### Increment 1.2: Enhanced Stock Management

**Objective:** Improve stock list with advanced filtering, bulk operations, and better UX.

**Components:**
- `StockListPage.tsx` - Main stock list page
- `StockTable.tsx` - Enhanced data table
- `FilterBar.tsx` - Advanced filter controls
- `QuickFilters.tsx` - Quick filter chips
- `BulkActionsBar.tsx` - Bulk action toolbar
- `StockDetailDrawer.tsx` - Side drawer for stock details
- `BulkAdjustModal.tsx` - Bulk adjustment modal

**Features:**
- **Required store selector** - Store filter in filter bar (no "All Stores" option - API requirement)
- Advanced filtering: Category, stock status, price range
- Quick filters: Low stock, Out of stock, High value
- Multi-select with checkboxes
- Bulk actions: Adjust, Export, Create Transfer
- Stock detail drawer: Full history, cross-store view
- Search with autocomplete
- Pagination with page size options
- Export to CSV

**API Endpoints:**
- `GET /api/v1/inventory/stock?store_id={id}` - With enhanced filters (store_id required)
- `GET /api/v1/inventory/stock-across-stores` - Cross-store view
- `POST /api/v1/inventory/adjustments` - Bulk adjustments

**Design:**
- Sticky filter bar at top with **required store selector**
- Quick filter chips below search
- Table with sortable columns
- Row selection with checkbox
- Bulk actions bar appears on selection
- Detail drawer slides from right
- Mobile: Card view instead of table

**Acceptance Criteria:**
- [ ] Store selector is required and functional
- [ ] All filters work correctly
- [ ] Multi-select functions properly
- [ ] Bulk actions work
- [ ] Detail drawer shows complete info
- [ ] Export generates CSV
- [ ] Responsive design works
- [ ] Uses components from Increment 1.4

---

### Increment 1.3: Enhanced Ledger with Advanced Filtering

**Objective:** Build a powerful ledger viewer with advanced filtering and export.

**Components:**
- `LedgerPage.tsx` - Main ledger page
- `LedgerTable.tsx` - Ledger entries table
- `LedgerFilters.tsx` - Advanced filter panel
- `LedgerDetailModal.tsx` - Entry detail modal

**Features:**
- **Store filter with "All Stores" option** - Allows viewing ledger entries across all stores or filtering by specific store
- Advanced filters: Date range, ref type, variant, user
- Saved filter presets
- Timeline view option
- Export to CSV/JSON
- Drill-down to related records
- Search across all fields

**API Endpoints:**
- `GET /api/v1/inventory/ledger?store_id={id}` - With all filters (store_id optional for "All Stores")

**Design:**
- Collapsible filter panel with **store dropdown (includes "All Stores")**
- Date range picker
- Multi-select for ref types
- Timeline view toggle
- Export button in toolbar
- Clickable entries → detail modal

**Acceptance Criteria:**
- [ ] Store filter works with "All Stores" option
- [ ] All filters work
- [ ] Date range picker functions
- [ ] Timeline view renders correctly
- [ ] Export works for CSV/JSON
- [ ] Detail modal shows full entry
- [ ] Performance with large datasets
- [ ] Uses components from Increment 1.4

---

## Phase 2: Advanced Operations

**Goal:** Implement all operational features: Transfers, Counts, Purchase Orders, and Adjustments.

### Increment 2.1: Enhanced Transfers

**Objective:** Build a comprehensive transfer management system with send/receive workflow.

**Components:**
- `TransfersPage.tsx` - Main transfers page
- `TransferList.tsx` - Transfer list with filters
- `TransferDetail.tsx` - Transfer detail view
- `CreateTransferModal.tsx` - Create transfer wizard
- `ReceiveTransferModal.tsx` - Receive transfer modal
- `TransferStatusBadge.tsx` - Status indicator

**Features:**
- Create transfer with product search
- Send transfer (decrement source)
- Receive transfer (partial/full)
- Transfer list with status filters
- Transfer detail with line items
- Transfer history timeline
- Bulk create transfers
- Export transfers

**API Endpoints:**
- `GET /api/v1/inventory/transfers` - List with filters
- `POST /api/v1/inventory/transfers` - Create
- `GET /api/v1/inventory/transfers/{id}` - Detail
- `POST /api/v1/inventory/transfers/{id}?action=send` - Send
- `POST /api/v1/inventory/transfers/{id}?action=receive` - Receive

**Design:**
- Split view: List on left, detail on right
- Status filters: Draft, In Transit, Partial, Received
- Create wizard: Step 1 (stores), Step 2 (items), Step 3 (review)
- Receive modal: Shows sent qty, allows partial receive
- Status timeline: Visual progress indicator

**Acceptance Criteria:**
- [ ] Create transfer works
- [ ] Send transfer decrements source
- [ ] Receive transfer increments destination
- [ ] Partial receiving works
- [ ] Status updates correctly
- [ ] Ledger entries created

---

### Increment 2.2: Enhanced Cycle Counts

**Objective:** Build a comprehensive cycle count system with scopes, variance tracking, and scanning.

**Components:**
- `CountsPage.tsx` - Main counts page
- `CountSessionList.tsx` - Session list
- `CountSessionDetail.tsx` - Count session detail
- `CreateCountModal.tsx` - Create count session
- `VariancePreview.tsx` - Variance preview before finalize
- `CountScanner.tsx` - Barcode/SKU scanner component

**Features:**
- Create count session (Full Store or Zone)
- Barcode/SKU scanning
- Manual quantity entry
- Variance preview before finalize
- Finalize with automatic adjustments
- Count history and reports
- Zone-based counting

**API Endpoints:**
- `GET /api/v1/inventory/counts` - List sessions
- `POST /api/v1/inventory/counts` - Create session
- `GET /api/v1/inventory/counts/{id}` - Get session
- `POST /api/v1/inventory/counts/{id}/set_qty` - Set quantity
- `GET /api/v1/inventory/counts/{id}/variance` - Variance preview
- `POST /api/v1/inventory/counts/{id}/finalize` - Finalize

**Design:**
- Split view: Sessions on left, active session on right
- Scanner input with auto-submit
- Variance table with color coding
- Finalize confirmation with variance summary
- Scope/zone display in session list

**Acceptance Criteria:**
- [ ] Create count session works
- [ ] Scanning adds items correctly
- [ ] Variance preview shows correctly
- [ ] Finalize creates adjustments
- [ ] Zone counting works
- [ ] Overlap prevention works

---

### Increment 2.3: Purchase Orders Module

**Objective:** Build complete purchase order management with vendor integration.

**Components:**
- `PurchaseOrdersPage.tsx` - Main PO page
- `POList.tsx` - PO list with filters
- `PODetail.tsx` - PO detail view
- `CreatePOModal.tsx` - Create PO wizard
- `ReceivePOModal.tsx` - Receive PO modal
- `VendorSelector.tsx` - Vendor selection component

**Features:**
- Create PO with vendor selection
- Add line items with product search
- Submit PO to vendor
- Receive PO (partial/full)
- PO status tracking
- PO history and reports
- Vendor performance integration

**API Endpoints:**
- `GET /api/v1/purchasing/purchase_orders` - List POs
- `POST /api/v1/purchasing/purchase_orders` - Create PO
- `GET /api/v1/purchasing/purchase_orders/{id}` - Get PO
- `PUT /api/v1/purchasing/purchase_orders/{id}` - Update PO
- `POST /api/v1/purchasing/purchase_orders/{id}/submit` - Submit
- `POST /api/v1/purchasing/purchase_orders/{id}/receive` - Receive

**Design:**
- PO list with status filters
- Create wizard: Vendor → Items → Review
- Receive modal: Shows ordered qty, allows partial
- Status timeline: Draft → Submitted → Received
- Cost tracking and variance

**Acceptance Criteria:**
- [ ] Create PO works
- [ ] Submit PO works
- [ ] Receive PO increments inventory
- [ ] Partial receiving works
- [ ] Status updates correctly
- [ ] Ledger entries created

---

### Increment 2.4: Enhanced Adjustments

**Objective:** Improve adjustments with bulk operations and better UX.

**Components:**
- `AdjustmentsPage.tsx` - Adjustments list
- `AdjustmentModal.tsx` - Single adjustment modal
- `BulkAdjustModal.tsx` - Bulk adjustment modal (from 1.2)

**Features:**
- Single item adjustment
- Bulk adjustments
- Reason code selection
- Adjustment history
- Export adjustments

**API Endpoints:**
- `GET /api/v1/inventory/adjustments` - List adjustments
- `POST /api/v1/inventory/adjustments` - Create adjustment
- `GET /api/v1/inventory/reasons` - Adjustment reasons

**Design:**
- Quick adjust from stock list
- Bulk adjust from selection
- Reason code dropdown
- Note field for context
- Adjustment confirmation

**Acceptance Criteria:**
- [ ] Single adjustment works
- [ ] Bulk adjustment works
- [ ] Reason codes display correctly
- [ ] Ledger entries created
- [ ] History viewable

---

### Increment 2.5: Reorder Suggestions

**Objective:** Build reorder suggestions interface with PO creation workflow.

**Components:**
- `ReorderSuggestionsPage.tsx` - Suggestions list
- `SuggestionCard.tsx` - Individual suggestion card
- `CreatePOFromSuggestions.tsx` - Bulk PO creation

**Features:**
- View low-stock items
- Suggested reorder quantities
- Filter by store, category
- Bulk create PO from suggestions
- Reorder point management

**API Endpoints:**
- `GET /api/v1/inventory/reorder_suggestions` - Get suggestions

**Design:**
- Card-based layout
- Show current stock, reorder point, suggested qty
- Bulk select and create PO
- Link to variant detail

**Acceptance Criteria:**
- [ ] Suggestions load correctly
- [ ] Filters work
- [ ] Bulk PO creation works
- [ ] Reorder points display

---

## Phase 3: Analytics & Planning

**Goal:** Implement forecasting, analytics, and planning features.

### Increment 3.1: Forecasting Dashboard

**Objective:** Build forecasting dashboard with stockout predictions and recommendations.

**Components:**
- `ForecastingDashboard.tsx` - Main forecasting page
- `ForecastCard.tsx` - Forecast card for variant
- `ForecastDetail.tsx` - Detailed forecast view
- `SalesVelocityChart.tsx` - Sales velocity visualization

**Features:**
- Stockout predictions
- Recommended order quantities
- Confidence scores
- Sales velocity charts
- Vendor lead time integration

**API Endpoints:**
- `GET /api/v1/inventory/reorder_forecast` - Get forecast
- `GET /api/v1/inventory/at_risk_items` - At-risk items

**Design:**
- Dashboard with forecast cards
- Click card → detailed forecast
- Charts for sales velocity
- Color coding by risk level

**Acceptance Criteria:**
- [ ] Forecasts calculate correctly
- [ ] Charts render
- [ ] At-risk items highlighted
- [ ] Recommendations accurate

---

### Increment 3.2: At-Risk Items Dashboard

**Objective:** Build dashboard for items predicted to stock out.

**Components:**
- `AtRiskItemsPage.tsx` - At-risk items list
- `RiskItemCard.tsx` - Risk item card
- `StockoutTimeline.tsx` - Visual timeline

**Features:**
- List of at-risk items
- Days until stockout
- Recommended actions
- Quick create PO
- Risk level indicators

**API Endpoints:**
- `GET /api/v1/inventory/at_risk_items` - Get at-risk items

**Design:**
- Priority-ordered list
- Visual timeline
- Quick action buttons
- Filter by risk level

**Acceptance Criteria:**
- [ ] At-risk items load
- [ ] Timeline displays correctly
- [ ] Quick actions work
- [ ] Filters function

---

### Increment 3.3: Inventory Health Reports

**Objective:** Build comprehensive inventory health analytics.

**Components:**
- `InventoryHealthPage.tsx` - Health dashboard
- `ShrinkageReport.tsx` - Shrinkage analysis
- `AgingReport.tsx` - Aging inventory analysis
- `CoverageReport.tsx` - Count coverage analysis
- `HealthSummary.tsx` - Overall health summary

**Features:**
- Shrinkage by reason
- Aging inventory identification
- Count coverage percentage
- Health score calculation
- Trend analysis

**API Endpoints:**
- `GET /api/v1/analytics/inventory/shrinkage` - Shrinkage report
- `GET /api/v1/analytics/inventory/aging` - Aging report
- `GET /api/v1/analytics/inventory/coverage` - Coverage report
- `GET /api/v1/analytics/inventory/health` - Health summary

**Design:**
- Tabbed interface for each report
- Charts for visualizations
- Drill-down to details
- Export capabilities

**Acceptance Criteria:**
- [ ] All reports load
- [ ] Charts render correctly
- [ ] Drill-down works
- [ ] Export functions

---

### Increment 3.4: Vendor Analytics & Scorecards

**Objective:** Build vendor performance analytics and scorecards.

**Components:**
- `VendorsPage.tsx` - Vendor list
- `VendorList.tsx` - Vendor table
- `VendorDetail.tsx` - Vendor detail page
- `VendorScorecard.tsx` - Scorecard component
- `VendorModal.tsx` - Create/edit vendor

**Features:**
- Vendor list with performance indicators
- Vendor scorecard (on-time %, lead time, fill rate, cost variance)
- Performance trends
- Purchase history
- Vendor comparison

**API Endpoints:**
- `GET /api/v1/purchasing/vendors` - List vendors
- `POST /api/v1/purchasing/vendors` - Create vendor
- `GET /api/v1/purchasing/vendors/{id}` - Get vendor
- `GET /api/v1/analytics/vendors/{id}/scorecard` - Scorecard

**Design:**
- Vendor list with score indicators
- Scorecard page with metrics
- Charts for trends
- Performance comparison

**Acceptance Criteria:**
- [ ] Vendor list loads
- [ ] Scorecard calculates correctly
- [ ] Trends display
- [ ] CRUD operations work

---

## Phase 4: Multi-Channel & Enterprise Features

**Goal:** Implement multi-channel inventory, reservations, webhooks, and enterprise features.

### Increment 4.1: Reservations & Backorders

**Objective:** Build reservation management system for multi-channel inventory.

**Components:**
- `ReservationsPage.tsx` - Reservations list
- `ReservationList.tsx` - Reservation table
- `ReservationDetail.tsx` - Reservation detail
- `CreateReservationModal.tsx` - Create reservation
- `BackordersPage.tsx` - Backorders view

**Features:**
- View active reservations
- Create reservation
- Commit reservation (fulfill)
- Release reservation (cancel)
- Backorder management
- Channel filtering

**API Endpoints:**
- `GET /api/v1/inventory/reservations` - List reservations
- `POST /api/v1/inventory/reservations` - Create reservation
- `POST /api/v1/inventory/reservations/{id}/commit` - Commit
- `POST /api/v1/inventory/reservations/{id}/release` - Release

**Design:**
- Reservation list with status filters
- Channel badges (POS, WEB, MARKETPLACE)
- Expiration warnings
- Quick actions (commit/release)

**Acceptance Criteria:**
- [ ] Reservations list loads
- [ ] Create reservation works
- [ ] Commit/release function correctly
- [ ] Backorders display
- [ ] Channel filtering works

---

### Increment 4.2: Multi-Channel Availability

**Objective:** Build multi-channel availability viewer and API integration.

**Components:**
- `AvailabilityView.tsx` - Availability viewer
- `ChannelAvailability.tsx` - Per-channel availability
- `ReserveStockModal.tsx` - Reserve stock modal

**Features:**
- Check availability across channels
- Reserve stock for channel
- Release reservation
- Commit reservation
- Rate limiting indicators

**API Endpoints:**
- `GET /api/v1/inventory/availability` - Check availability
- `POST /api/v1/inventory/reserve` - Reserve stock
- `POST /api/v1/inventory/release` - Release reservation
- `POST /api/v1/inventory/commit` - Commit reservation

**Design:**
- Availability card per channel
- Reserve button with quantity input
- Status indicators
- Rate limit warnings

**Acceptance Criteria:**
- [ ] Availability checks work
- [ ] Reserve/release/commit function
- [ ] Rate limiting handled
- [ ] Channel metadata tracked

---

### Increment 4.3: Webhooks Management

**Objective:** Build webhook subscription management interface.

**Components:**
- `WebhooksPage.tsx` - Webhooks main page
- `WebhookSubscriptions.tsx` - Subscriptions list
- `WebhookSubscriptionModal.tsx` - Create/edit subscription
- `WebhookDeliveries.tsx` - Delivery logs
- `WebhookTestModal.tsx` - Test webhook

**Features:**
- List webhook subscriptions
- Create/edit subscription
- View delivery logs
- Test webhook
- Enable/disable subscription
- Event type selection

**API Endpoints:**
- `GET /api/v1/webhooks/subscriptions` - List subscriptions
- `POST /api/v1/webhooks/subscriptions` - Create subscription
- `GET /api/v1/webhooks/subscriptions/{id}` - Get subscription
- `PUT /api/v1/webhooks/subscriptions/{id}` - Update subscription
- `GET /api/v1/webhooks/subscriptions/{id}/deliveries` - Delivery logs

**Design:**
- Subscriptions table
- Create/edit modal with event type checkboxes
- Delivery logs with status indicators
- Test button with payload preview

**Acceptance Criteria:**
- [ ] CRUD operations work
- [ ] Delivery logs display
- [ ] Test function works
- [ ] Event types selectable

---

### Increment 4.4: Data Exports

**Objective:** Build data export interface for inventory data.

**Components:**
- `ExportSettings.tsx` - Export configuration
- `ExportModal.tsx` - Export wizard
- `ExportHistory.tsx` - Export history

**Features:**
- Snapshot export (full data)
- Delta export (incremental)
- Format selection (CSV/JSON)
- Filter by store, date range
- Export history
- Download exports

**API Endpoints:**
- Management commands (backend)
- Frontend: Trigger export, download file

**Design:**
- Export wizard: Type → Filters → Format → Export
- Export history table
- Download links
- Export status indicators

**Acceptance Criteria:**
- [ ] Snapshot export works
- [ ] Delta export works
- [ ] Filters apply correctly
- [ ] Downloads function
- [ ] History tracks exports

---

### Increment 4.5: Advanced Returns Inspection

**Objective:** Build returns inspection workflow UI.

**Components:**
- `ReturnsInspectionPage.tsx` - Inspection queue
- `InspectionQueue.tsx` - Queue list
- `InspectReturnModal.tsx` - Inspection modal
- `ReturnDisposition.tsx` - Disposition selector

**Features:**
- View inspection queue
- Inspect return items
- Set disposition (RESTOCK/WASTE)
- Accept/reject return
- Finalize return

**API Endpoints:**
- `GET /api/v1/orders/returns/inspection_queue` - Queue
- `POST /api/v1/orders/returns/{id}/inspect` - Inspect
- `POST /api/v1/orders/returns/{id}/accept` - Accept
- `POST /api/v1/orders/returns/{id}/reject` - Reject
- `POST /api/v1/orders/returns/{id}/finalize` - Finalize

**Design:**
- Queue list with priority
- Inspection modal with item list
- Disposition selector per item
- Accept/reject buttons
- Finalize workflow

**Acceptance Criteria:**
- [ ] Queue loads correctly
- [ ] Inspection modal works
- [ ] Disposition setting functions
- [ ] Accept/reject work
- [ ] Finalize updates inventory

---

## Technical Specifications

### Dependencies

**Required:**
- `@tanstack/react-query` - Data fetching and caching
- `recharts` - Charts and visualizations
- `date-fns` - Date manipulation
- `zod` - Schema validation
- `react-hook-form` - Form handling

**Optional:**
- `@tanstack/react-table` - Advanced tables
- `react-virtual` - Virtual scrolling
- `framer-motion` - Animations
- `zustand` - State management

### Performance Targets

- **Initial Load**: < 2 seconds
- **Page Navigation**: < 500ms
- **Search Response**: < 300ms (debounced)
- **Table Render**: < 100ms for 100 items
- **Chart Render**: < 500ms

### Browser Support

- Chrome/Edge (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)
- Mobile browsers (iOS Safari, Chrome Mobile)

### Accessibility Requirements

- WCAG 2.1 AA compliance
- Keyboard navigation
- Screen reader support
- Focus management
- Color contrast ratios

---

## Testing Strategy

### Unit Tests

- Component rendering
- Hook logic
- Utility functions
- API functions

### Integration Tests

- User workflows
- API integration
- State management
- Form submissions

### E2E Tests

- Critical user paths
- Multi-step workflows
- Error scenarios

---

## Deployment Checklist

### Pre-Deployment

- [ ] All tests passing
- [ ] Performance benchmarks met
- [ ] Accessibility audit passed
- [ ] Browser compatibility tested
- [ ] Mobile responsiveness verified
- [ ] Error handling tested
- [ ] Loading states verified

### Post-Deployment

- [ ] Monitor error rates
- [ ] Monitor performance metrics
- [ ] Gather user feedback
- [ ] Track feature usage
- [ ] Iterate based on feedback

---

## Success Metrics

### User Experience

- Time to complete common tasks
- Error rate
- User satisfaction score
- Feature adoption rate

### Performance

- Page load times
- API response times
- Time to interactive
- Bundle size

### Business

- Inventory accuracy improvement
- Time saved on operations
- Reduction in stockouts
- Increase in reorder efficiency

---

## Timeline Estimate

**Phase 1: Foundation & Core UI** - 3-4 weeks
- Increment 1.4: 3-4 days (Core UI Components - **START HERE**)
- Increment 1.1: 1 week (Enhanced Overview Dashboard)
- Increment 1.2: 1 week (Enhanced Stock Management)
- Increment 1.3: 3-4 days (Enhanced Ledger)

**Phase 2: Advanced Operations** - 4-5 weeks
- Increment 2.1: 1 week
- Increment 2.2: 1 week
- Increment 2.3: 1 week
- Increment 2.4: 3-4 days
- Increment 2.5: 3-4 days

**Phase 3: Analytics & Planning** - 3-4 weeks
- Increment 3.1: 1 week
- Increment 3.2: 3-4 days
- Increment 3.3: 1 week
- Increment 3.4: 1 week

**Phase 4: Multi-Channel & Enterprise** - 3-4 weeks
- Increment 4.1: 1 week
- Increment 4.2: 3-4 days
- Increment 4.3: 1 week
- Increment 4.4: 3-4 days
- Increment 4.5: 1 week

**Total Estimated Time: 13-17 weeks**

---

## Implementation Sequence

### Step 1: Cleanup & Setup
1. **Delete existing files** - Remove all files in `pos-frontend/src/features/inventory/`
2. **Create folder structure** - Set up the new directory structure per Architecture Overview
3. **Install dependencies** - Add required packages (React Query, Recharts, etc.)
4. **Create placeholder route** - Temporary `InventoryRoute.tsx` to prevent routing errors

### Step 2: Foundation (Phase 1)
1. **Increment 1.4** - Build Core UI Components Library (FIRST - provides foundation)
2. **Increment 1.1** - Build Enhanced Overview Dashboard (uses components from 1.4)
   - **Note:** Include store filter with "All Stores" option in filter bar
3. **Increment 1.2** - Build Enhanced Stock Management (uses components from 1.4)
   - **Note:** Include required store selector in filter bar (no "All Stores" - API requirement)
4. **Increment 1.3** - Build Enhanced Ledger (uses components from 1.4)
   - **Note:** Include store filter with "All Stores" option in filter bar

### Step 3: Operations (Phase 2)
- Continue with increments 2.1 through 2.5 in order

### Step 4: Analytics (Phase 3)
- Continue with increments 3.1 through 3.4 in order

### Step 5: Enterprise (Phase 4)
- Continue with increments 4.1 through 4.5 in order

## Next Steps

1. **Review and Approve Plan** - Stakeholder review
2. **Delete Existing Files** - Remove old inventory frontend files
3. **Set Up Development Environment** - Install dependencies, configure tools
4. **Create Folder Structure** - Set up new directory structure
5. **Build Component Library** - Start with Increment 1.4 (Core UI Components)
6. **Build Dashboard** - Continue with Increment 1.1 (Enhanced Overview Dashboard)
   - **Remember:** Per-tab store filters (not global dropdown)
7. **Iterate and Refine** - Continuous feedback and improvement

---

## Store Filtering Implementation Notes

**Key Decision:** Per-tab store filters instead of global dropdown

**Implementation Guidelines:**
- Each tab manages its own store filter state
- "All Stores" option only appears where API supports it (Overview, Ledger)
- Stock Management requires a store (no "All Stores" option)
- Store filter should be part of the FilterBar component in each tab
- Default to "All Stores" where applicable, or first available store where required
- Store filter should be clearly labeled and positioned consistently within filter bars

---

**Document Version:** 1.1  
**Last Updated:** 2024-12-05  
**Status:** Ready for Implementation

