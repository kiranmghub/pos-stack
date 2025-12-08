// pos-frontend/src/features/inventory/operations/counts/VariancePreview.tsx
import React from "react";
import { VarianceResponse } from "../../api/counts";
import { DataTable, type Column, LoadingSkeleton } from "../../components";
import { AlertCircle, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface VariancePreviewProps {
  /** Variance data */
  variance: VarianceResponse | null;
  /** Loading state */
  loading?: boolean;
}

/**
 * VariancePreview - Displays variance preview before finalization
 * Security: All data is tenant-scoped from the API
 */
export function VariancePreview({ variance, loading = false }: VariancePreviewProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <LoadingSkeleton key={i} variant="card" height={60} />
        ))}
      </div>
    );
  }

  if (!variance) {
    return null;
  }

  const columns: Column<VarianceResponse["lines"][0]>[] = [
    {
      key: "product_name",
      header: "Product",
      width: "1fr",
      cell: (row) => (
        <div>
          <div className="font-medium text-foreground">{row.product_name}</div>
          <div className="text-xs text-muted-foreground">SKU: {row.sku || "N/A"}</div>
        </div>
      ),
    },
    {
      key: "expected_qty",
      header: "Expected",
      width: "6rem",
      align: "center",
      cell: (row) => (
        <div className="text-sm font-medium text-foreground">{row.expected_qty}</div>
      ),
    },
    {
      key: "counted_qty",
      header: "Counted",
      width: "6rem",
      align: "center",
      cell: (row) => (
        <div className="text-sm font-medium text-foreground">{row.counted_qty}</div>
      ),
    },
    {
      key: "variance",
      header: "Variance",
      width: "8rem",
      align: "center",
      cell: (row) => {
        const isPositive = row.variance > 0;
        const isNegative = row.variance < 0;
        const isZero = row.variance === 0;

        return (
          <div className="flex items-center justify-center gap-1">
            {isPositive && <TrendingUp className="h-4 w-4 text-badge-warning-text" />}
            {isNegative && <TrendingDown className="h-4 w-4 text-badge-error-text" />}
            {isZero && <Minus className="h-4 w-4 text-muted-foreground" />}
            <span
              className={cn(
                "text-sm font-semibold",
                isPositive && "text-badge-warning-text",
                isNegative && "text-badge-error-text",
                isZero && "text-muted-foreground"
              )}
            >
              {isPositive ? "+" : ""}
              {row.variance}
            </span>
          </div>
        );
      },
    },
    {
      key: "location",
      header: "Location",
      width: "8rem",
      cell: (row) => (
        <div className="text-xs text-muted-foreground">{row.location || "—"}</div>
      ),
    },
  ];

  const { summary } = variance;
  const hasVariances = summary.lines_with_variance > 0;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertCircle className="h-5 w-5 text-muted-foreground" />
          <h4 className="font-semibold text-foreground">Variance Summary</h4>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-muted-foreground">Total Items</div>
            <div className="text-lg font-semibold text-foreground">{summary.total_lines}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">With Variance</div>
            <div
              className={cn(
                "text-lg font-semibold",
                hasVariances ? "text-badge-warning-text" : "text-foreground"
              )}
            >
              {summary.lines_with_variance}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Total Expected</div>
            <div className="text-lg font-semibold text-foreground">{summary.total_expected}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Total Counted</div>
            <div className="text-lg font-semibold text-foreground">{summary.total_counted}</div>
          </div>
        </div>
        {summary.total_variance !== 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Net Variance</span>
              <span
                className={cn(
                  "text-lg font-semibold",
                  summary.total_variance > 0 ? "text-badge-warning-text" : "text-badge-error-text"
                )}
              >
                {summary.total_variance > 0 ? "+" : ""}
                {summary.total_variance}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Variance Table */}
      {variance.lines.length > 0 ? (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <DataTable
            data={variance.lines}
            columns={columns}
            emptyMessage="No variance data"
          />
        </div>
      ) : (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No items in this count session
        </div>
      )}
    </div>
  );
}

