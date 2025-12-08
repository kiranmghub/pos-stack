// pos-frontend/src/features/inventory/components/DataTable.tsx
import React from "react";
import { cn } from "@/lib/utils";
import { LoadingSkeleton, LoadingSkeletonTable } from "./LoadingSkeleton";
import { EmptyState } from "./EmptyState";

export interface Column<T> {
  /** Column header */
  header: string;
  /** Column key/accessor */
  key: string;
  /** Custom cell renderer */
  cell?: (row: T, index: number) => React.ReactNode;
  /** Column alignment */
  align?: "left" | "center" | "right";
  /** Column width (CSS value or grid template) */
  width?: string;
  /** Sortable */
  sortable?: boolean;
  /** Custom header renderer */
  headerCell?: () => React.ReactNode;
}

export interface DataTableProps<T> {
  /** Table columns */
  columns: Column<T>[];
  /** Table data */
  data: T[];
  /** Loading state */
  loading?: boolean;
  /** Empty state message */
  emptyMessage?: string;
  /** Row click handler */
  onRowClick?: (row: T, index: number) => void;
  /** Row key getter */
  getRowKey?: (row: T, index: number) => string | number;
  /** Custom className */
  className?: string;
  /** Show hover effect */
  hoverable?: boolean;
  /** Custom row className */
  getRowClassName?: (row: T, index: number) => string;
  /** Grid template columns (for CSS grid layout) */
  gridTemplateColumns?: string;
}

/**
 * DataTable - Generic data table component with loading and empty states
 * 
 * Uses CSS Grid for flexible column layouts
 */
export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  loading = false,
  emptyMessage = "No data available",
  onRowClick,
  getRowKey = (_, index) => index,
  className,
  hoverable = true,
  getRowClassName,
  gridTemplateColumns,
}: DataTableProps<T>) {
  // Generate grid template if not provided
  const gridCols =
    gridTemplateColumns ||
    columns
      .map((col) => col.width || "minmax(0, 1fr)")
      .join(" ");

  if (loading) {
    return (
      <div className={cn("rounded-xl border border-border", className)}>
        <LoadingSkeletonTable rows={5} columns={columns.length} />
      </div>
    );
  }

  if (!loading && data.length === 0) {
    return (
      <div className={cn("rounded-xl border border-border", className)}>
        <EmptyState title={emptyMessage} variant="empty" />
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-x-auto rounded-xl border border-border", className)}>
      {/* Header */}
      <div
        className="grid gap-3 bg-muted px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground min-w-fit"
        style={{ gridTemplateColumns: gridCols }}
      >
        {columns.map((column) => (
          <div
            key={column.key}
            className={cn(
              "flex items-center",
              column.align === "center" && "justify-center",
              column.align === "right" && "justify-end",
              column.align === "left" && "justify-start"
            )}
          >
            {column.headerCell ? column.headerCell() : column.header}
          </div>
        ))}
      </div>

      {/* Body */}
      <div className="divide-y divide-border">
        {data.map((row, index) => {
          const key = getRowKey(row, index);
          const rowClassName = getRowClassName?.(row, index);

          return (
            <div
              key={key}
              className={cn(
                "grid gap-3 px-3 py-2.5 text-sm transition-colors min-w-fit",
                hoverable && onRowClick && "cursor-pointer hover:bg-accent/50",
                rowClassName
              )}
              style={{ gridTemplateColumns: gridCols }}
              onClick={() => onRowClick?.(row, index)}
            >
              {columns.map((column) => (
                <div
                  key={column.key}
                  className={cn(
                    "flex items-center",
                    column.align === "center" && "justify-center",
                    column.align === "right" && "justify-end",
                    column.align === "left" && "justify-start"
                  )}
                >
                  {column.cell
                    ? column.cell(row, index)
                    : (row[column.key] as React.ReactNode)}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * DataTablePagination - Pagination controls for DataTable
 */
export interface DataTablePaginationProps {
  /** Current page (1-indexed) */
  page: number;
  /** Page size */
  pageSize: number;
  /** Total count */
  count: number;
  /** Last page number */
  lastPage: number;
  /** Page change handler */
  onPageChange: (page: number) => void;
  /** Page size change handler */
  onPageSizeChange: (pageSize: number) => void;
  /** Available page sizes */
  pageSizeOptions?: number[];
  /** Custom className */
  className?: string;
}

export function DataTablePagination({
  page,
  pageSize,
  count,
  lastPage,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  className,
}: DataTablePaginationProps) {
  const start = count === 0 ? 0 : Math.min((page - 1) * pageSize + 1, count);
  const end = Math.min(page * pageSize, count);

  return (
    <div
      className={cn(
        "flex items-center justify-between border-t border-border bg-muted/40 px-3 py-2",
        className
      )}
    >
      <div className="text-xs text-muted-foreground">
        {count === 0
          ? "No results"
          : `Showing ${start}–${end} of ${count}`}
      </div>
      <div className="flex items-center gap-3">
        <label className="text-xs text-muted-foreground">
          Rows:&nbsp;
          <select
            className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
            value={pageSize}
            onChange={(e) => {
              onPageSizeChange(Number(e.target.value));
            }}
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            className="rounded-md px-2 py-1 text-xs text-foreground hover:bg-white/5 disabled:opacity-40"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
          >
            Prev
          </button>
          <div className="min-w-[7rem] text-center text-xs text-muted-foreground">
            Page {page} of {lastPage}
          </div>
          <button
            className="rounded-md px-2 py-1 text-xs text-foreground hover:bg-white/5 disabled:opacity-40"
            onClick={() => onPageChange(Math.min(lastPage, page + 1))}
            disabled={page >= lastPage}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

