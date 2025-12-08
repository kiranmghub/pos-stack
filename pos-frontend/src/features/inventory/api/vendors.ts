// pos-frontend/src/features/inventory/api/vendors.ts
import { apiFetchJSON } from "@/lib/auth";

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

export interface VendorListParams {
  q?: string;
  page?: number;
  page_size?: number;
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

export interface OnTimePerformance {
  on_time_percentage: number;
  total_orders: number;
  on_time_orders: number;
  late_orders: number;
  confidence: number;
}

export interface LeadTimeMetrics {
  average_lead_time_days: number | null;
  min_lead_time_days: number | null;
  max_lead_time_days: number | null;
  orders_count: number;
  confidence: number;
}

export interface FillRateMetrics {
  fill_rate_percentage: number;
  total_ordered: number;
  total_received: number;
  orders_count: number;
  confidence: number;
}

export interface CostVarianceMetrics {
  cost_variance: number | null;
  average_unit_cost: number | null;
  min_unit_cost: number | null;
  max_unit_cost: number | null;
  orders_count: number;
  price_history?: Array<{
    date: string;
    cost: number;
  }>;
}

export interface VendorScorecard {
  vendor_id: number;
  vendor_name: string;
  vendor_code: string | null;
  on_time_performance: OnTimePerformance;
  lead_time: LeadTimeMetrics;
  fill_rate: FillRateMetrics;
  cost_variance: CostVarianceMetrics;
  overall_score: number; // 0-100
  period_days: number;
  calculated_at: string;
}

/**
 * Fetch vendors list with filters
 * Security: Tenant-scoped via API
 */
export async function getVendorsList(params?: VendorListParams): Promise<VendorListResponse> {
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

  const queryString = searchParams.toString();
  return apiFetchJSON(
    `/api/v1/purchasing/vendors${queryString ? `?${queryString}` : ""}`
  );
}

/**
 * Fetch vendor detail
 * Note: Backend doesn't have a detail endpoint, so we'll use the list endpoint
 * Security: Tenant-scoped via API
 */
export async function getVendorDetail(id: number): Promise<Vendor> {
  // Since there's no detail endpoint, we'll fetch from list and filter
  const response = await getVendorsList({ page: 1, page_size: 1000 });
  const vendor = response.results.find((v) => v.id === id);
  if (!vendor) {
    throw new Error("Vendor not found");
  }
  return vendor;
}

/**
 * Create a new vendor
 * Security: Tenant-scoped via API
 */
export async function createVendor(payload: CreateVendorPayload): Promise<Vendor> {
  return apiFetchJSON("/api/v1/purchasing/vendors", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

/**
 * Update vendor
 * Note: Backend doesn't have an update endpoint yet
 * Security: Tenant-scoped via API
 */
export async function updateVendor(id: number, payload: Partial<CreateVendorPayload>): Promise<Vendor> {
  // TODO: Implement when backend endpoint is available
  throw new Error("Update vendor endpoint not yet implemented in backend");
}

/**
 * Delete vendor
 * Note: Backend doesn't have a delete endpoint yet
 * Security: Tenant-scoped via API
 */
export async function deleteVendor(id: number): Promise<void> {
  // TODO: Implement when backend endpoint is available
  throw new Error("Delete vendor endpoint not yet implemented in backend");
}

/**
 * Fetch vendor scorecard
 * Security: Tenant-scoped via API
 */
export async function getVendorScorecard(
  vendorId: number,
  daysBack?: number
): Promise<VendorScorecard> {
  const searchParams = new URLSearchParams();
  if (daysBack !== undefined) {
    searchParams.append("days_back", daysBack.toString());
  }

  const queryString = searchParams.toString();
  return apiFetchJSON(
    `/api/v1/analytics/vendors/${vendorId}/scorecard${queryString ? `?${queryString}` : ""}`
  );
}

