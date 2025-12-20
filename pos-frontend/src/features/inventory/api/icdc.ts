// pos-frontend/src/features/inventory/api/icdc.ts
import { apiFetchJSON, apiFetch } from "@/lib/auth";

export interface ICDCParseResponse {
  success: boolean;
  error?: string;
  data: {
    header: Record<string, any>;
    lines: Array<Record<string, any>>;
    totals: Record<string, any>;
  };
  metadata?: {
    parser_version: string;
    confidence: number;
    parsing_method: string;
    errors?: string[];
    warnings?: string[];
  };
}

export interface ICDCSaveDraftPayload {
  icdc_number: string;
  invoice_date: string;
  store_id: number;
  vendor_id: number;
  pdf_file_id: number;
  raw_extraction?: Record<string, any>;
  canonical_data?: Record<string, any>;
  parsing_errors?: any[];
  calculation_discrepancies?: any[];
  parsing_metadata?: Record<string, any>;
  is_reupload?: boolean;
  lines?: Array<{
    line_number: number;
    brand_number: string;
    brand_name: string;
    product_type: string;
    pack_qty: number;
    size_ml: number;
    cases_delivered: number;
    bottles_delivered: number;
    unit_rate: string;
    btl_rate: string;
    total: string;
    calculated_total: string;
    has_discrepancy: boolean;
    discrepancy_reason?: string;
    raw_data?: Record<string, any>;
  }>;
}

export interface ICDCSaveDraftResponse {
  id: number;
  icdc_number: string;
  status: string;
  duplicate_info?: {
    action: string;
    existing_invoice_id?: number;
    existing_status?: string;
    message?: string;
  };
}

export interface ICDCSubmitResponse {
  success: boolean;
  invoice_id: number;
  purchase_order_id: number;
  warnings?: string[];
}

export interface ICDCListParams {
  page?: number;
  page_size?: number;
  status?: string;
  store_id?: number;
}

export interface ICDCListResponse {
  results: Array<{
    id: number;
    icdc_number: string;
    invoice_date: string;
    status: string;
    store: { id: number; name: string };
    vendor: { id: number; name: string };
    purchase_order_id?: number;
    created_at: string;
    received_at?: string;
    line_count: number;
  }>;
  count: number;
}

export interface ICDCDetailResponse {
  id: number;
  icdc_number: string;
  invoice_date: string;
  status: string;
  store: { id: number; name: string };
  vendor: { id: number; name: string };
  purchase_order_id?: number;
  purchase_order?: {
    id: number;
    po_number: string;
  };
  raw_extraction: Record<string, any>;
  canonical_data: Record<string, any>;
  parsing_errors: any[];
  calculation_discrepancies: any[];
  parsing_metadata: Record<string, any>;
  is_reupload: boolean;
  created_at: string;
  received_at?: string;
  lines: Array<{
    id: number;
    line_number: number;
    brand_number: string;
    brand_name: string;
    product_type: string;
    pack_qty: number;
    size_ml: number;
    cases_delivered: number;
    bottles_delivered: number;
    unit_rate: string;
    btl_rate: string;
    total: string;
    calculated_total: string;
    has_discrepancy: boolean;
    discrepancy_reason?: string;
    product_id?: number;
    variant_id?: number;
    product?: { id: number; name: string };
    variant?: { id: number; name: string; sku: string };
  }>;
}

/**
 * Parse ICDC PDF file
 */
export async function parseICDCPDF(file: File): Promise<ICDCParseResponse> {
  const formData = new FormData();
  formData.append("file", file);
  
  const response = await apiFetch("/api/v1/domain-extensions/telangana-liquor/icdc/parse", {
    method: "POST",
    body: formData,
  });
  
  const data = await response.json();
  
  // Return the response data regardless of status code
  // The frontend will check the success field and errors
  return data as ICDCParseResponse;
}

/**
 * Save ICDC invoice as draft
 */
export async function saveICDCDraft(payload: ICDCSaveDraftPayload): Promise<ICDCSaveDraftResponse> {
  return apiFetchJSON("/api/v1/domain-extensions/telangana-liquor/icdc/save-draft", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }) as Promise<ICDCSaveDraftResponse>;
}

/**
 * Submit ICDC invoice
 */
export async function submitICDCInvoice(
  id: number,
  payload?: { update_variant_cost?: boolean }
): Promise<ICDCSubmitResponse> {
  return apiFetchJSON(`/api/v1/domain-extensions/telangana-liquor/icdc/${id}/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload || {}),
  }) as Promise<ICDCSubmitResponse>;
}

/**
 * Get ICDC invoices list
 */
export async function getICDCInvoicesList(params?: ICDCListParams): Promise<ICDCListResponse> {
  const queryParams = new URLSearchParams();
  if (params?.page) queryParams.append("page", params.page.toString());
  if (params?.page_size) queryParams.append("page_size", params.page_size.toString());
  if (params?.status) queryParams.append("status", params.status);
  if (params?.store_id) queryParams.append("store_id", params.store_id.toString());
  
  const queryString = queryParams.toString();
  const url = `/api/v1/domain-extensions/telangana-liquor/icdc/${queryString ? `?${queryString}` : ""}`;
  
  return apiFetchJSON(url) as Promise<ICDCListResponse>;
}

/**
 * Get ICDC invoice detail
 */
export async function getICDCInvoiceDetail(id: number): Promise<ICDCDetailResponse> {
  return apiFetchJSON(`/api/v1/domain-extensions/telangana-liquor/icdc/${id}/`) as Promise<ICDCDetailResponse>;
}

/**
 * Update ICDC invoice
 */
export async function updateICDCInvoice(
  id: number,
  payload: {
    store_id?: number;
    vendor_id?: number;
    invoice_date?: string;
    canonical_data?: Record<string, any>;
  }
): Promise<{ id: number; status: string }> {
  return apiFetchJSON(`/api/v1/domain-extensions/telangana-liquor/icdc/${id}/`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }) as Promise<{ id: number; status: string }>;
}

/**
 * Delete ICDC invoice
 */
export async function deleteICDCInvoice(id: number): Promise<{ success: boolean }> {
  return apiFetchJSON(`/api/v1/domain-extensions/telangana-liquor/icdc/${id}/`, {
    method: "DELETE",
  }) as Promise<{ success: boolean }>;
}

/**
 * Reverse ICDC invoice
 */
export async function reverseICDCInvoice(id: number, reason: string): Promise<{ success: boolean; warnings?: string[] }> {
  return apiFetchJSON(`/api/v1/domain-extensions/telangana-liquor/icdc/${id}/reverse`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason }),
  }) as Promise<{ success: boolean; warnings?: string[] }>;
}

