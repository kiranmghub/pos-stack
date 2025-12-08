// pos-frontend/src/features/inventory/dashboard/ActivityFeed.tsx
import React from "react";
import { Activity, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { RecentMovement } from "../api/inventory";
import { StatusBadge } from "../components";

export interface ActivityFeedProps {
  movements: RecentMovement[];
  loading?: boolean;
  onMovementClick?: (movement: RecentMovement) => void;
}

const refTypeLabels: Record<string, string> = {
  SALE: "Sale",
  ADJUSTMENT: "Adjustment",
  TRANSFER_OUT: "Transfer Out",
  TRANSFER_IN: "Transfer In",
  COUNT_RECONCILE: "Count",
  PURCHASE_ORDER_RECEIPT: "PO Receipt",
  WASTE: "Waste",
  RESERVATION: "Reservation",
  RESERVATION_COMMIT: "Reservation Commit",
  RESERVATION_RELEASE: "Reservation Release",
};

/**
 * ActivityFeed - Displays recent inventory movements
 */
export function ActivityFeed({
  movements,
  loading = false,
  onMovementClick,
}: ActivityFeedProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-foreground">
            Recent Activity
          </h3>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-16 bg-muted animate-pulse rounded-lg"
            />
          ))}
        </div>
      </div>
    );
  }

  if (movements.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <Activity className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
        <p className="text-sm text-muted-foreground">
          No recent activity to display.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-lg font-semibold text-foreground">
          Recent Activity
        </h3>
      </div>
      <div className="space-y-3">
        {movements.map((movement) => {
          const isPositive = movement.qty_delta > 0;
          const isNegative = movement.qty_delta < 0;
          const DeltaIcon = isPositive
            ? ArrowUp
            : isNegative
              ? ArrowDown
              : Minus;

          return (
            <button
              key={movement.id}
              onClick={() => onMovementClick?.(movement)}
              className="w-full text-left p-3 rounded-lg border border-border bg-background hover:bg-accent transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <DeltaIcon
                      className={`h-4 w-4 ${
                        isPositive
                          ? "text-success"
                          : isNegative
                            ? "text-error"
                            : "text-muted-foreground"
                      }`}
                    />
                    <span className="font-medium text-foreground truncate">
                      {movement.product_name}
                    </span>
                  </div>
                  {movement.sku && (
                    <div className="text-xs text-muted-foreground mb-1">
                      SKU: {movement.sku}
                    </div>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge
                      status={refTypeLabels[movement.ref_type] || movement.ref_type}
                      variant={
                        movement.ref_type.includes("TRANSFER")
                          ? "in_transit"
                          : movement.ref_type === "SALE"
                            ? "completed"
                            : movement.ref_type === "ADJUSTMENT"
                              ? "warning"
                              : "info"
                      }
                      size="sm"
                    />
                    {movement.note && (
                      <span className="text-xs text-muted-foreground truncate">
                        {movement.note}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div
                    className={`text-sm font-semibold ${
                      isPositive
                        ? "text-success"
                        : isNegative
                          ? "text-error"
                          : "text-muted-foreground"
                    }`}
                  >
                    {isPositive ? "+" : ""}
                    {movement.qty_delta}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(movement.created_at), {
                      addSuffix: true,
                    })}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

