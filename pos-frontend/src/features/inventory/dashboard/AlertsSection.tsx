// pos-frontend/src/features/inventory/dashboard/AlertsSection.tsx
import React from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { StockBadge } from "../components";
import { AtRiskItem } from "../api/inventory";
import { formatDistanceToNow } from "date-fns";

export interface AlertsSectionProps {
  lowStockCount: number;
  atRiskItems: AtRiskItem[];
  loading?: boolean;
  onViewLowStock?: () => void;
  onViewAtRisk?: () => void;
  onItemClick?: (item: AtRiskItem) => void;
}

/**
 * AlertsSection - Displays low stock and at-risk item alerts
 */
export function AlertsSection({
  lowStockCount,
  atRiskItems,
  loading = false,
  onViewLowStock,
  onViewAtRisk,
  onItemClick,
}: AlertsSectionProps) {
  const topAtRisk = atRiskItems.slice(0, 10);

  return (
    <div className="space-y-4">
      {/* Low Stock Alert */}
      {lowStockCount > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              <h3 className="text-lg font-semibold text-foreground">
                Low Stock Alert
              </h3>
            </div>
            {onViewLowStock && (
              <button
                onClick={onViewLowStock}
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                View All
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="text-sm text-muted-foreground mb-2">
            {lowStockCount} {lowStockCount === 1 ? "item" : "items"} are below
            reorder point
          </p>
        </div>
      )}

      {/* At-Risk Items */}
      {topAtRisk.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-error" />
              <h3 className="text-lg font-semibold text-foreground">
                At-Risk Items
              </h3>
            </div>
            {onViewAtRisk && (
              <button
                onClick={onViewAtRisk}
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                View All
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="space-y-2">
            {topAtRisk.map((item) => (
              <button
                key={`${item.variant_id}-${item.store_id}`}
                onClick={() => onItemClick?.(item)}
                className="w-full text-left p-3 rounded-lg border border-border bg-background hover:bg-accent transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground truncate">
                      {item.product_name}
                    </div>
                    {item.sku && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        SKU: {item.sku}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <div className="text-right">
                      <StockBadge
                        quantity={item.current_on_hand}
                        showQuantity={true}
                      />
                      {item.days_until_stockout !== null && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {item.days_until_stockout <= 0
                            ? "Out of stock"
                            : `Stockout in ${item.days_until_stockout} days`}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && lowStockCount === 0 && topAtRisk.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <AlertTriangle className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">
            No alerts at this time. All items are well-stocked.
          </p>
        </div>
      )}
    </div>
  );
}

