// pos-frontend/src/features/inventory/hooks/useHealth.ts
import { useQuery } from "@tanstack/react-query";
import {
  getShrinkageReport,
  getAgingReport,
  getCoverageReport,
  getInventoryHealthSummary,
  type ShrinkageReportParams,
  type AgingReportParams,
  type CoverageReportParams,
  type HealthSummaryParams,
} from "../api/health";

/**
 * React Query hook for shrinkage report
 * Security: Tenant-scoped via API
 */
export function useShrinkageReport(params?: ShrinkageReportParams) {
  return useQuery({
    queryKey: ["inventory", "health", "shrinkage", params],
    queryFn: () => getShrinkageReport(params),
    staleTime: 300000, // 5 minutes
  });
}

/**
 * React Query hook for aging report
 * Security: Tenant-scoped via API
 */
export function useAgingReport(params?: AgingReportParams) {
  return useQuery({
    queryKey: ["inventory", "health", "aging", params],
    queryFn: () => getAgingReport(params),
    staleTime: 300000, // 5 minutes
  });
}

/**
 * React Query hook for coverage report
 * Security: Tenant-scoped via API
 */
export function useCoverageReport(params?: CoverageReportParams) {
  return useQuery({
    queryKey: ["inventory", "health", "coverage", params],
    queryFn: () => getCoverageReport(params),
    staleTime: 300000, // 5 minutes
  });
}

/**
 * React Query hook for inventory health summary
 * Security: Tenant-scoped via API
 */
export function useInventoryHealthSummary(params?: HealthSummaryParams) {
  return useQuery({
    queryKey: ["inventory", "health", "summary", params],
    queryFn: () => getInventoryHealthSummary(params),
    staleTime: 300000, // 5 minutes
  });
}

