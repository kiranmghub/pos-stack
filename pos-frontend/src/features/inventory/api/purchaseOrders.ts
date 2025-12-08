// pos-frontend/src/features/inventory/api/purchaseOrders.ts
import { apiFetchJSON, apiFetch } from "@/lib/auth";

export interface StoreInfo {
  id: number;
  code: string;
  name: string;
}

export interface VendorInfo {
  id: number;
  name: string;
  code: string;
}

export interface POLine {
  id: number;
  variant_id: number;
  sku: string | null;
  product_name: string;
  qty_ordered: number;
  qty_received: number;
  qty_remaining: number;
  unit_cost: string; // Decimal as string
  notes?: string;
}

export interface PurchaseOrder {
  id: number;
  po_number: string;
  status: "DRAFT" | "SUBMITTED" | "PARTIAL_RECEIVED" | "RECEIVED" | "CANCELLED";
  store: StoreInfo;
  vendor: VendorInfo;
  notes: string;
  created_at: string; // ISO datetime string
  submitted_at: string | null;
  created_by?: string | null;
  lines: POLine[];
}

export interface PurchaseOrderListResponse {
  results: PurchaseOrder[];
  count: number;
}

export interface PurchaseOrderListParams {
  store_id?: number | null;
  status?: string;
  vendor_id?: number | null;
  page?: number;
  page_size?: number;
}

export interface CreatePOPayload {
  store_id: number;
  vendor_id: number;
  notes?: string;
  lines: Array<{
    variant_id: number;
    qty_ordered: number;
    unit_cost: string | number;
    notes?: string;
  }>;
}

export interface UpdatePOPayload {
  notes?: string;
  lines?: Array<{
    variant_id: number;
    qty_ordered: number;
    unit_cost: string | number;
    notes?: string;
  }>;
}

export interface ReceivePOLine {
  line_id: number;
  qty_receive: number;
}

export interface ReceivePOPayload {
  lines?: ReceivePOLine[]; // If empty, receives all remaining
}

export interface Vendor {
  id: number;
  name: string;
  code: string;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
}

export interface VendorListResponse {
  results: Vendor[];
  count: number;
}

export interface CreateVendorPayload {
  name: string;
  code?: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
}

/**
 * Fetch purchase orders list with filters
 * Security: Tenant-scoped via API
 */
export async function getPurchaseOrdersList(params: PurchaseOrderListParams): Promise<PurchaseOrderListResponse> {
  const searchParams = new URLSearchParams();
  
  if (params.store_id !== undefined && params.store_id !== null) {
    searchParams.append("store_id", params.store_id.toString());
  }
  if (params.status) {
    searchParams.append("status", params.status);
  }
  if (params.vendor_id !== undefined && params.vendor_id !== null) {
    searchParams.append("vendor_id", params.vendor_id.toString());
  }
  if (params.page !== undefined) {
    searchParams.append("page", params.page.toString());
  }
  if (params.page_size !== undefined) {
    searchParams.append("page_size", params.page_size.toString());
  }

  return apiFetchJSON(`/api/v1/purchasing/pos?${searchParams.toString()}`);
}

/**
 * Fetch purchase order detail
 * Security: Tenant-scoped via API
 */
export async function getPurchaseOrderDetail(id: number): Promise<PurchaseOrder> {
  return apiFetchJSON(`/api/v1/purchasing/pos/${id}`);
}

/**
 * Create a new purchase order
 * Security: Tenant-scoped via API, validates store and vendor ownership
 */
export async function createPurchaseOrder(payload: CreatePOPayload): Promise<{ id: number; po_number: string; status: string }> {
  return apiFetchJSON("/api/v1/purchasing/pos", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Update a purchase order (only DRAFT status)
 * Security: Tenant-scoped via API
 */
export async function updatePurchaseOrder(id: number, payload: UpdatePOPayload): Promise<{ id: number; status: string }> {
  return apiFetchJSON(`/api/v1/purchasing/pos/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

/**
 * Delete a purchase order (only DRAFT status)
 * Security: Tenant-scoped via API
 */
export async function deletePurchaseOrder(id: number): Promise<void> {
  await apiFetch(`/api/v1/purchasing/pos/${id}`, {
    method: "DELETE",
  });
}

/**
 * Submit a purchase order (DRAFT → SUBMITTED)
 * Security: Tenant-scoped via API
 */
export async function submitPurchaseOrder(id: number): Promise<{ ok: boolean; status: string }> {
  return apiFetchJSON(`/api/v1/purchasing/pos/${id}/submit`, {
    method: "POST",
  });
}

/**
 * Receive items for a purchase order (partial/full)
 * Security: Tenant-scoped via API, updates inventory and creates ledger entries
 */
export async function receivePurchaseOrder(id: number, payload: ReceivePOPayload): Promise<{ ok: boolean; status: string }> {
  return apiFetchJSON(`/api/v1/purchasing/pos/${id}/receive`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Fetch vendors list
 * Security: Tenant-scoped via API
 */
export async function getVendorsList(params?: { q?: string; page?: number; page_size?: number }): Promise<VendorListResponse> {
  const searchParams = new URLSearchParams();
  
  if (params?.q) {
    searchParams.append("q", params.q);
  }
  if (params?.page !== undefined) {
    searchParams.append("page", params.page.toString());
  }
  if (params?.page_size !== undefined) {
    searchParams.append("page_size", params.page_size.toString());
  }

  return apiFetchJSON(`/api/v1/purchasing/vendors?${searchParams.toString()}`);
}

/**
 * Create a new vendor
 * Security: Tenant-scoped via API
 */
export async function createVendor(payload: CreateVendorPayload): Promise<{ id: number; name: string; code: string }> {
  return apiFetchJSON("/api/v1/purchasing/vendors", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

