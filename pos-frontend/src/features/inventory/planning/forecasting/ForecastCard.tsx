// pos-frontend/src/features/inventory/planning/forecasting/ForecastCard.tsx
import React from "react";
import { ReorderForecast } from "../../api/forecasting";
import { StockBadge } from "../../components/StockBadge";
import { cn } from "@/lib/utils";
import { AlertTriangle, Calendar, Package, TrendingUp, TrendingDown } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export interface ForecastCardProps {
  /** Forecast data */
  forecast: ReorderForecast;
  /** Whether this card is selected */
  selected?: boolean;
  /** On click handler */
  onClick?: () => void;
}

/**
 * ForecastCard - Individual forecast card showing stockout predictions
 * Security: All data is tenant-scoped from the API
 */
export function ForecastCard({ forecast, selected = false, onClick }: ForecastCardProps) {
  const isHighRisk = forecast.days_until_stockout !== null && forecast.days_until_stockout <= 7;
  const isMediumRisk = forecast.days_until_stockout !== null && forecast.days_until_stockout <= 14;
  const isLowRisk = forecast.days_until_stockout !== null && forecast.days_until_stockout <= 30;

  const riskColor = isHighRisk
    ? "border-badge-error-border bg-badge-error-bg/10"
    : isMediumRisk
    ? "border-badge-warning-border bg-badge-warning-bg/10"
    : isLowRisk
    ? "border-badge-warning-border/50 bg-badge-warning-bg/5"
    : "border-border bg-card";

  const confidenceColor =
    forecast.confidence_score >= 0.7
      ? "text-badge-success-text"
      : forecast.confidence_score >= 0.4
      ? "text-badge-warning-text"
      : "text-badge-error-text";

  const stockoutDateText = forecast.predicted_stockout_date
    ? formatDistanceToNow(new Date(forecast.predicted_stockout_date), { addSuffix: true })
    : "No prediction available";

  return (
    <div
      className={cn(
        "rounded-lg border p-4 hover:shadow-md transition-all cursor-pointer",
        riskColor,
        selected && "ring-2 ring-primary"
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-foreground truncate">
            {forecast.product_name}
          </h4>
          <div className="text-xs text-muted-foreground mt-0.5">
            SKU: {forecast.sku || "N/A"} • {forecast.store_name || `Store ${forecast.store_id}`}
          </div>
        </div>
        <StockBadge
          quantity={forecast.current_on_hand}
          lowStockThreshold={0}
        />
      </div>

      {/* Stockout Prediction */}
      {forecast.is_at_risk && (
        <div className="mb-3 p-2 rounded-md bg-background border border-border">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle
              className={cn(
                "h-4 w-4",
                isHighRisk
                  ? "text-badge-error-text"
                  : isMediumRisk
                  ? "text-badge-warning-text"
                  : "text-badge-warning-text/70"
              )}
            />
            <span
              className={cn(
                "text-xs font-medium",
                isHighRisk
                  ? "text-badge-error-text"
                  : isMediumRisk
                  ? "text-badge-warning-text"
                  : "text-badge-warning-text/70"
              )}
            >
              {forecast.days_until_stockout !== null
                ? `${forecast.days_until_stockout} days until stockout`
                : "At risk of stockout"}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>{stockoutDateText}</span>
          </div>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <div className="text-xs text-muted-foreground">Sales Velocity</div>
          <div className="text-sm font-semibold text-foreground flex items-center gap-1">
            {typeof forecast.sales_velocity === "object" && "primary" in forecast.sales_velocity
              ? forecast.sales_velocity.primary.daily_avg.toFixed(2)
              : typeof forecast.sales_velocity === "object" && "daily_avg" in forecast.sales_velocity
              ? (forecast.sales_velocity as any).daily_avg.toFixed(2)
              : "0.00"}
            <span className="text-xs text-muted-foreground">units/day</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Recommended Qty</div>
          <div className="text-sm font-semibold text-badge-warning-text">
            {forecast.recommended_order_qty}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Confidence</div>
          <div className={cn("text-sm font-semibold", confidenceColor)}>
            {(forecast.confidence_score * 100).toFixed(0)}%
          </div>
        </div>
        {forecast.vendor_lead_time_days && (
          <div>
            <div className="text-xs text-muted-foreground">Lead Time</div>
            <div className="text-sm font-medium text-foreground">
              {forecast.vendor_lead_time_days} days
            </div>
          </div>
        )}
      </div>

      {/* Confidence Bar */}
      <div className="mt-3 pt-3 border-t border-border">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">Forecast Confidence</span>
          <span className={cn("text-xs font-medium", confidenceColor)}>
            {(forecast.confidence_score * 100).toFixed(0)}%
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full transition-all",
              forecast.confidence_score >= 0.7
                ? "bg-badge-success-bg"
                : forecast.confidence_score >= 0.4
                ? "bg-badge-warning-bg"
                : "bg-badge-error-bg"
            )}
            style={{ width: `${forecast.confidence_score * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

