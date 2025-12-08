// pos-frontend/src/features/inventory/components/index.ts
// Export all inventory components

export { StockBadge } from "./StockBadge";
export type { StockBadgeProps } from "./StockBadge";

export { StatusBadge } from "./StatusBadge";
export type { StatusBadgeProps, StatusVariant } from "./StatusBadge";

export { KpiCard } from "./KpiCard";
export type { KpiCardProps } from "./KpiCard";

export { LoadingSkeleton, LoadingSkeletonTable } from "./LoadingSkeleton";
export type { LoadingSkeletonProps } from "./LoadingSkeleton";

export { EmptyState } from "./EmptyState";
export type { EmptyStateProps } from "./EmptyState";

export { ErrorBoundary } from "./ErrorBoundary";

export { ChartCard } from "./ChartCard";
export type { ChartCardProps } from "./ChartCard";

export { FilterBar } from "./FilterBar";
export type { FilterBarProps } from "./FilterBar";

export { BulkActionsBar } from "./BulkActionsBar";
export type { BulkActionsBarProps, BulkAction } from "./BulkActionsBar";

export { DataTable, DataTablePagination } from "./DataTable";
export type {
  DataTableProps,
  Column,
  DataTablePaginationProps,
} from "./DataTable";

export { QuickFilters } from "./QuickFilters";
export type { QuickFiltersProps, QuickFilterType } from "./QuickFilters";

export { StoreFilter } from "./StoreFilter";
export type { StoreFilterProps, StoreOption } from "./StoreFilter";

