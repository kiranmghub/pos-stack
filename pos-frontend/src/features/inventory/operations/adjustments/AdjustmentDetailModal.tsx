// pos-frontend/src/features/inventory/operations/adjustments/AdjustmentDetailModal.tsx
import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Adjustment } from "../../api/adjustments";
import { format } from "date-fns";
import { TrendingUp, TrendingDown, Minus, Package } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AdjustmentDetailModalProps {
  /** Whether modal is open */
  open: boolean;
  /** On close handler */
  onClose: () => void;
  /** Adjustment to display */
  adjustment: Adjustment | null;
}

/**
 * AdjustmentDetailModal - Modal for viewing adjustment details
 * Security: All data is tenant-scoped from the API
 */
export function AdjustmentDetailModal({
  open,
  onClose,
  adjustment,
}: AdjustmentDetailModalProps) {
  if (!adjustment) return null;

  const totalDelta = adjustment.lines.reduce((sum, line) => sum + line.delta, 0);
  const isPositive = totalDelta > 0;
  const isNegative = totalDelta < 0;
  const isZero = totalDelta === 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adjustment #{adjustment.id}</DialogTitle>
          <DialogDescription>
            View details of this inventory adjustment
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-muted-foreground">Date</div>
                <div className="text-sm font-medium text-foreground">
                  {format(new Date(adjustment.created_at), "MMM d, yyyy h:mm a")}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Reason</div>
                <div className="text-sm font-medium text-foreground">{adjustment.reason.name}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Store ID</div>
                <div className="text-sm font-medium text-foreground">{adjustment.store_id}</div>
              </div>
              {adjustment.created_by && (
                <div>
                  <div className="text-xs text-muted-foreground">Created By</div>
                  <div className="text-sm font-medium text-foreground">{adjustment.created_by}</div>
                </div>
              )}
            </div>
            {adjustment.note && (
              <div>
                <div className="text-xs text-muted-foreground">Note</div>
                <div className="text-sm text-foreground mt-1">{adjustment.note}</div>
              </div>
            )}
            <div className="pt-3 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Total Change</span>
                <div className="flex items-center gap-1">
                  {isPositive && <TrendingUp className="h-4 w-4 text-badge-success-text" />}
                  {isNegative && <TrendingDown className="h-4 w-4 text-badge-error-text" />}
                  {isZero && <Minus className="h-4 w-4 text-muted-foreground" />}
                  <span
                    className={cn(
                      "text-lg font-semibold",
                      isPositive && "text-badge-success-text",
                      isNegative && "text-badge-error-text",
                      isZero && "text-muted-foreground"
                    )}
                  >
                    {isPositive ? "+" : ""}
                    {totalDelta}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">Line Items ({adjustment.lines.length})</div>
            <div className="space-y-2 max-h-96 overflow-y-auto rounded-lg border border-border bg-card p-2">
              {adjustment.lines.map((line, index) => {
                const lineIsPositive = line.delta > 0;
                const lineIsNegative = line.delta < 0;

                return (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-md border border-border bg-background p-3"
                  >
                    <div className="flex-1">
                      <div className="text-sm font-medium text-foreground">{line.product_name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">SKU: {line.sku || "N/A"}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {lineIsPositive && <TrendingUp className="h-4 w-4 text-badge-success-text" />}
                      {lineIsNegative && <TrendingDown className="h-4 w-4 text-badge-error-text" />}
                      <span
                        className={cn(
                          "text-sm font-semibold",
                          lineIsPositive && "text-badge-success-text",
                          lineIsNegative && "text-badge-error-text"
                        )}
                      >
                        {lineIsPositive ? "+" : ""}
                        {line.delta}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

