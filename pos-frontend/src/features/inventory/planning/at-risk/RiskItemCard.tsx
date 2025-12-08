// pos-frontend/src/features/inventory/planning/at-risk/RiskItemCard.tsx
import React from "react";
import { AtRiskItem } from "../../api/forecasting";
import { StockBadge } from "../../components/StockBadge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertTriangle, Calendar, Package, ShoppingCart, ExternalLink } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

export interface RiskItemCardProps {
  /** At-risk item forecast data */
  item: AtRiskItem;
  /** Whether this card is selected */
  selected?: boolean;
  /** On click handler */
  onClick?: () => void;
  /** On create PO handler */
  onCreatePO?: () => void;
  /** On view details handler */
  onViewDetails?: () => void;
}

/**
 * RiskItemCard - Action-focused card for at-risk items
 * Security: All data is tenant-scoped from the API
 */
export function RiskItemCard({
  item,
  selected = false,
  onClick,
  onCreatePO,
  onViewDetails,
}: RiskItemCardProps) {
  const isHighRisk = item.days_until_stockout !== null && item.days_until_stockout <= 7;
  const isMediumRisk = item.days_until_stockout !== null && item.days_until_stockout > 7 && item.days_until_stockout <= 14;
  const isLowRisk = item.days_until_stockout !== null && item.days_until_stockout > 14 && item.days_until_stockout <= 30;

  const riskColor = isHighRisk
    ? "border-badge-error-border bg-badge-error-bg/10"
    : isMediumRisk
    ? "border-badge-warning-border bg-badge-warning-bg/10"
    : isLowRisk
    ? "border-badge-warning-border/50 bg-badge-warning-bg/5"
    : "border-border bg-card";

  const riskLabel = isHighRisk
    ? "High Risk"
    : isMediumRisk
    ? "Medium Risk"
    : isLowRisk
    ? "Low Risk"
    : "At Risk";

  const stockoutDateText = item.predicted_stockout_date
    ? formatDistanceToNow(new Date(item.predicted_stockout_date), { addSuffix: true })
    : "No prediction";

  const stockoutDateFormatted = item.predicted_stockout_date
    ? format(new Date(item.predicted_stockout_date), "MMM dd, yyyy")
    : null;

  const primaryVelocity = typeof item.sales_velocity === "object" && "primary" in item.sales_velocity
    ? item.sales_velocity.primary.daily_avg
    : typeof item.sales_velocity === "object" && "daily_avg" in item.sales_velocity
    ? (item.sales_velocity as any).daily_avg
    : 0;

  return (
    <div
      className={cn(
        "rounded-lg border p-4 hover:shadow-md transition-all",
        riskColor,
        selected && "ring-2 ring-primary"
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle
              className={cn(
                "h-5 w-5 flex-shrink-0",
                isHighRisk
                  ? "text-badge-error-text"
                  : isMediumRisk
                  ? "text-badge-warning-text"
                  : "text-badge-warning-text/70"
              )}
            />
            <h4 className="text-base font-semibold text-foreground truncate">
              {item.product_name || "Unknown Product"}
            </h4>
          </div>
          <div className="text-xs text-muted-foreground mb-2">
            SKU: {item.sku || "N/A"} • {item.store_name || `Store ${item.store_id}`}
          </div>
          <div className="flex items-center gap-4">
            <StockBadge
              quantity={item.current_on_hand}
              lowStockThreshold={0}
            />
            <span
              className={cn(
                "text-xs font-medium px-2 py-0.5 rounded",
                isHighRisk
                  ? "bg-badge-error-bg text-badge-error-text"
                  : isMediumRisk
                  ? "bg-badge-warning-bg text-badge-warning-text"
                  : "bg-badge-warning-bg/50 text-badge-warning-text/70"
              )}
            >
              {riskLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Stockout Timeline */}
      <div className="mb-4 p-3 rounded-md bg-background border border-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Stockout Prediction</span>
          </div>
          {item.days_until_stockout !== null && (
            <span
              className={cn(
                "text-lg font-bold",
                isHighRisk
                  ? "text-badge-error-text"
                  : isMediumRisk
                  ? "text-badge-warning-text"
                  : "text-badge-warning-text/70"
              )}
            >
              {item.days_until_stockout} days
            </span>
          )}
        </div>
        {stockoutDateFormatted && (
          <div className="text-xs text-muted-foreground">
            Predicted: {stockoutDateFormatted} ({stockoutDateText})
          </div>
        )}
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <div className="text-xs text-muted-foreground">Current Stock</div>
          <div className="text-sm font-semibold text-foreground">
            {item.current_on_hand}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Sales Velocity</div>
          <div className="text-sm font-semibold text-foreground">
            {primaryVelocity.toFixed(1)}/day
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Recommended Qty</div>
          <div className="text-sm font-semibold text-badge-warning-text">
            {item.recommended_order_qty}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 pt-3 border-t border-border">
        {onCreatePO && (
          <Button
            size="sm"
            variant="default"
            onClick={(e) => {
              e.stopPropagation();
              onCreatePO();
            }}
            className="flex-1"
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            Create PO
          </Button>
        )}
        {onViewDetails && (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails();
            }}
            className="flex-1"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            View Details
          </Button>
        )}
      </div>
    </div>
  );
}

