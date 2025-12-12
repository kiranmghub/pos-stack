// pos-frontend/src/features/reports/hooks/useReports.ts
import { useQuery, UseQueryResult } from "@tanstack/react-query";
import {
  fetchSalesSummaryReport,
  fetchSalesDetailReport,
  fetchProductPerformanceReport,
  fetchFinancialSummaryReport,
  fetchCustomerAnalyticsReport,
  fetchEmployeePerformanceReport,
  fetchReturnsAnalysisReport,
  type SalesSummaryReport,
  type SalesDetailReport,
  type ProductPerformanceReport,
  type FinancialSummaryReport,
  type CustomerAnalyticsReport,
  type EmployeePerformanceReport,
  type ReturnsAnalysisReport,
  type ReportBaseParams,
} from "../api/reports";

/**
 * React Query hook for fetching sales summary report
 */
export function useSalesSummaryReport(
  params: ReportBaseParams & { group_by?: "day" | "week" | "month" },
  enabled: boolean = true
): UseQueryResult<SalesSummaryReport, Error> {
  return useQuery({
    queryKey: ["reports", "sales", "summary", params],
    queryFn: () => fetchSalesSummaryReport(params),
    enabled: enabled && !!(params.date_from && params.date_to),
    staleTime: 30000, // 30 seconds
    gcTime: 300000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

/**
 * React Query hook for fetching sales detail report (paginated)
 */
export function useSalesDetailReport(
  params: ReportBaseParams & {
    status?: string;
    page?: number;
    page_size?: number;
  },
  enabled: boolean = true
): UseQueryResult<SalesDetailReport, Error> {
  return useQuery({
    queryKey: ["reports", "sales", "detail", params],
    queryFn: () => fetchSalesDetailReport(params),
    enabled: enabled && !!(params.date_from && params.date_to),
    staleTime: 30000, // 30 seconds
    gcTime: 300000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

/**
 * React Query hook for fetching product performance report
 */
export function useProductPerformanceReport(
  params: ReportBaseParams & {
    limit?: number;
    sort_by?: "revenue" | "quantity";
  },
  enabled: boolean = true
): UseQueryResult<ProductPerformanceReport, Error> {
  return useQuery({
    queryKey: ["reports", "products", "performance", params],
    queryFn: () => fetchProductPerformanceReport(params),
    enabled: enabled,
    staleTime: 30000, // 30 seconds
    gcTime: 300000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

/**
 * React Query hook for fetching financial summary report
 */
export function useFinancialSummaryReport(
  params: ReportBaseParams,
  enabled: boolean = true
): UseQueryResult<FinancialSummaryReport, Error> {
  return useQuery({
    queryKey: ["reports", "financial", "summary", params],
    queryFn: () => fetchFinancialSummaryReport(params),
    enabled: enabled,
    staleTime: 30000, // 30 seconds
    gcTime: 300000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

/**
 * React Query hook for fetching customer analytics report
 */
export function useCustomerAnalyticsReport(
  params: ReportBaseParams & { limit?: number },
  enabled: boolean = true
): UseQueryResult<CustomerAnalyticsReport, Error> {
  return useQuery({
    queryKey: ["reports", "customers", "analytics", params],
    queryFn: () => fetchCustomerAnalyticsReport(params),
    enabled: enabled,
    staleTime: 30000, // 30 seconds
    gcTime: 300000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

/**
 * React Query hook for fetching employee performance report
 */
export function useEmployeePerformanceReport(
  params: ReportBaseParams & { limit?: number },
  enabled: boolean = true
): UseQueryResult<EmployeePerformanceReport, Error> {
  return useQuery({
    queryKey: ["reports", "employees", "performance", params],
    queryFn: () => fetchEmployeePerformanceReport(params),
    enabled: enabled && !!(params.date_from && params.date_to),
    staleTime: 30000, // 30 seconds
    gcTime: 300000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

/**
 * React Query hook for fetching returns analysis report
 */
export function useReturnsAnalysisReport(
  params: ReportBaseParams,
  enabled: boolean = true
): UseQueryResult<ReturnsAnalysisReport, Error> {
  return useQuery({
    queryKey: ["reports", "returns", "analysis", params],
    queryFn: () => fetchReturnsAnalysisReport(params),
    enabled: enabled && !!(params.date_from && params.date_to),
    staleTime: 30000, // 30 seconds
    gcTime: 300000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

