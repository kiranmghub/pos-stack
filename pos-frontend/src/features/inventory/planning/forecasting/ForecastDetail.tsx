// pos-frontend/src/features/inventory/planning/forecasting/ForecastDetail.tsx
import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ReorderForecast } from "../../api/forecasting";
import { SalesVelocityChart } from "./SalesVelocityChart";
import { StockBadge } from "../../components/StockBadge";
import { format } from "date-fns";
import { Calendar, Package, TrendingUp, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ForecastDetailProps {
  /** Whether modal is open */
  open: boolean;
  /** On close handler */
  onClose: () => void;
  /** Forecast data */
  forecast: ReorderForecast | null;
}

/**
 * ForecastDetail - Detailed forecast view modal
 * Security: All data is tenant-scoped from the API
 */
export function ForecastDetail({ open, onClose, forecast }: ForecastDetailProps) {
  if (!forecast) return null;

  const isHighRisk = forecast.days_until_stockout !== null && forecast.days_until_stockout <= 7;
  const isMediumRisk = forecast.days_until_stockout !== null && forecast.days_until_stockout <= 14;

  const confidenceColor =
    forecast.confidence_score >= 0.7
      ? "text-badge-success-text"
      : forecast.confidence_score >= 0.4
      ? "text-badge-warning-text"
      : "text-badge-error-text";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Forecast Details: {forecast.product_name}
          </DialogTitle>
          <DialogDescription>
            {forecast.sku || "N/A"} • {forecast.store_name || `Store ${forecast.store_id}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Current Stock Status */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">Current Stock Status</h3>
              <StockBadge
                quantity={forecast.current_on_hand}
                lowStockThreshold={0}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-muted-foreground">On Hand</div>
                <div className="text-lg font-semibold text-foreground">
                  {forecast.current_on_hand}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Store</div>
                <div className="text-sm font-medium text-foreground">
                  {forecast.store_name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {forecast.store_code}
                </div>
              </div>
              {forecast.vendor_lead_time_days && (
                <div>
                  <div className="text-xs text-muted-foreground">Vendor Lead Time</div>
                  <div className="text-sm font-medium text-foreground">
                    {forecast.vendor_lead_time_days} days
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Stockout Prediction */}
          {forecast.is_at_risk && (
            <div
              className={cn(
                "rounded-lg border p-4",
                isHighRisk
                  ? "border-badge-error-border bg-badge-error-bg/10"
                  : isMediumRisk
                  ? "border-badge-warning-border bg-badge-warning-bg/10"
                  : "border-badge-warning-border/50 bg-badge-warning-bg/5"
              )}
            >
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle
                  className={cn(
                    "h-5 w-5",
                    isHighRisk
                      ? "text-badge-error-text"
                      : isMediumRisk
                      ? "text-badge-warning-text"
                      : "text-badge-warning-text/70"
                  )}
                />
                <h3
                  className={cn(
                    "text-sm font-semibold",
                    isHighRisk
                      ? "text-badge-error-text"
                      : isMediumRisk
                      ? "text-badge-warning-text"
                      : "text-badge-warning-text/70"
                  )}
                >
                  Stockout Prediction
                </h3>
              </div>
              <div className="space-y-2">
                {forecast.days_until_stockout !== null && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Days Until Stockout</span>
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
                      {forecast.days_until_stockout} days
                    </span>
                  </div>
                )}
                {forecast.predicted_stockout_date && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Predicted Date</span>
                    <span className="text-sm font-medium text-foreground flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {format(new Date(forecast.predicted_stockout_date), "MMM dd, yyyy")}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Recommended Order */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-4">Recommended Order</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-muted-foreground">Recommended Quantity</div>
                <div className="text-2xl font-bold text-badge-warning-text">
                  {forecast.recommended_order_qty}
                </div>
                <div className="text-xs text-muted-foreground mt-1">units</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Confidence Score</div>
                <div className={cn("text-2xl font-bold", confidenceColor)}>
                  {(forecast.confidence_score * 100).toFixed(0)}%
                </div>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden mt-2">
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
          </div>

          {/* Sales Velocity Chart */}
          <SalesVelocityChart
            velocity={
              typeof forecast.sales_velocity === "object" && "primary" in forecast.sales_velocity
                ? {
                    daily_avg: forecast.sales_velocity.primary.daily_avg,
                    total_qty: forecast.sales_velocity["30_day"]?.total_qty || 0,
                    days_with_sales: forecast.sales_velocity["30_day"]?.days_with_sales || 0,
                    period_days: forecast.sales_velocity["30_day"]?.period_days || 30,
                    confidence: forecast.sales_velocity.primary.confidence,
                  }
                : typeof forecast.sales_velocity === "object" && "daily_avg" in forecast.sales_velocity
                ? (forecast.sales_velocity as any)
                : {
                    daily_avg: 0,
                    total_qty: 0,
                    days_with_sales: 0,
                    period_days: 30,
                    confidence: 0,
                  }
            }
          />

          {/* Sales Velocity Details */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-4">Sales Velocity Details</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-xs text-muted-foreground">Daily Average</div>
                <div className="text-lg font-semibold text-foreground">
                  {typeof forecast.sales_velocity === "object" && "primary" in forecast.sales_velocity
                    ? forecast.sales_velocity.primary.daily_avg.toFixed(2)
                    : typeof forecast.sales_velocity === "object" && "daily_avg" in forecast.sales_velocity
                    ? (forecast.sales_velocity as any).daily_avg.toFixed(2)
                    : "0.00"}
                </div>
                <div className="text-xs text-muted-foreground">units/day</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total Sold</div>
                <div className="text-lg font-semibold text-foreground">
                  {typeof forecast.sales_velocity === "object" && "30_day" in forecast.sales_velocity
                    ? forecast.sales_velocity["30_day"].total_qty
                    : typeof forecast.sales_velocity === "object" && "total_qty" in forecast.sales_velocity
                    ? (forecast.sales_velocity as any).total_qty
                    : 0}
                </div>
                <div className="text-xs text-muted-foreground">
                  over{" "}
                  {typeof forecast.sales_velocity === "object" && "30_day" in forecast.sales_velocity
                    ? forecast.sales_velocity["30_day"].period_days
                    : typeof forecast.sales_velocity === "object" && "period_days" in forecast.sales_velocity
                    ? (forecast.sales_velocity as any).period_days
                    : 30}{" "}
                  days
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Days with Sales</div>
                <div className="text-lg font-semibold text-foreground">
                  {typeof forecast.sales_velocity === "object" && "30_day" in forecast.sales_velocity
                    ? forecast.sales_velocity["30_day"].days_with_sales
                    : typeof forecast.sales_velocity === "object" && "days_with_sales" in forecast.sales_velocity
                    ? (forecast.sales_velocity as any).days_with_sales
                    : 0}
                </div>
                <div className="text-xs text-muted-foreground">
                  {(
                    ((typeof forecast.sales_velocity === "object" && "30_day" in forecast.sales_velocity
                      ? forecast.sales_velocity["30_day"].days_with_sales
                      : typeof forecast.sales_velocity === "object" && "days_with_sales" in forecast.sales_velocity
                      ? (forecast.sales_velocity as any).days_with_sales
                      : 0) /
                      (typeof forecast.sales_velocity === "object" && "30_day" in forecast.sales_velocity
                        ? forecast.sales_velocity["30_day"].period_days
                        : typeof forecast.sales_velocity === "object" && "period_days" in forecast.sales_velocity
                        ? (forecast.sales_velocity as any).period_days
                        : 30)) *
                    100
                  ).toFixed(0)}
                  % coverage
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Velocity Confidence</div>
                <div className={cn("text-lg font-semibold", confidenceColor)}>
                  {(
                    (typeof forecast.sales_velocity === "object" && "primary" in forecast.sales_velocity
                      ? forecast.sales_velocity.primary.confidence
                      : typeof forecast.sales_velocity === "object" && "confidence" in forecast.sales_velocity
                      ? (forecast.sales_velocity as any).confidence
                      : 0) * 100
                  ).toFixed(0)}
                  %
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

