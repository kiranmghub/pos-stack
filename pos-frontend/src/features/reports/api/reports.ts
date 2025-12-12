// pos-frontend/src/features/reports/api/reports.ts
import { apiFetchJSON, apiFetch } from "@/lib/auth";

const API_BASE = import.meta.env.VITE_API_BASE || "";

/**
 * Base parameters for all report requests
 */
export interface ReportBaseParams {
  store_id?: string | number;
  date_from?: string;
  date_to?: string;
}

/**
 * Currency information type
 */
export interface CurrencyInfo {
  code: string;
  symbol?: string | null;
  precision?: number | null;
}

/**
 * Sales Summary Report response
 */
export interface SalesSummaryReport {
  summary: {
    total_revenue: number;
    order_count: number;
    average_order_value: number;
    revenue_growth_percent: number;
    order_growth_percent: number;
  };
  comparison: {
    previous_period_revenue: number;
    previous_period_orders: number;
    previous_period_aov: number;
  };
  time_series: Array<{
    date: string;
    revenue: number;
    orders: number;
    aov: number;
  }>;
  store_breakdown: Array<{
    store_id: number;
    store_name: string;
    revenue: number;
    orders: number;
  }>;
  period: {
    date_from: string;
    date_to: string;
    group_by: string;
  };
  currency: CurrencyInfo;
}

/**
 * Sales Detail Report response (paginated)
 */
export interface SalesDetailReport {
  results: Array<{
    id: number;
    receipt_no: string;
    created_at: string;
    store_name: string;
    cashier_name: string;
    subtotal: string;
    discount_total: string;
    tax_total: string;
    total: string;
    status: string;
    lines_count: number;
    total_returns: number;
    currency: {
      code: string;
      symbol?: string;
      precision?: number;
    };
    currency_code: string;
  }>;
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  currency: CurrencyInfo;
}

/**
 * Fetch sales summary report
 */
export async function fetchSalesSummaryReport(
  params: ReportBaseParams & { group_by?: "day" | "week" | "month" }
): Promise<SalesSummaryReport> {
  const queryParams = new URLSearchParams();
  if (params.store_id) queryParams.set("store_id", String(params.store_id));
  if (params.date_from) queryParams.set("date_from", params.date_from);
  if (params.date_to) queryParams.set("date_to", params.date_to);
  if (params.group_by) queryParams.set("group_by", params.group_by);

  const url = `/api/v1/analytics/reports/sales/summary${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
  return apiFetchJSON(url);
}

/**
 * Fetch sales detail report (paginated)
 */
export async function fetchSalesDetailReport(
  params: ReportBaseParams & {
    status?: string;
    page?: number;
    page_size?: number;
  }
): Promise<SalesDetailReport> {
  const queryParams = new URLSearchParams();
  if (params.store_id) queryParams.set("store_id", String(params.store_id));
  if (params.date_from) queryParams.set("date_from", params.date_from);
  if (params.date_to) queryParams.set("date_to", params.date_to);
  if (params.status) queryParams.set("status", params.status);
  if (params.page) queryParams.set("page", String(params.page));
  if (params.page_size) queryParams.set("page_size", String(params.page_size));

  const url = `/api/v1/analytics/reports/sales/detail${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
  return apiFetchJSON(url);
}

/**
 * Export report as PDF
 */
export async function exportReportPDF(
  reportType: string,
  params: ReportBaseParams
): Promise<Blob> {
  const response = await apiFetch("/api/v1/analytics/reports/export", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      report_type: reportType,
      format: "pdf",
      params,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Export failed" }));
    throw new Error(error.error || "Failed to export PDF");
  }

  return response.blob();
}

/**
 * Export report as Excel
 */
export async function exportReportExcel(
  reportType: string,
  params: ReportBaseParams
): Promise<Blob> {
  const response = await apiFetch("/api/v1/analytics/reports/export", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      report_type: reportType,
      format: "excel",
      params,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Export failed" }));
    throw new Error(error.error || "Failed to export Excel");
  }

  return response.blob();
}

/**
 * Export report as CSV
 */
export async function exportReportCSV(
  reportType: string,
  params: ReportBaseParams
): Promise<Blob> {
  const response = await apiFetch("/api/v1/analytics/reports/export", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      report_type: reportType,
      format: "csv",
      params,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Export failed" }));
    throw new Error(error.error || "Failed to export CSV");
  }

  return response.blob();
}

/**
 * Product Performance Report response
 */
export interface ProductPerformanceReport {
  top_products_by_revenue: Array<{
    variant_id: number;
    variant_name: string;
    sku: string;
    product_id: number;
    product_name: string;
    product_code: string;
    category: string;
    revenue: number;
    quantity_sold: number;
    transaction_count: number;
    avg_price: number;
    avg_unit_price: number;
  }>;
  top_products_by_quantity: Array<{
    variant_id: number;
    variant_name: string;
    sku: string;
    product_id: number;
    product_name: string;
    product_code: string;
    category: string;
    revenue: number;
    quantity_sold: number;
    transaction_count: number;
    avg_price: number;
    avg_unit_price: number;
  }>;
  summary: {
    total_products: number;
    total_revenue: number;
    total_quantity_sold: number;
  };
  filters: {
    store_id: number | null;
    date_from: string;
    date_to: string;
    limit: number;
    sort_by: string;
  };
  currency: CurrencyInfo;
}

/**
 * Fetch product performance report
 */
export async function fetchProductPerformanceReport(
  params: ReportBaseParams & {
    limit?: number;
    sort_by?: "revenue" | "quantity";
  }
): Promise<ProductPerformanceReport> {
  const queryParams = new URLSearchParams();
  if (params.store_id) queryParams.set("store_id", String(params.store_id));
  if (params.date_from) queryParams.set("date_from", params.date_from);
  if (params.date_to) queryParams.set("date_to", params.date_to);
  if (params.limit) queryParams.set("limit", String(params.limit));
  if (params.sort_by) queryParams.set("sort_by", params.sort_by);

  const url = `/api/v1/analytics/reports/products/performance${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
  return apiFetchJSON(url);
}

/**
 * Financial Summary Report response
 */
export interface FinancialSummaryReport {
  summary: {
    total_revenue: number;
    total_discounts: number;
    total_taxes: number;
    total_fees: number;
    net_revenue: number;
    sale_count: number;
    discount_percentage: number;
    tax_percentage: number;
  };
  payment_methods: Array<{
    method: string;
    total_amount: number;
    payment_count: number;
  }>;
  discount_rules: Array<{
    code: string;
    name: string;
    total_amount: number;
    sales_count: number;
  }>;
  tax_rules: Array<{
    code: string;
    name: string;
    tax_amount: number;
    sales_count: number;
  }>;
  filters: {
    store_id: number | null;
    date_from: string;
    date_to: string;
  };
  currency: CurrencyInfo;
}

/**
 * Fetch financial summary report
 */
export async function fetchFinancialSummaryReport(
  params: ReportBaseParams
): Promise<FinancialSummaryReport> {
  const queryParams = new URLSearchParams();
  if (params.store_id) queryParams.set("store_id", String(params.store_id));
  if (params.date_from) queryParams.set("date_from", params.date_from);
  if (params.date_to) queryParams.set("date_to", params.date_to);

  const url = `/api/v1/analytics/reports/financial/summary${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
  return apiFetchJSON(url);
}

/**
 * Customer Analytics Report response
 */
export interface CustomerAnalyticsReport {
  top_customers: Array<{
    customer_id: number;
    customer_name: string;
    email: string;
    phone: string;
    total_revenue: number;
    sale_count: number;
    avg_order_value: number;
  }>;
  summary: {
    total_customers_in_period: number;
    new_customers: number;
    returning_customers: number;
    repeat_customer_rate: number;
    total_sales_with_customers: number;
    total_sales_without_customers: number;
  };
  lifetime_value_stats: {
    avg_lifetime_value: number;
    avg_visits: number;
  };
  filters: {
    store_id: number | null;
    date_from: string;
    date_to: string;
    limit: number;
  };
  currency: CurrencyInfo;
}

/**
 * Employee Performance Report response
 */
export interface EmployeePerformanceReport {
  top_employees: Array<{
    employee_id: number;
    employee_name: string;
    username: string;
    email: string;
    total_revenue: number;
    transaction_count: number;
    avg_transaction_value: number;
    return_count: number;
    refunded_total: number;
    return_rate: number;
  }>;
  summary: {
    total_employees: number;
    total_transactions: number;
    total_returns: number;
    overall_return_rate: number;
  };
  filters: {
    store_id: number | null;
    date_from: string;
    date_to: string;
    limit: number;
  };
  currency: CurrencyInfo;
}

/**
 * Fetch customer analytics report
 */
export async function fetchCustomerAnalyticsReport(
  params: ReportBaseParams & { limit?: number }
): Promise<CustomerAnalyticsReport> {
  const queryParams = new URLSearchParams();
  if (params.store_id) queryParams.set("store_id", String(params.store_id));
  if (params.date_from) queryParams.set("date_from", params.date_from);
  if (params.date_to) queryParams.set("date_to", params.date_to);
  if (params.limit) queryParams.set("limit", String(params.limit));

  const url = `/api/v1/analytics/reports/customers/analytics${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
  return apiFetchJSON(url);
}

/**
 * Fetch employee performance report
 */
export async function fetchEmployeePerformanceReport(
  params: ReportBaseParams & { limit?: number }
): Promise<EmployeePerformanceReport> {
  const queryParams = new URLSearchParams();
  if (params.store_id) queryParams.set("store_id", String(params.store_id));
  if (params.date_from) queryParams.set("date_from", params.date_from);
  if (params.date_to) queryParams.set("date_to", params.date_to);
  if (params.limit) queryParams.set("limit", String(params.limit));

  const url = `/api/v1/analytics/reports/employees/performance${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
  return apiFetchJSON(url);
}

/**
 * Returns Analysis Report response
 */
export interface ReturnsAnalysisReport {
  summary: {
    total_returns: number;
    total_refunded: number;
    total_sales: number;
    return_rate: number;
  };
  reason_breakdown: Array<{
    reason_code: string;
    return_count: number;
    refunded_amount: number;
  }>;
  disposition_breakdown: Array<{
    disposition: string;
    item_count: number;
    refunded_amount: number;
  }>;
  status_breakdown: Array<{
    status: string;
    return_count: number;
    refunded_amount: number;
  }>;
  filters: {
    store_id?: number | null;
    date_from: string;
    date_to: string;
  };
  currency: CurrencyInfo;
}

/**
 * Fetch returns analysis report
 */
export async function fetchReturnsAnalysisReport(
  params: ReportBaseParams
): Promise<ReturnsAnalysisReport> {
  const queryParams = new URLSearchParams();
  if (params.store_id) queryParams.set("store_id", String(params.store_id));
  if (params.date_from) queryParams.set("date_from", params.date_from);
  if (params.date_to) queryParams.set("date_to", params.date_to);

  const url = `/api/v1/analytics/reports/returns/analysis${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
  return apiFetchJSON<ReturnsAnalysisReport>(url);
}

/**
 * Export report in various formats (PDF, Excel, CSV)
 */
export async function exportReport(params: {
  report_type: "sales" | "products" | "financial" | "customers" | "employees" | "returns";
  format: "pdf" | "excel" | "csv";
  params: ReportBaseParams & {
    limit?: number;
    sort_by?: string;
    group_by?: string;
    status?: string;
    page?: number;
    page_size?: number;
  };
}): Promise<void> {
  const { authHeaders } = await import("@/lib/auth");
  const headers = await authHeaders();

  const response = await fetch(`${API_BASE}/api/v1/analytics/reports/export`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      report_type: params.report_type,
      format: params.format,
      params: params.params,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Export failed (${response.status})`);
  }

  // Extract filename from Content-Disposition
  const disposition = response.headers.get("Content-Disposition") || "";
  const filenameMatch = disposition.match(/filename="?([^"]*)"?/);
  const defaultName = `${params.report_type}_report.${params.format === "excel" ? "xlsx" : params.format}`;
  const filename = filenameMatch?.[1] || defaultName;

  // Download file
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

