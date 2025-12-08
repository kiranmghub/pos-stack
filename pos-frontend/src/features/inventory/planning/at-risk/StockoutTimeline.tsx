// pos-frontend/src/features/inventory/planning/at-risk/StockoutTimeline.tsx
import React, { useMemo } from "react";
import { AtRiskItem } from "../../api/forecasting";
import { format } from "date-fns";
import { Calendar, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StockoutTimelineProps {
  /** At-risk items to display on timeline */
  items: AtRiskItem[];
  /** Number of days to show on timeline (default: 30) */
  days?: number;
  /** Custom className */
  className?: string;
}

/**
 * StockoutTimeline - Visual timeline showing predicted stockout dates
 * Security: All data is tenant-scoped from the API
 */
export function StockoutTimeline({
  items,
  days = 30,
  className,
}: StockoutTimelineProps) {
  const timelineData = useMemo(() => {
    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + days);

    // Group items by predicted stockout date
    const grouped: Record<string, AtRiskItem[]> = {};

    items.forEach((item) => {
      if (!item.predicted_stockout_date) return;

      const stockoutDate = new Date(item.predicted_stockout_date);
      if (stockoutDate > endDate) return;

      const dateKey = format(stockoutDate, "yyyy-MM-dd");
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(item);
    });

    // Convert to array and sort by date
    return Object.entries(grouped)
      .map(([date, items]) => ({
        date: new Date(date),
        items,
        count: items.length,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [items, days]);

  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + days);

  // Create week buckets for visualization
  const weeks = useMemo(() => {
    const weekBuckets: Array<{ start: Date; end: Date; items: AtRiskItem[] }> = [];
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of current week

    for (let i = 0; i < Math.ceil(days / 7); i++) {
      const start = new Date(weekStart);
      start.setDate(start.getDate() + i * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);

      const weekItems = items.filter((item) => {
        if (!item.predicted_stockout_date) return false;
        const stockoutDate = new Date(item.predicted_stockout_date);
        return stockoutDate >= start && stockoutDate <= end;
      });

      weekBuckets.push({ start, end, items: weekItems });
    }

    return weekBuckets;
  }, [items, days, now]);

  if (timelineData.length === 0) {
    return (
      <div className={cn("rounded-lg border border-border bg-card p-6 text-center", className)}>
        <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No stockout predictions in the next {days} days</p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border border-border bg-card p-4", className)}>
      <div className="flex items-center gap-2 mb-4">
        <Calendar className="h-5 w-5 text-foreground" />
        <h3 className="text-sm font-semibold text-foreground">
          Stockout Timeline (Next {days} Days)
        </h3>
      </div>

      {/* Week View */}
      <div className="space-y-3">
        {weeks.map((week, weekIndex) => {
          const highRiskCount = week.items.filter(
            (item) => item.days_until_stockout !== null && item.days_until_stockout <= 7
          ).length;
          const mediumRiskCount = week.items.filter(
            (item) =>
              item.days_until_stockout !== null &&
              item.days_until_stockout > 7 &&
              item.days_until_stockout <= 14
          ).length;
          const lowRiskCount = week.items.filter(
            (item) =>
              item.days_until_stockout !== null &&
              item.days_until_stockout > 14 &&
              item.days_until_stockout <= 30
          ).length;

          if (week.items.length === 0) return null;

          return (
            <div key={weekIndex} className="border-l-2 border-border pl-4 pb-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-xs font-medium text-foreground">
                    {format(week.start, "MMM dd")} - {format(week.end, "MMM dd, yyyy")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {week.items.length} item{week.items.length !== 1 ? "s" : ""} at risk
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {highRiskCount > 0 && (
                    <span className="text-xs font-medium text-badge-error-text bg-badge-error-bg px-2 py-0.5 rounded">
                      {highRiskCount} High
                    </span>
                  )}
                  {mediumRiskCount > 0 && (
                    <span className="text-xs font-medium text-badge-warning-text bg-badge-warning-bg px-2 py-0.5 rounded">
                      {mediumRiskCount} Medium
                    </span>
                  )}
                  {lowRiskCount > 0 && (
                    <span className="text-xs font-medium text-badge-warning-text/70 bg-badge-warning-bg/50 px-2 py-0.5 rounded">
                      {lowRiskCount} Low
                    </span>
                  )}
                </div>
              </div>

              {/* Timeline Bar */}
              <div className="relative h-8 bg-muted rounded-md overflow-hidden">
                {week.items.map((item, itemIndex) => {
                  if (!item.predicted_stockout_date) return null;

                  const stockoutDate = new Date(item.predicted_stockout_date);
                  const daysFromWeekStart = Math.floor(
                    (stockoutDate.getTime() - week.start.getTime()) / (1000 * 60 * 60 * 24)
                  );
                  const position = Math.max(0, Math.min(100, (daysFromWeekStart / 7) * 100));

                  const isHighRisk = item.days_until_stockout !== null && item.days_until_stockout <= 7;
                  const isMediumRisk =
                    item.days_until_stockout !== null &&
                    item.days_until_stockout > 7 &&
                    item.days_until_stockout <= 14;

                  return (
                    <div
                      key={itemIndex}
                      className={cn(
                        "absolute top-0 bottom-0 w-1",
                        isHighRisk
                          ? "bg-badge-error-bg"
                          : isMediumRisk
                          ? "bg-badge-warning-bg"
                          : "bg-badge-warning-bg/50"
                      )}
                      style={{ left: `${position}%` }}
                      title={`${item.product_name} - ${format(stockoutDate, "MMM dd")}`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-4 border-t border-border flex items-center gap-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-badge-error-bg" />
          <span className="text-muted-foreground">High Risk (≤7 days)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-badge-warning-bg" />
          <span className="text-muted-foreground">Medium Risk (8-14 days)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-badge-warning-bg/50" />
          <span className="text-muted-foreground">Low Risk (15-30 days)</span>
        </div>
      </div>
    </div>
  );
}

