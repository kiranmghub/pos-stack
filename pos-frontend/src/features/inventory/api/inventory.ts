// pos-frontend/src/features/inventory/api/inventory.ts
import { apiFetchJSON } from "@/lib/auth";

export interface InventoryOverview {
  on_hand_value: string;
  summary: {
    total_skus: number;
    total_qty: number;
    total_value: string;
  };
  low_stock_count: number;
  low_stock_threshold_default: number;
  recent: RecentMovement[];
  transfers_in_transit_count: number;
  currency: {
    code: string;
    symbol?: string;
    precision?: number;
  };
}

export interface RecentMovement {
  id: number;
  created_at: string;
  store_id: number;
  variant_id: number;
  product_name: string;
  sku: string | null;
  qty_delta: number;
  ref_type: string;
  ref_id: number | null;
  note: string;
}

export interface AtRiskItem {
  variant_id: number;
  store_id: number;
  product_name: string;
  sku: string | null;
  current_on_hand: number;
  predicted_stockout_date: string | null;
  days_until_stockout: number | null;
  recommended_order_qty: number;
  confidence_score: number;
  is_at_risk: boolean;
  sales_velocity?: number;
}

export interface InventoryOverviewParams {
  store_id?: number;
  category_id?: number;
  search?: string;
}

/**
 * Fetch inventory overview data
 */
export async function getInventoryOverview(
  params?: InventoryOverviewParams
): Promise<InventoryOverview> {
  const searchParams = new URLSearchParams();
  if (params?.store_id) {
    searchParams.append("store_id", params.store_id.toString());
  }
  if (params?.category_id) {
    searchParams.append("category_id", params.category_id.toString());
  }
  if (params?.search) {
    searchParams.append("search", params.search);
  }

  const url = `/api/v1/inventory/overview${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  return apiFetchJSON<InventoryOverview>(url);
}

/**
 * Fetch at-risk items (items predicted to stock out)
 */
export async function getAtRiskItems(params?: {
  limit?: number;
  store_id?: number;
  min_confidence?: number;
}): Promise<{ results: AtRiskItem[]; count: number }> {
  const searchParams = new URLSearchParams();
  if (params?.limit) {
    searchParams.append("limit", params.limit.toString());
  }
  if (params?.store_id) {
    searchParams.append("store_id", params.store_id.toString());
  }
  if (params?.min_confidence !== undefined) {
    searchParams.append("min_confidence", params.min_confidence.toString());
  }

  const url = `/api/v1/inventory/at_risk_items${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  return apiFetchJSON<{ results: AtRiskItem[]; count: number }>(url);
}

