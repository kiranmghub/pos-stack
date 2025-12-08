// pos-frontend/src/features/inventory/api/forecasting.ts
import { apiFetchJSON } from "@/lib/auth";

export interface SalesVelocity {
  daily_avg: number;
  total_qty: number;
  days_with_sales: number;
  period_days: number;
  confidence: number;
}

export interface SalesVelocityWindows {
  "7_day": SalesVelocity;
  "30_day": SalesVelocity;
  "90_day": SalesVelocity;
  primary: {
    daily_avg: number;
    confidence: number;
    window_days: number;
  };
}

export interface ReorderForecast {
  variant_id: number;
  sku: string | null; // Backend uses "sku" not "variant_sku"
  product_name: string | null;
  store_id: number;
  store_name?: string; // May not be in response
  store_code?: string; // May not be in response
  current_on_hand: number;
  current_reserved?: number;
  available?: number;
  sales_velocity: SalesVelocityWindows | SalesVelocity; // Can be windows or single velocity
  predicted_stockout_date: string | null; // ISO datetime string
  days_until_stockout: number | null;
  is_at_risk: boolean;
  recommended_order_qty: number;
  reorder_calculation?: any; // Calculation details
  confidence_score: number;
  vendor_lead_time_days?: number | null;
  safety_stock_days?: number | null;
}

export interface ReorderForecastParams {
  variant_id: number;
  store_id: number;
  window_days?: number; // Optional, default: 30
}

export interface AtRiskItem extends ReorderForecast {
  // At-risk items have the same structure as ReorderForecast
}

export interface AtRiskItemsListResponse {
  results: AtRiskItem[];
  count: number;
}

export interface AtRiskItemsParams {
  store_id?: number | null;
  limit?: number; // Optional, default: 50
  min_confidence?: number; // Optional, default: 0.1 (0-1)
}

/**
 * Fetch reorder forecast for a specific variant at a store
 * Security: Tenant-scoped via API
 */
export async function getReorderForecast(
  params: ReorderForecastParams
): Promise<ReorderForecast> {
  const searchParams = new URLSearchParams();
  searchParams.append("variant_id", params.variant_id.toString());
  searchParams.append("store_id", params.store_id.toString());
  if (params.window_days !== undefined) {
    searchParams.append("window_days", params.window_days.toString());
  }

  return apiFetchJSON(`/api/v1/inventory/reorder_forecast?${searchParams.toString()}`);
}

/**
 * Fetch at-risk items (items predicted to stock out within 30 days)
 * Security: Tenant-scoped via API
 */
export async function getAtRiskItems(
  params?: AtRiskItemsParams
): Promise<AtRiskItemsListResponse> {
  const searchParams = new URLSearchParams();

  if (params?.store_id !== undefined && params.store_id !== null) {
    searchParams.append("store_id", params.store_id.toString());
  }
  if (params?.limit !== undefined) {
    searchParams.append("limit", params.limit.toString());
  }
  if (params?.min_confidence !== undefined) {
    searchParams.append("min_confidence", params.min_confidence.toString());
  }

  const queryString = searchParams.toString();
  return apiFetchJSON(
    `/api/v1/inventory/at_risk_items${queryString ? `?${queryString}` : ""}`
  );
}

