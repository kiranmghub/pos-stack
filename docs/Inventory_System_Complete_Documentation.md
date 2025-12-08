# Inventory Management System - Complete Documentation

> **Comprehensive Guidebook for Frontend Development**  
> This document provides a complete reference for all inventory management features implemented across Phase 1, Phase 2, and Phase 3.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Core Concepts](#core-concepts)
3. [Authentication & Authorization](#authentication--authorization)
4. [Phase 1: Foundation Features](#phase-1-foundation-features)
5. [Phase 2: Advanced Operations](#phase-2-advanced-operations)
6. [Phase 3: Multi-Channel & Predictive](#phase-3-multi-channel--predictive)
7. [API Reference](#api-reference)
8. [Data Models](#data-models)
9. [Workflows & Use Cases](#workflows--use-cases)
10. [Frontend Integration Guide](#frontend-integration-guide)

---

## System Overview

The Inventory Management System is a comprehensive, multi-tenant, production-grade solution for managing inventory across multiple stores, channels, and workflows. It provides:

- **Real-time stock tracking** with ledger-based audit trails
- **Multi-store inventory management** with cross-store visibility
- **Advanced operations**: transfers, cycle counts, purchase orders
- **Multi-channel support** with reservations and backorders
- **Predictive analytics**: forecasting, shrinkage, aging reports
- **Enterprise features**: webhooks, exports, audit logging

### Key Principles

1. **Tenant Isolation**: All data is strictly scoped to tenants
2. **Audit Trail**: Every inventory change is logged in `StockLedger`
3. **Atomic Operations**: All inventory updates use database transactions
4. **Security First**: Authentication required, role-based access control
5. **Production Ready**: Error handling, validation, performance optimizations

---

## Core Concepts

### Inventory Item

The core entity representing stock at a specific store for a specific product variant.

```json
{
  "id": 123,
  "tenant_id": 1,
  "store_id": 5,
  "variant_id": 789,
  "on_hand": 100,        // Physical stock available
  "reserved": 10,        // Stock reserved for pending orders
  "available": 90        // on_hand - reserved (calculated)
}
```

**Key Fields:**
- `on_hand`: Physical quantity in stock
- `reserved`: Quantity reserved for pending transactions
- `available`: Calculated as `on_hand - reserved`

### Stock Ledger

Immutable audit log of all inventory movements. Every change to `on_hand` creates a ledger entry.

**Reference Types:**
- `SALE`: POS sale
- `RETURN`: Return/refund
- `ADJUSTMENT`: Manual adjustment
- `TRANSFER_OUT`: Stock sent to another store
- `TRANSFER_IN`: Stock received from another store
- `COUNT_RECONCILE`: Cycle count adjustment
- `PURCHASE_ORDER_RECEIPT`: Stock received from vendor
- `WASTE`: Wasted/damaged stock
- `RESERVATION`: Stock reserved
- `RESERVATION_COMMIT`: Reservation committed (sold)
- `RESERVATION_RELEASE`: Reservation released (cancelled)

### Tenant Isolation

All operations are tenant-scoped. Users can only access data for their assigned tenant(s). The system automatically resolves the tenant from:
1. Request tenant attribute (set by middleware)
2. JWT token payload
3. User's active tenant

---

## Authentication & Authorization

### Authentication

All API endpoints require authentication via JWT tokens.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

### Roles

- **Owner**: Full access to all features
- **Cashier**: Limited access (POS operations, basic inventory queries)

### Tenant Resolution

The system automatically resolves the tenant from the authenticated user. No need to pass `tenant_id` in requests.

---

## Phase 1: Foundation Features

### 1.1 Stock Lookup & Cross-Store Visibility

**Feature**: Check stock availability across all stores for a product variant.

**API Endpoint:**
```
GET /api/v1/inventory/stock-across-stores?variant_id={id}
```

**Response:**
```json
{
  "variant_id": 789,
  "variant_name": "Product Variant",
  "variant_sku": "SKU-001",
  "stores": [
    {
      "store_id": 5,
      "store_name": "Store 1",
      "store_code": "S1",
      "on_hand": 100,
      "low_stock": false,
      "low_stock_threshold": 10
    },
    {
      "store_id": 6,
      "store_name": "Store 2",
      "store_code": "S2",
      "on_hand": 5,
      "low_stock": true,
      "low_stock_threshold": 10
    }
  ]
}
```

**Use Case**: POS screen "Check Availability" button shows stock across all stores.

### 1.2 Inventory Overview

**Feature**: Dashboard view of inventory status with filtering and pagination.

**API Endpoint:**
```
GET /api/v1/inventory/overview?store_id={id}&category={name}&search={query}&page={n}&page_size={n}
```

**Response:**
```json
{
  "results": [
    {
      "variant_id": 789,
      "sku": "SKU-001",
      "product_name": "Product Name",
      "store_id": 5,
      "store_name": "Store 1",
      "on_hand": 100,
      "reserved": 10,
      "available": 90,
      "low_stock": false,
      "reorder_point": 20
    }
  ],
  "count": 150,
  "page": 1,
  "page_size": 24,
  "summary": {
    "total_skus": 150,
    "total_qty": 5000,
    "total_value": 125000.00,
    "transfers_in_transit_count": 3
  }
}
```

**Use Case**: Inventory dashboard showing all products with stock levels.

### 1.3 Stock Adjustments

**Feature**: Manually adjust inventory quantities with reason codes.

**API Endpoint:**
```
POST /api/v1/inventory/adjustments
```

**Request:**
```json
{
  "store_id": 5,
  "reason_code": "DAMAGE",
  "note": "Damaged during handling",
  "lines": [
    {
      "variant_id": 789,
      "delta": -5
    }
  ]
}
```

**Response:**
```json
{
  "id": 456,
  "created_at": "2024-01-15T10:30:00Z",
  "lines": [
    {
      "variant_id": 789,
      "delta": -5,
      "balance_after": 95
    }
  ]
}
```

**Adjustment Reasons:**
- `COUNT`: Cycle Count
- `SHRINK`: Shrink / Theft
- `DAMAGE`: Damaged
- `SAMPLE`: Sample
- `CORRECTION`: Correction

**Use Case**: Correct inventory discrepancies, record damage, etc.

### 1.4 Stock Ledger

**Feature**: View complete audit trail of all inventory movements.

**API Endpoint:**
```
GET /api/v1/inventory/ledger?variant_id={id}&ref_type={type}&date_from={date}&date_to={date}&page={n}
```

**Response:**
```json
{
  "results": [
    {
      "id": 1234,
      "created_at": "2024-01-15T10:30:00Z",
      "store_id": 5,
      "store_name": "Store 1",
      "store_code": "S1",
      "variant_id": 789,
      "product_name": "Product Name",
      "sku": "SKU-001",
      "qty_delta": -5,
      "balance_after": 95,
      "ref_type": "ADJUSTMENT",
      "ref_id": 456,
      "note": "Damaged during handling",
      "created_by": "user@example.com"
    }
  ],
  "count": 100
}
```

**Use Case**: Audit trail, reporting, debugging inventory discrepancies.

---

## Phase 2: Advanced Operations

### 2.1 Inventory Transfers

**Feature**: Transfer stock between stores with send/receive workflow.

#### Create Transfer

**API Endpoint:**
```
POST /api/v1/inventory/transfers
```

**Request:**
```json
{
  "from_store_id": 5,
  "to_store_id": 6,
  "notes": "Restocking Store 2",
  "lines": [
    {
      "variant_id": 789,
      "qty": 20
    }
  ]
}
```

**Response:**
```json
{
  "id": 100,
  "status": "DRAFT"
}
```

#### Send Transfer

**API Endpoint:**
```
POST /api/v1/inventory/transfers/{id}?action=send
```

**What Happens:**
- Decrements `on_hand` at source store
- Sets `qty_sent` on transfer lines
- Creates `TRANSFER_OUT` ledger entry
- Changes status to `IN_TRANSIT`

**Response:**
```json
{
  "ok": true,
  "status": "IN_TRANSIT"
}
```

#### Receive Transfer

**API Endpoint:**
```
POST /api/v1/inventory/transfers/{id}?action=receive
```

**Request (optional - for partial receiving):**
```json
{
  "lines": [
    {
      "variant_id": 789,
      "qty_receive": 15
    }
  ]
}
```

**What Happens:**
- Increments `on_hand` at destination store
- Updates `qty_received` on transfer lines
- Creates `TRANSFER_IN` ledger entry
- Changes status to `RECEIVED` or `PARTIAL_RECEIVED`

**Transfer Statuses:**
- `DRAFT`: Created but not sent
- `IN_TRANSIT`: Sent, awaiting receipt
- `PARTIAL_RECEIVED`: Partially received
- `RECEIVED`: Fully received
- `CANCELLED`: Cancelled

**Use Case**: Restocking stores, moving inventory between locations.

### 2.2 Cycle Counts

**Feature**: Physical inventory counting with variance tracking.

#### Create Count Session

**API Endpoint:**
```
POST /api/v1/inventory/counts
```

**Request:**
```json
{
  "store_id": 5,
  "scope": "FULL_STORE",  // or "ZONE"
  "zone_name": "Aisle 1",  // required if scope is ZONE
  "note": "Monthly cycle count"
}
```

**Scopes:**
- `FULL_STORE`: Count entire store
- `ZONE`: Count specific zone/area

#### Add Count Lines

**API Endpoint:**
```
POST /api/v1/inventory/counts/{id}/set_qty
```

**Request:**
```json
{
  "variant_id": 789,
  "counted_qty": 95,
  "location": "Aisle 1, Shelf 2"
}
```

#### Finalize Count

**API Endpoint:**
```
POST /api/v1/inventory/counts/{id}/finalize
```

**What Happens:**
- Calculates variance (counted - expected)
- Creates adjustment if variance exists
- Updates `on_hand` to match counted quantity
- Creates `COUNT_RECONCILE` ledger entries
- Changes status to `FINALIZED`

**Get Variance Preview:**
```
GET /api/v1/inventory/counts/{id}/variance
```

**Response:**
```json
{
  "total_variants": 50,
  "variants_with_variance": 5,
  "total_variance": -25,
  "lines": [
    {
      "variant_id": 789,
      "sku": "SKU-001",
      "expected_qty": 100,
      "counted_qty": 95,
      "variance": -5
    }
  ]
}
```

**Use Case**: Regular inventory audits, identifying discrepancies.

### 2.3 Purchase Orders

**Feature**: Manage vendor orders and receiving.

#### Create Vendor

**API Endpoint:**
```
POST /api/v1/purchasing/vendors
```

**Request:**
```json
{
  "name": "Vendor ABC",
  "code": "VEND-ABC",
  "contact_name": "John Doe",
  "email": "john@vendor.com",
  "phone": "+1234567890",
  "lead_time_days": 7,
  "safety_stock_days": 3
}
```

#### Create Purchase Order

**API Endpoint:**
```
POST /api/v1/purchasing/purchase_orders
```

**Request:**
```json
{
  "store_id": 5,
  "vendor_id": 10,
  "notes": "Monthly restock order",
  "lines": [
    {
      "variant_id": 789,
      "qty_ordered": 100,
      "unit_cost": 10.50,
      "notes": "Bulk order discount"
    }
  ]
}
```

**Response:**
```json
{
  "id": 200,
  "po_number": "TENANT-PO-000200",
  "status": "DRAFT"
}
```

#### Submit Purchase Order

**API Endpoint:**
```
POST /api/v1/purchasing/purchase_orders/{id}/submit
```

**What Happens:**
- Changes status to `SUBMITTED`
- Sets `submitted_at` timestamp
- Auto-generates PO number if not set

#### Receive Purchase Order

**API Endpoint:**
```
POST /api/v1/purchasing/purchase_orders/{id}/receive
```

**Request (optional - for partial receiving):**
```json
{
  "lines": [
    {
      "variant_id": 789,
      "qty_receive": 80
    }
  ]
}
```

**What Happens:**
- Increments `on_hand` at store
- Updates `qty_received` on PO lines
- Creates `PURCHASE_ORDER_RECEIPT` ledger entries
- Sets `received_at` timestamp (first receipt)
- Changes status to `RECEIVED` or `PARTIAL_RECEIVED`

**PO Statuses:**
- `DRAFT`: Created but not submitted
- `SUBMITTED`: Submitted to vendor
- `PARTIAL_RECEIVED`: Partially received
- `RECEIVED`: Fully received
- `CANCELLED`: Cancelled

**Use Case**: Managing vendor orders, tracking receipts, inventory replenishment.

### 2.4 Reorder Suggestions

**Feature**: Get low-stock items with suggested reorder quantities.

**API Endpoint:**
```
GET /api/v1/inventory/reorder_suggestions?store_id={id}&category_id={id}&page={n}
```

**Response:**
```json
{
  "results": [
    {
      "variant_id": 789,
      "sku": "SKU-001",
      "product_name": "Product Name",
      "store_id": 5,
      "store_name": "Store 1",
      "current_stock": 5,
      "reorder_point": 20,
      "suggested_reorder_qty": 50,
      "reorder_qty": 50  // from variant.reorder_qty if set
    }
  ],
  "count": 25
}
```

**Use Case**: Purchasing dashboard, automated reorder workflows.

### 2.5 Stock Summary

**Feature**: Aggregated stock view across all stores.

**API Endpoint:**
```
GET /api/v1/inventory/stock_summary?variant_id={id}
```

**Response:**
```json
{
  "variant_id": 789,
  "sku": "SKU-001",
  "product_name": "Product Name",
  "stores": [
    {
      "store_id": 5,
      "store_name": "Store 1",
      "on_hand": 100,
      "reserved": 10
    },
    {
      "store_id": 6,
      "store_name": "Store 2",
      "on_hand": 50,
      "reserved": 5
    }
  ],
  "total_on_hand": 150,
  "total_reserved": 15,
  "total_available": 135
}
```

**Use Case**: Product-level stock overview across all locations.

---

## Phase 3: Multi-Channel & Predictive

### 3.1 Reservations & Backorders

**Feature**: Reserve stock for pending orders across multiple channels.

#### Reserve Stock

**API Endpoint:**
```
POST /api/v1/inventory/reservations
```

**Request:**
```json
{
  "store_id": 5,
  "variant_id": 789,
  "quantity": 10,
  "ref_type": "PARKED_CART",
  "ref_id": 123,
  "channel": "POS",
  "note": "Customer cart",
  "expires_at": "2024-01-15T12:00:00Z"
}
```

**Response:**
```json
{
  "id": 500,
  "status": "ACTIVE",
  "quantity": 10,
  "expires_at": "2024-01-15T12:00:00Z"
}
```

**What Happens:**
- Increments `reserved` on `InventoryItem`
- Creates `Reservation` record
- Creates `RESERVATION` ledger entry
- Respects `allow_backorders` tenant setting

#### Commit Reservation

**API Endpoint:**
```
POST /api/v1/inventory/reservations/{id}/commit
```

**What Happens:**
- Decrements `reserved` and `on_hand`
- Changes reservation status to `COMMITTED`
- Creates `RESERVATION_COMMIT` ledger entry
- Allows negative `on_hand` if backorders enabled

#### Release Reservation

**API Endpoint:**
```
POST /api/v1/inventory/reservations/{id}/release
```

**What Happens:**
- Decrements `reserved`
- Changes reservation status to `RELEASED`
- Creates `RESERVATION_RELEASE` ledger entry

**Reservation Statuses:**
- `ACTIVE`: Currently reserved
- `COMMITTED`: Reservation fulfilled (sold)
- `RELEASED`: Reservation cancelled

**Use Case**: Parked carts, pending online orders, multi-channel inventory.

### 3.2 Multi-Channel Inventory API

**Feature**: Unified API for all channels (POS, web, marketplaces) to query and reserve stock.

#### Check Availability

**API Endpoint:**
```
GET /api/v1/inventory/availability?variant_id={id}&store_id={id}
```

**Response:**
```json
{
  "variant_id": 789,
  "store_id": 5,
  "on_hand": 100,
  "reserved": 10,
  "available": 90,
  "in_transit": 20
}
```

#### Channel Reserve

**API Endpoint:**
```
POST /api/v1/inventory/reserve
```

**Request:**
```json
{
  "store_id": 5,
  "variant_id": 789,
  "quantity": 5,
  "channel": "WEB",
  "ref_type": "ORDER",
  "ref_id": 456
}
```

**Rate Limiting**: 100 requests per minute per IP (configurable).

**Channels:**
- `POS`: Point of sale
- `WEB`: Web store
- `MARKETPLACE`: Third-party marketplace
- `MOBILE`: Mobile app

**Use Case**: E-commerce integration, marketplace sync, mobile apps.

### 3.3 Forecasting & Predictive Reorder

**Feature**: Predict stockout dates and recommend order quantities.

#### Get Reorder Forecast

**API Endpoint:**
```
GET /api/v1/inventory/reorder_forecast?variant_id={id}&store_id={id}
```

**Response:**
```json
{
  "variant_id": 789,
  "store_id": 5,
  "current_stock": 100,
  "sales_velocity_7d": 10.5,
  "sales_velocity_30d": 12.0,
  "sales_velocity_90d": 11.2,
  "predicted_stockout_date": "2024-02-15",
  "days_until_stockout": 31,
  "recommended_order_qty": 150,
  "confidence_score": 0.85,
  "vendor_lead_time_days": 7,
  "safety_stock_days": 3
}
```

#### Get At-Risk Items

**API Endpoint:**
```
GET /api/v1/inventory/at_risk_items?store_id={id}&days_threshold={n}
```

**Response:**
```json
{
  "results": [
    {
      "variant_id": 789,
      "sku": "SKU-001",
      "product_name": "Product Name",
      "store_id": 5,
      "current_stock": 20,
      "predicted_stockout_date": "2024-01-25",
      "days_until_stockout": 10,
      "recommended_order_qty": 100,
      "confidence_score": 0.90,
      "is_at_risk": true
    }
  ],
  "count": 15
}
```

**Use Case**: Proactive inventory management, automated reordering.

### 3.4 Vendor Analytics & Scorecards

**Feature**: Performance metrics and insights for vendors.

**API Endpoint:**
```
GET /api/v1/analytics/vendors/{id}/scorecard?days_back={n}
```

**Response:**
```json
{
  "vendor_id": 10,
  "vendor_name": "Vendor ABC",
  "period_days": 90,
  "metrics": {
    "on_time_percentage": 95.5,
    "average_lead_time_days": 6.2,
    "fill_rate": 98.0,
    "cost_variance_percentage": 2.1,
    "total_orders": 25,
    "total_value": 50000.00
  },
  "overall_score": 92.5,
  "trends": {
    "lead_time_trend": "improving",
    "on_time_trend": "stable"
  }
}
```

**Metrics Explained:**
- **On-Time %**: Percentage of orders received on or before expected date
- **Average Lead Time**: Average days from submission to receipt
- **Fill Rate**: Percentage of ordered quantity actually received
- **Cost Variance**: Percentage difference between expected and actual costs

**Use Case**: Vendor performance evaluation, purchasing decisions.

### 3.5 Shrinkage, Aging, and Coverage Analytics

**Feature**: Inventory health reports and insights.

#### Shrinkage Report

**API Endpoint:**
```
GET /api/v1/analytics/inventory/shrinkage?store_id={id}&days_back={n}&reason_code={code}
```

**Response:**
```json
{
  "total_shrinkage": 50,
  "shrinkage_by_reason": [
    {
      "code": "DAMAGE",
      "name": "Damage",
      "quantity": 30,
      "count": 3
    },
    {
      "code": "COUNT_RECONCILE",
      "name": "Cycle Count Variance",
      "quantity": 20,
      "count": 2
    }
  ],
  "count_reconciliations": {
    "quantity": 20,
    "count": 2
  },
  "adjustments": {
    "quantity": 30,
    "count": 3
  },
  "period_days": 90,
  "total_entries": 5,
  "confidence": 0.25
}
```

#### Aging Inventory Report

**API Endpoint:**
```
GET /api/v1/analytics/inventory/aging?store_id={id}&days_no_sales={n}
```

**Response:**
```json
{
  "aging_variants": [
    {
      "variant_id": 789,
      "sku": "OLD-001",
      "product_name": "Old Product",
      "on_hand": 50,
      "value": 500.00,
      "last_sale_date": "2023-10-01T12:00:00Z",
      "days_since_last_sale": 120
    }
  ],
  "total_aging_value": 5000.00,
  "total_aging_quantity": 500,
  "aging_by_category": [
    {
      "category": "Electronics",
      "variant_count": 10,
      "total_quantity": 200,
      "total_value": 2000.00
    }
  ],
  "period_days": 90,
  "variant_count": 25
}
```

#### Count Coverage Report

**API Endpoint:**
```
GET /api/v1/analytics/inventory/coverage?store_id={id}&days_back={n}
```

**Response:**
```json
{
  "coverage_percentage": 75.5,
  "total_variants": 200,
  "counted_variants": 151,
  "count_sessions": 10,
  "period_days": 90
}
```

#### Comprehensive Health Summary

**API Endpoint:**
```
GET /api/v1/analytics/inventory/health?store_id={id}&days_back={n}&aging_days={n}
```

**Response:**
```json
{
  "shrinkage": { /* shrinkage data */ },
  "aging": { /* aging data */ },
  "coverage": { /* coverage data */ },
  "calculated_at": "2024-01-15T12:00:00Z"
}
```

**Use Case**: Inventory health dashboard, identifying issues, planning counts.

### 3.6 Webhooks & Real-Time Notifications

**Feature**: Subscribe to inventory events and receive real-time notifications.

#### Create Webhook Subscription

**API Endpoint:**
```
POST /api/v1/webhooks/subscriptions
```

**Request:**
```json
{
  "url": "https://example.com/webhook",
  "event_types": [
    "inventory.stock_changed",
    "inventory.transfer_sent",
    "inventory.transfer_received"
  ],
  "description": "Inventory notifications",
  "max_retries": 3,
  "retry_backoff_seconds": 60
}
```

**Response:**
```json
{
  "id": 100,
  "url": "https://example.com/webhook",
  "event_types": ["inventory.stock_changed", ...],
  "secret": "generated-secret-key",
  "is_active": true
}
```

**Event Types:**
- `inventory.stock_changed`: Any stock movement
- `inventory.transfer_sent`: Transfer sent
- `inventory.transfer_received`: Transfer received
- `inventory.count_finalized`: Count session finalized
- `purchase_order.received`: PO received

#### Webhook Payload Example

When an event occurs, your webhook URL receives:

**Headers:**
```
Content-Type: application/json
X-Webhook-Event: inventory.stock_changed
X-Webhook-Signature: sha256=<hmac_signature>
X-Webhook-Delivery-Id: 12345
User-Agent: POS-Stack-Webhooks/1.0
```

**Body:**
```json
{
  "event": "inventory.stock_changed",
  "timestamp": "2024-01-15T12:00:00Z",
  "tenant_id": 1,
  "tenant_code": "TENANT",
  "data": {
    "store_id": 5,
    "store_code": "S1",
    "store_name": "Store 1",
    "variant_id": 789,
    "sku": "SKU-001",
    "product_name": "Product Name",
    "old_on_hand": 100,
    "new_on_hand": 90,
    "delta": -10,
    "ref_type": "SALE",
    "ref_id": 456,
    "user_id": 10,
    "user_username": "cashier@example.com"
  }
}
```

**Signature Verification:**
```python
import hmac
import hashlib

def verify_signature(payload, signature, secret):
    expected = hmac.new(
        secret.encode('utf-8'),
        payload.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature)
```

#### List Deliveries

**API Endpoint:**
```
GET /api/v1/webhooks/subscriptions/{id}/deliveries?status={status}&page={n}
```

**Response:**
```json
{
  "results": [
    {
      "id": 12345,
      "event_type": "inventory.stock_changed",
      "status": "SUCCESS",
      "attempt_count": 1,
      "response_status_code": 200,
      "created_at": "2024-01-15T12:00:00Z",
      "delivered_at": "2024-01-15T12:00:01Z"
    }
  ],
  "count": 100
}
```

**Delivery Statuses:**
- `PENDING`: Queued for delivery
- `RETRYING`: Retrying after failure
- `SUCCESS`: Successfully delivered
- `FAILED`: Max retries exceeded

**Use Case**: External system integration, real-time sync, notifications.

### 3.7 Advanced Returns & Inspection Workflow

**Feature**: Extended returns workflow with inspection and disposition.

#### Submit Return for Inspection

**API Endpoint:**
```
POST /api/v1/returns/{id}/submit_for_inspection
```

**What Happens:**
- Changes status from `draft` to `awaiting_inspection`

#### Inspect Return Items

**API Endpoint:**
```
POST /api/v1/returns/{id}/inspect
```

**Request:**
```json
{
  "items": [
    {
      "return_item_id": 456,
      "disposition": "RESTOCK",
      "condition": "RESALEABLE",
      "notes": "Item in good condition"
    },
    {
      "return_item_id": 457,
      "disposition": "WASTE",
      "condition": "DAMAGED",
      "notes": "Item damaged beyond repair"
    }
  ]
}
```

**Dispositions:**
- `RESTOCK`: Item can be restocked
- `WASTE`: Item must be disposed

**What Happens:**
- Sets disposition on each item
- Records inspector and timestamp
- Auto-updates return status:
  - `accepted` if any items are RESTOCK
  - `rejected` if all items are WASTE

#### Accept/Reject Return

**API Endpoints:**
```
POST /api/v1/returns/{id}/accept
POST /api/v1/returns/{id}/reject
```

#### Finalize Return (After Inspection)

**API Endpoint:**
```
POST /api/v1/returns/{id}/finalize
```

**Request:**
```json
{
  "refunds": [
    {
      "method": "CARD",
      "amount": 100.00,
      "external_ref": "refund_txn_123"
    }
  ]
}
```

**What Happens:**
- For RESTOCK items: Increments `on_hand`, creates `RETURN` ledger entry
- For WASTE items: Decrements `on_hand`, creates `WASTE` ledger entry
- Processes refunds
- Changes status to `finalized`

#### Get Inspection Queue

**API Endpoint:**
```
GET /api/v1/returns/inspection_queue?store_id={id}
```

**Response:**
```json
{
  "results": [
    {
      "id": 123,
      "return_no": "TENANT-RET-000123",
      "status": "awaiting_inspection",
      "sale_receipt_no": "TENANT-RCP-000456",
      "items": [
        {
          "id": 456,
          "sku": "SKU-001",
          "qty_returned": 2,
          "disposition": "PENDING",
          "condition": "RESALEABLE"
        }
      ],
      "created_at": "2024-01-15T10:00:00Z"
    }
  ]
}
```

**Return Statuses:**
- `draft`: Created, not yet submitted
- `awaiting_inspection`: Submitted, awaiting inspection
- `accepted`: Inspected, accepted for processing
- `rejected`: Inspected, all items wasted
- `finalized`: Processed, refunds issued, inventory updated
- `void`: Cancelled

**Use Case**: Returns processing, quality control, inventory reconciliation.

### 3.8 Data Exports

**Feature**: Export inventory data for reporting, backups, or external systems.

#### Snapshot Export

**Management Command:**
```bash
python manage.py export_inventory_snapshot \
  --tenant 1 \
  --format csv \
  --output /exports \
  --store 5  # optional
```

**Exports:**
- Inventory items
- Stock ledger (all history)
- Transfers (with lines)
- Count sessions (with lines)
- Purchase orders (with lines)

**Output Files:**
```
{tenant_code}_inventory_snapshot_{timestamp}_inventory_items.csv
{tenant_code}_inventory_snapshot_{timestamp}_stock_ledger.csv
{tenant_code}_inventory_snapshot_{timestamp}_transfers.csv
{tenant_code}_inventory_snapshot_{timestamp}_transfer_lines.csv
{tenant_code}_inventory_snapshot_{timestamp}_count_sessions.csv
{tenant_code}_inventory_snapshot_{timestamp}_count_lines.csv
{tenant_code}_inventory_snapshot_{timestamp}_purchase_orders.csv
{tenant_code}_inventory_snapshot_{timestamp}_purchase_order_lines.csv
```

#### Delta Export

**Management Command:**
```bash
python manage.py export_inventory_delta \
  --tenant 1 \
  --type ledger \
  --format json \
  --output /exports
```

**Export Types:**
- `ledger`: Stock ledger entries
- `transfers`: Transfers and lines
- `counts`: Count sessions and lines
- `purchase_orders`: POs and lines

**What Happens:**
- Exports only records with ID > last exported ID
- Updates tracking with new last exported ID
- Use `--reset` to start from beginning

**Use Case**: Incremental backups, ETL processes, external system sync.

---

## API Reference

### Base URL
```
/api/v1
```

### Common Query Parameters

**Pagination:**
- `page`: Page number (default: 1)
- `page_size`: Items per page (default: 24)

**Filtering:**
- `store_id`: Filter by store
- `variant_id`: Filter by variant
- `category`: Filter by category name
- `search`: Search query (name, SKU, barcode)

**Date Filtering:**
- `date_from`: Start date (ISO format or YYYY-MM-DD)
- `date_to`: End date (ISO format or YYYY-MM-DD)

### Response Format

**Success Response:**
```json
{
  "results": [...],
  "count": 100,
  "page": 1,
  "page_size": 24
}
```

**Error Response:**
```json
{
  "error": "Error message",
  "detail": "Detailed error description"
}
```

**HTTP Status Codes:**
- `200`: Success
- `201`: Created
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `500`: Internal Server Error

---

## Data Models

### InventoryItem

```python
{
  "id": int,
  "tenant_id": int,
  "store_id": int,
  "variant_id": int,
  "on_hand": Decimal,      # Physical stock
  "reserved": Decimal,     # Reserved stock
  "created_at": datetime,
  "updated_at": datetime
}
```

### StockLedger

```python
{
  "id": int,
  "tenant_id": int,
  "store_id": int,
  "variant_id": int,
  "qty_delta": int,        # Signed quantity change
  "balance_after": int,    # on_hand after this change
  "ref_type": str,         # SALE, RETURN, ADJUSTMENT, etc.
  "ref_id": int,           # Reference to source record
  "note": str,
  "created_by": User,
  "created_at": datetime
}
```

### InventoryTransfer

```python
{
  "id": int,
  "tenant_id": int,
  "from_store_id": int,
  "to_store_id": int,
  "status": str,           # DRAFT, IN_TRANSIT, RECEIVED, etc.
  "notes": str,
  "created_by": User,
  "created_at": datetime,
  "updated_at": datetime,
  "lines": [
    {
      "variant_id": int,
      "qty": int,
      "qty_sent": int,
      "qty_received": int,
      "qty_remaining": int
    }
  ]
}
```

### CountSession

```python
{
  "id": int,
  "tenant_id": int,
  "store_id": int,
  "code": str,
  "status": str,           # DRAFT, IN_PROGRESS, FINALIZED
  "scope": str,            # FULL_STORE, ZONE
  "zone_name": str,        # Required if scope is ZONE
  "note": str,
  "created_by": User,
  "started_at": datetime,
  "finalized_at": datetime,
  "created_at": datetime,
  "lines": [
    {
      "variant_id": int,
      "expected_qty": int,
      "counted_qty": int,
      "variance": int
    }
  ]
}
```

### PurchaseOrder

```python
{
  "id": int,
  "tenant_id": int,
  "store_id": int,
  "vendor_id": int,
  "po_number": str,
  "status": str,           # DRAFT, SUBMITTED, RECEIVED, etc.
  "notes": str,
  "created_by": User,
  "created_at": datetime,
  "updated_at": datetime,
  "submitted_at": datetime,
  "received_at": datetime, # First receipt timestamp
  "lines": [
    {
      "variant_id": int,
      "qty_ordered": int,
      "qty_received": int,
      "qty_remaining": int,
      "unit_cost": Decimal
    }
  ]
}
```

### Reservation

```python
{
  "id": int,
  "tenant_id": int,
  "store_id": int,
  "variant_id": int,
  "quantity": int,
  "status": str,           # ACTIVE, COMMITTED, RELEASED
  "ref_type": str,         # PARKED_CART, ORDER, etc.
  "ref_id": int,
  "channel": str,          # POS, WEB, MARKETPLACE, etc.
  "note": str,
  "expires_at": datetime,
  "committed_at": datetime,
  "released_at": datetime,
  "created_by": User
}
```

### Return

```python
{
  "id": int,
  "tenant_id": int,
  "store_id": int,
  "sale_id": int,
  "return_no": str,
  "status": str,           # draft, awaiting_inspection, accepted, etc.
  "reason_code": str,
  "notes": str,
  "refund_total": Decimal,
  "processed_by": User,
  "created_at": datetime,
  "items": [
    {
      "id": int,
      "sale_line_id": int,
      "qty_returned": int,
      "disposition": str,  # PENDING, RESTOCK, WASTE
      "condition": str,    # RESALEABLE, DAMAGED, OPEN_BOX
      "inspected_by": User,
      "inspected_at": datetime
    }
  ]
}
```

---

## Workflows & Use Cases

### Workflow 1: Cross-Store Stock Check (POS)

**Scenario**: Customer wants to buy a product that's out of stock at current store.

1. User clicks "Check Availability" on product tile
2. Frontend calls: `GET /api/v1/inventory/stock-across-stores?variant_id={id}`
3. Display stock levels for all stores
4. Optionally show "Transfer" button to initiate transfer

**Frontend Implementation:**
```typescript
async function checkStockAcrossStores(variantId: number) {
  const response = await fetch(
    `/api/v1/inventory/stock-across-stores?variant_id=${variantId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await response.json();
  // Display stores with stock
  return data.stores.filter(store => store.on_hand > 0);
}
```

### Workflow 2: Store-to-Store Transfer

**Scenario**: Transfer stock from Store A to Store B.

1. Create transfer: `POST /api/v1/inventory/transfers`
2. Send transfer: `POST /api/v1/inventory/transfers/{id}?action=send`
   - Stock decremented at source
   - Status: `IN_TRANSIT`
3. Receive transfer: `POST /api/v1/inventory/transfers/{id}?action=receive`
   - Stock incremented at destination
   - Status: `RECEIVED`

**Frontend Implementation:**
```typescript
async function createTransfer(fromStore: number, toStore: number, lines: Array) {
  const response = await fetch('/api/v1/inventory/transfers', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from_store_id: fromStore,
      to_store_id: toStore,
      lines: lines
    })
  });
  return response.json();
}

async function sendTransfer(transferId: number) {
  const response = await fetch(
    `/api/v1/inventory/transfers/${transferId}?action=send`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
  );
  return response.json();
}
```

### Workflow 3: Cycle Count

**Scenario**: Monthly inventory count.

1. Create count session: `POST /api/v1/inventory/counts`
2. Add count lines: `POST /api/v1/inventory/counts/{id}/set_qty`
3. Preview variance: `GET /api/v1/inventory/counts/{id}/variance`
4. Finalize: `POST /api/v1/inventory/counts/{id}/finalize`
   - Adjustments created automatically
   - Inventory updated

**Frontend Implementation:**
```typescript
async function createCountSession(storeId: number, scope: string, zoneName?: string) {
  const response = await fetch('/api/v1/inventory/counts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      store_id: storeId,
      scope: scope,
      zone_name: zoneName
    })
  });
  return response.json();
}

async function addCountLine(sessionId: number, variantId: number, countedQty: number) {
  const response = await fetch(`/api/v1/inventory/counts/${sessionId}/set_qty`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      variant_id: variantId,
      counted_qty: countedQty
    })
  });
  return response.json();
}
```

### Workflow 4: Purchase Order Receiving

**Scenario**: Receive stock from vendor.

1. Create PO: `POST /api/v1/purchasing/purchase_orders`
2. Submit PO: `POST /api/v1/purchasing/purchase_orders/{id}/submit`
3. Receive (partial or full): `POST /api/v1/purchasing/purchase_orders/{id}/receive`
   - Inventory incremented
   - Status: `RECEIVED` or `PARTIAL_RECEIVED`

**Frontend Implementation:**
```typescript
async function receivePurchaseOrder(poId: number, lines?: Array) {
  const response = await fetch(`/api/v1/purchasing/purchase_orders/${poId}/receive`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ lines: lines }) // Optional for partial receive
  });
  return response.json();
}
```

### Workflow 5: Return with Inspection

**Scenario**: Customer returns item, needs inspection.

1. Create return: `POST /api/v1/orders/{sale_id}/returns`
2. Submit for inspection: `POST /api/v1/returns/{id}/submit_for_inspection`
3. Inspect items: `POST /api/v1/returns/{id}/inspect`
   - Set disposition: RESTOCK or WASTE
4. Finalize: `POST /api/v1/returns/{id}/finalize`
   - RESTOCK: Inventory incremented
   - WASTE: Inventory decremented

**Frontend Implementation:**
```typescript
async function inspectReturn(returnId: number, items: Array) {
  const response = await fetch(`/api/v1/returns/${returnId}/inspect`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ items: items })
  });
  return response.json();
}
```

### Workflow 6: Multi-Channel Reservation

**Scenario**: Reserve stock for online order.

1. Check availability: `GET /api/v1/inventory/availability`
2. Reserve: `POST /api/v1/inventory/reserve`
   - `reserved` incremented
3. On order completion: `POST /api/v1/inventory/reservations/{id}/commit`
   - `on_hand` and `reserved` decremented
4. On order cancellation: `POST /api/v1/inventory/reservations/{id}/release`
   - `reserved` decremented

**Frontend Implementation:**
```typescript
async function reserveStock(storeId: number, variantId: number, qty: number, orderId: number) {
  const response = await fetch('/api/v1/inventory/reserve', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      store_id: storeId,
      variant_id: variantId,
      quantity: qty,
      channel: 'WEB',
      ref_type: 'ORDER',
      ref_id: orderId
    })
  });
  return response.json();
}
```

---

## Frontend Integration Guide

### 1. Authentication Setup

```typescript
// Store JWT token
localStorage.setItem('auth_token', token);

// Include in all requests
const headers = {
  'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
  'Content-Type': 'application/json'
};
```

### 2. Error Handling

```typescript
async function apiCall(url: string, options: RequestInit) {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || error.detail || 'Request failed');
    }
    return await response.json();
  } catch (error) {
    // Handle network errors, 401 (logout), etc.
    if (error.status === 401) {
      // Redirect to login
    }
    throw error;
  }
}
```

### 3. Real-Time Updates

**Option 1: Polling**
```typescript
// Poll inventory every 30 seconds
setInterval(async () => {
  const data = await fetchInventoryOverview();
  updateUI(data);
}, 30000);
```

**Option 2: Webhooks (Recommended)**
```typescript
// Set up webhook subscription
await fetch('/api/v1/webhooks/subscriptions', {
  method: 'POST',
  body: JSON.stringify({
    url: 'https://your-app.com/webhook',
    event_types: ['inventory.stock_changed']
  })
});

// Handle webhook events
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  // Verify signature
  // Update UI based on event
});
```

### 4. State Management

**Recommended Structure:**
```typescript
interface InventoryState {
  items: Map<number, InventoryItem>;  // variant_id -> item
  stores: Store[];
  transfers: Transfer[];
  counts: CountSession[];
  loading: boolean;
  error: string | null;
}
```

### 5. UI Components

**Stock Badge Component:**
```typescript
function StockBadge({ onHand, reorderPoint }: Props) {
  const isLowStock = onHand <= reorderPoint;
  const isOutOfStock = onHand === 0;
  
  return (
    <span className={`
      ${isOutOfStock ? 'text-red-600' : ''}
      ${isLowStock ? 'text-yellow-600' : ''}
      ${!isLowStock ? 'text-green-600' : ''}
    `}>
      {isOutOfStock ? 'Out of Stock' : `${onHand} units`}
    </span>
  );
}
```

**Transfer Status Badge:**
```typescript
function TransferStatusBadge({ status }: { status: string }) {
  const colors = {
    'DRAFT': 'gray',
    'IN_TRANSIT': 'blue',
    'PARTIAL_RECEIVED': 'yellow',
    'RECEIVED': 'green',
    'CANCELLED': 'red'
  };
  
  return <Badge color={colors[status]}>{status}</Badge>;
}
```

### 6. Data Fetching Patterns

**React Query Example:**
```typescript
import { useQuery, useMutation } from '@tanstack/react-query';

function useInventoryOverview(storeId?: number) {
  return useQuery({
    queryKey: ['inventory', 'overview', storeId],
    queryFn: () => fetchInventoryOverview(storeId),
    refetchInterval: 30000  // Poll every 30s
  });
}

function useCreateTransfer() {
  return useMutation({
    mutationFn: createTransfer,
    onSuccess: () => {
      // Invalidate queries
      queryClient.invalidateQueries(['inventory', 'transfers']);
      queryClient.invalidateQueries(['inventory', 'overview']);
    }
  });
}
```

### 7. Form Handling

**Transfer Creation Form:**
```typescript
function TransferForm({ onSuccess }: Props) {
  const [formData, setFormData] = useState({
    from_store_id: '',
    to_store_id: '',
    lines: []
  });
  
  const createTransfer = useCreateTransfer();
  
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const result = await createTransfer.mutateAsync(formData);
      onSuccess(result);
    } catch (error) {
      // Show error
    }
  };
  
  return <form onSubmit={handleSubmit}>...</form>;
}
```

### 8. Optimistic Updates

```typescript
function useSendTransfer() {
  return useMutation({
    mutationFn: sendTransfer,
    onMutate: async (transferId) => {
      // Cancel outgoing queries
      await queryClient.cancelQueries(['transfers']);
      
      // Snapshot previous value
      const previous = queryClient.getQueryData(['transfers']);
      
      // Optimistically update
      queryClient.setQueryData(['transfers'], (old) => {
        return old.map(t => 
          t.id === transferId 
            ? { ...t, status: 'IN_TRANSIT' }
            : t
        );
      });
      
      return { previous };
    },
    onError: (err, transferId, context) => {
      // Rollback on error
      queryClient.setQueryData(['transfers'], context.previous);
    }
  });
}
```

---

## Best Practices

### 1. Caching Strategy

- Cache inventory overview (30s TTL)
- Cache store/variant lists (5min TTL)
- Don't cache real-time data (ledger, transfers in progress)

### 2. Error Handling

- Always handle 401 (unauthorized) - redirect to login
- Show user-friendly error messages
- Log errors for debugging
- Retry transient failures

### 3. Performance

- Use pagination for large lists
- Implement virtual scrolling for long lists
- Debounce search inputs
- Batch related API calls when possible

### 4. User Experience

- Show loading states
- Provide feedback on actions
- Confirm destructive actions
- Show success/error notifications

### 5. Security

- Never expose tenant IDs in URLs
- Validate all user inputs
- Sanitize data before display
- Use HTTPS in production

---

## Testing

### API Testing Examples

```typescript
describe('Inventory API', () => {
  it('should get stock across stores', async () => {
    const response = await fetch(
      '/api/v1/inventory/stock-across-stores?variant_id=1',
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.stores).toBeArray();
  });
  
  it('should create transfer', async () => {
    const response = await fetch('/api/v1/inventory/transfers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from_store_id: 1,
        to_store_id: 2,
        lines: [{ variant_id: 1, qty: 10 }]
      })
    });
    expect(response.status).toBe(201);
  });
});
```

---

## Troubleshooting

### Common Issues

**1. 401 Unauthorized**
- Check JWT token is valid
- Verify token hasn't expired
- Ensure Authorization header format is correct

**2. 403 Forbidden**
- User may not have required role
- Tenant isolation - user can't access other tenant's data

**3. 400 Bad Request**
- Check request body format
- Validate all required fields are present
- Check field types match expected format

**4. Inventory Discrepancies**
- Check StockLedger for audit trail
- Run `inventory_check` management command
- Verify no concurrent modifications

**5. Webhook Delivery Failures**
- Check webhook URL is accessible
- Verify signature verification logic
- Check delivery logs in admin

---

## Appendix

### A. Complete API Endpoint List

**Inventory:**
- `GET /api/v1/inventory/overview` - Inventory overview
- `GET /api/v1/inventory/stock` - Stock by store
- `GET /api/v1/inventory/stock-across-stores` - Cross-store stock
- `GET /api/v1/inventory/stock_summary` - Aggregated stock
- `GET /api/v1/inventory/ledger` - Stock ledger
- `POST /api/v1/inventory/adjustments` - Create adjustment
- `GET /api/v1/inventory/adjustments` - List adjustments
- `GET /api/v1/inventory/reasons` - Adjustment reasons
- `GET /api/v1/inventory/transfers` - List transfers
- `POST /api/v1/inventory/transfers` - Create transfer
- `GET /api/v1/inventory/transfers/{id}` - Get transfer
- `POST /api/v1/inventory/transfers/{id}?action=send` - Send transfer
- `POST /api/v1/inventory/transfers/{id}?action=receive` - Receive transfer
- `GET /api/v1/inventory/counts` - List count sessions
- `POST /api/v1/inventory/counts` - Create count session
- `GET /api/v1/inventory/counts/{id}` - Get count session
- `POST /api/v1/inventory/counts/{id}/set_qty` - Add count line
- `GET /api/v1/inventory/counts/{id}/variance` - Get variance
- `POST /api/v1/inventory/counts/{id}/finalize` - Finalize count
- `GET /api/v1/inventory/reorder_suggestions` - Reorder suggestions
- `GET /api/v1/inventory/availability` - Check availability (multi-channel)
- `POST /api/v1/inventory/reserve` - Reserve stock (multi-channel)
- `POST /api/v1/inventory/release` - Release reservation
- `POST /api/v1/inventory/commit` - Commit reservation
- `GET /api/v1/inventory/reorder_forecast` - Reorder forecast
- `GET /api/v1/inventory/at_risk_items` - At-risk items

**Reservations:**
- `GET /api/v1/inventory/reservations` - List reservations
- `POST /api/v1/inventory/reservations` - Create reservation
- `POST /api/v1/inventory/reservations/{id}/release` - Release reservation
- `POST /api/v1/inventory/reservations/{id}/commit` - Commit reservation

**Purchasing:**
- `GET /api/v1/purchasing/vendors` - List vendors
- `POST /api/v1/purchasing/vendors` - Create vendor
- `GET /api/v1/purchasing/vendors/{id}` - Get vendor
- `PUT /api/v1/purchasing/vendors/{id}` - Update vendor
- `DELETE /api/v1/purchasing/vendors/{id}` - Delete vendor
- `GET /api/v1/purchasing/purchase_orders` - List POs
- `POST /api/v1/purchasing/purchase_orders` - Create PO
- `GET /api/v1/purchasing/purchase_orders/{id}` - Get PO
- `PUT /api/v1/purchasing/purchase_orders/{id}` - Update PO
- `DELETE /api/v1/purchasing/purchase_orders/{id}` - Delete PO
- `POST /api/v1/purchasing/purchase_orders/{id}/submit` - Submit PO
- `POST /api/v1/purchasing/purchase_orders/{id}/receive` - Receive PO

**Analytics:**
- `GET /api/v1/analytics/inventory/shrinkage` - Shrinkage report
- `GET /api/v1/analytics/inventory/aging` - Aging report
- `GET /api/v1/analytics/inventory/coverage` - Coverage report
- `GET /api/v1/analytics/inventory/health` - Health summary
- `GET /api/v1/analytics/vendors/{id}/scorecard` - Vendor scorecard

**Webhooks:**
- `GET /api/v1/webhooks/subscriptions` - List subscriptions
- `POST /api/v1/webhooks/subscriptions` - Create subscription
- `GET /api/v1/webhooks/subscriptions/{id}` - Get subscription
- `PUT /api/v1/webhooks/subscriptions/{id}` - Update subscription
- `DELETE /api/v1/webhooks/subscriptions/{id}` - Delete subscription
- `GET /api/v1/webhooks/subscriptions/{id}/deliveries` - List deliveries

**Returns:**
- `GET /api/v1/orders/returns` - List returns
- `POST /api/v1/orders/{sale_id}/returns` - Create return
- `GET /api/v1/orders/returns/{id}` - Get return
- `POST /api/v1/orders/returns/{id}/items` - Add return items
- `POST /api/v1/orders/returns/{id}/submit_for_inspection` - Submit for inspection
- `POST /api/v1/orders/returns/{id}/inspect` - Inspect return
- `POST /api/v1/orders/returns/{id}/accept` - Accept return
- `POST /api/v1/orders/returns/{id}/reject` - Reject return
- `POST /api/v1/orders/returns/{id}/finalize` - Finalize return
- `GET /api/v1/orders/returns/inspection_queue` - Inspection queue

### B. Stock Ledger Reference Types

| Ref Type | Description | Delta Sign |
|----------|-------------|------------|
| `SALE` | POS sale | Negative |
| `RETURN` | Return/refund (restocked) | Positive |
| `ADJUSTMENT` | Manual adjustment | +/- |
| `TRANSFER_OUT` | Stock sent to another store | Negative |
| `TRANSFER_IN` | Stock received from another store | Positive |
| `COUNT_RECONCILE` | Cycle count adjustment | +/- |
| `PURCHASE_ORDER_RECEIPT` | Stock received from vendor | Positive |
| `WASTE` | Wasted/damaged stock | Negative |
| `RESERVATION` | Stock reserved | No change to on_hand |
| `RESERVATION_COMMIT` | Reservation fulfilled | Negative |
| `RESERVATION_RELEASE` | Reservation cancelled | No change to on_hand |

### C. Status Enumerations

**Transfer Statuses:**
- `DRAFT` → `IN_TRANSIT` → `PARTIAL_RECEIVED` / `RECEIVED`
- Can be `CANCELLED` from `DRAFT`

**Count Session Statuses:**
- `DRAFT` → `IN_PROGRESS` → `FINALIZED`

**Purchase Order Statuses:**
- `DRAFT` → `SUBMITTED` → `PARTIAL_RECEIVED` / `RECEIVED`
- Can be `CANCELLED` from `DRAFT`

**Return Statuses:**
- `draft` → `awaiting_inspection` → `accepted` / `rejected` → `finalized`
- Can be `void` from any status

**Reservation Statuses:**
- `ACTIVE` → `COMMITTED` / `RELEASED`

### D. Color Coding Standards

**Stock Levels:**
- **Red** (`text-red-600`): Out of stock (0 units)
- **Yellow** (`text-yellow-600`): Low stock (≤ reorder point)
- **Green** (`text-green-600`): In stock (> reorder point)

**Transfer Status:**
- `DRAFT`: Gray
- `IN_TRANSIT`: Blue
- `PARTIAL_RECEIVED`: Yellow
- `RECEIVED`: Green
- `CANCELLED`: Red

**Count Status:**
- `DRAFT`: Gray
- `IN_PROGRESS`: Blue
- `FINALIZED`: Green

---

## Conclusion

This documentation provides a complete reference for building a frontend that fully leverages the inventory management backend. All features are production-ready, secure, and tenant-isolated.

For questions or clarifications, refer to the API endpoints directly or check the source code comments.

**Last Updated**: 2024-01-15  
**Version**: 1.0  
**Phase**: 3 Complete

