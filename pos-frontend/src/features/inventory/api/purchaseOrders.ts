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
  is_external?: boolean;
  external_po_number?: string;
  vendor_invoice_number?: string;
  vendor_invoice_date?: string | null; // YYYY-MM-DD
  import_source?: string;
  invoice_document_id?: number | null;
  invoice_document_url?: string | null;
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

export interface ExternalPOReceivePayload {
  store_id: number;
  vendor_id: number;
  external_po_number?: string;
  vendor_invoice_number?: string;
  vendor_invoice_date?: string; // YYYY-MM-DD
  notes?: string;
  // Either CSV file OR lines JSON, but not both
  file?: File; // CSV file
  invoice_file?: File; // PDF/Image invoice
  lines?: Array<{
    variant_id: number;
    qty: number;
    unit_cost: number | string;
    notes?: string;
  }>;
}

export interface ExternalPOReceiveResponse {
  id: number;
  po_number: string;
  status: string;
  is_external: boolean;
  external_po_number?: string;
  vendor_invoice_number?: string;
  invoice_document_id?: number | null;
  total_value: string;
  lines_count: number;
  lines: Array<{
    variant_id: number;
    sku: string;
    product_name: string;
    quantity: number;
    unit_cost: string;
  }>;
  errors?: Array<{ row: number; message: string }>;
}

/**
 * Receive inventory from external purchase order (CSV upload or manual entry)
 * Security: Tenant-scoped via API, validates all inputs, updates inventory
 */
export async function receiveExternalPO(payload: ExternalPOReceivePayload): Promise<ExternalPOReceiveResponse> {
  const formData = new FormData();
  
  formData.append("store_id", payload.store_id.toString());
  formData.append("vendor_id", payload.vendor_id.toString());
  
  if (payload.external_po_number) {
    formData.append("external_po_number", payload.external_po_number);
  }
  if (payload.vendor_invoice_number) {
    formData.append("vendor_invoice_number", payload.vendor_invoice_number);
  }
  if (payload.vendor_invoice_date) {
    formData.append("vendor_invoice_date", payload.vendor_invoice_date);
  }
  if (payload.notes) {
    formData.append("notes", payload.notes);
  }
  
  if (payload.file) {
    formData.append("file", payload.file);
  }
  if (payload.invoice_file) {
    formData.append("invoice_file", payload.invoice_file);
  }
  if (payload.lines && !payload.file) {
    // Only send lines if no CSV file (manual entry)
    formData.append("lines", JSON.stringify(payload.lines));
  }

  const res = await apiFetch("/api/v1/purchasing/pos/external-receive", {
    method: "POST",
    body: formData,
    // Don't set Content-Type header - browser will set it with boundary for FormData
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errorData.error || errorData.detail || `Request failed (${res.status})`);
  }

  return res.json();
}

