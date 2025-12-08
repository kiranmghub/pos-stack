// pos-frontend/src/features/inventory/api/health.ts
import { apiFetchJSON } from "@/lib/auth";

export interface ShrinkageByReason {
  code: string;
  name: string;
  quantity: number;
  count: number;
}

export interface ShrinkageReport {
  total_shrinkage: number;
  shrinkage_by_reason: ShrinkageByReason[];
  count_reconciliations: {
    quantity: number;
    count?: number;
  };
  adjustments: {
    quantity: number;
    count?: number;
  };
  period_days: number;
  total_entries?: number;
  confidence?: number;
}

export interface AgingVariant {
  variant_id: number;
  product_name: string;
  variant_name?: string;
  sku: string | null;
  category: string | null;
  on_hand: number;
  value: number;
  days_since_last_sale: number | null;
  last_sale_date?: string | null;
}

export interface AgingByCategory {
  category: string;
  category_name?: string; // Backend may use "category" instead
  variant_count: number;
  total_quantity: number;
  total_value: number;
}

export interface AgingReport {
  aging_variants: AgingVariant[];
  total_aging_value: number;
  total_aging_quantity: number;
  aging_by_category: AgingByCategory[];
  variant_count: number;
  days_no_sales: number;
}

export interface CoverageReport {
  coverage_percentage: number;
  total_variants: number;
  counted_variants: number;
  count_sessions: number;
  period_days: number;
}

export interface InventoryHealthSummary {
  shrinkage: ShrinkageReport;
  aging: AgingReport;
  coverage: CoverageReport;
  calculated_at: string;
}

export interface ShrinkageReportParams {
  store_id?: number | null;
  days_back?: number; // Optional, default: 90
  reason_code?: string | null;
}

export interface AgingReportParams {
  store_id?: number | null;
  days_no_sales?: number; // Optional, default: 90
}

export interface CoverageReportParams {
  store_id?: number | null;
  days_back?: number; // Optional, default: 90
}

export interface HealthSummaryParams {
  store_id?: number | null;
  days_back?: number; // Optional, default: 90
  aging_days?: number; // Optional, default: 90
}

/**
 * Fetch shrinkage report
 * Security: Tenant-scoped via API
 */
export async function getShrinkageReport(
  params?: ShrinkageReportParams
): Promise<ShrinkageReport> {
  const searchParams = new URLSearchParams();

  if (params?.store_id !== undefined && params.store_id !== null) {
    searchParams.append("store_id", params.store_id.toString());
  }
  if (params?.days_back !== undefined) {
    searchParams.append("days_back", params.days_back.toString());
  }
  if (params?.reason_code !== undefined && params.reason_code !== null) {
    searchParams.append("reason_code", params.reason_code);
  }

  const queryString = searchParams.toString();
  return apiFetchJSON(
    `/api/v1/analytics/inventory/shrinkage${queryString ? `?${queryString}` : ""}`
  );
}

/**
 * Fetch aging inventory report
 * Security: Tenant-scoped via API
 */
export async function getAgingReport(params?: AgingReportParams): Promise<AgingReport> {
  const searchParams = new URLSearchParams();

  if (params?.store_id !== undefined && params.store_id !== null) {
    searchParams.append("store_id", params.store_id.toString());
  }
  if (params?.days_no_sales !== undefined) {
    searchParams.append("days_no_sales", params.days_no_sales.toString());
  }

  const queryString = searchParams.toString();
  return apiFetchJSON(
    `/api/v1/analytics/inventory/aging${queryString ? `?${queryString}` : ""}`
  );
}

/**
 * Fetch count coverage report
 * Security: Tenant-scoped via API
 */
export async function getCoverageReport(
  params?: CoverageReportParams
): Promise<CoverageReport> {
  const searchParams = new URLSearchParams();

  if (params?.store_id !== undefined && params.store_id !== null) {
    searchParams.append("store_id", params.store_id.toString());
  }
  if (params?.days_back !== undefined) {
    searchParams.append("days_back", params.days_back.toString());
  }

  const queryString = searchParams.toString();
  return apiFetchJSON(
    `/api/v1/analytics/inventory/coverage${queryString ? `?${queryString}` : ""}`
  );
}

/**
 * Fetch comprehensive inventory health summary
 * Security: Tenant-scoped via API
 */
export async function getInventoryHealthSummary(
  params?: HealthSummaryParams
): Promise<InventoryHealthSummary> {
  const searchParams = new URLSearchParams();

  if (params?.store_id !== undefined && params.store_id !== null) {
    searchParams.append("store_id", params.store_id.toString());
  }
  if (params?.days_back !== undefined) {
    searchParams.append("days_back", params.days_back.toString());
  }
  if (params?.aging_days !== undefined) {
    searchParams.append("aging_days", params.aging_days.toString());
  }

  const queryString = searchParams.toString();
  return apiFetchJSON(
    `/api/v1/analytics/inventory/health${queryString ? `?${queryString}` : ""}`
  );
}

