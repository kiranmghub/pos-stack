// pos-frontend/src/features/inventory/components/KpiCard.tsx
import React from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export interface KpiCardProps {
  /** KPI title */
  title: string;
  /** KPI value (formatted string or number) */
  value: string | number;
  /** Optional subtitle */
  subtitle?: string;
  /** Trend percentage (positive = up, negative = down, undefined = no trend) */
  trend?: number;
  /** Optional icon */
  icon?: React.ReactNode;
  /** Optional accent gradient */
  accent?: string;
  /** Custom className */
  className?: string;
  /** Click handler */
  onClick?: () => void;
}

/**
 * KpiCard - Displays a KPI metric with optional trend indicator
 * 
 * Based on StatCard from MetricsPage but adapted for inventory use
 */
export function KpiCard({
  title,
  value,
  subtitle,
  trend,
  icon,
  accent = "from-indigo-500 to-sky-500",
  className,
  onClick,
}: KpiCardProps) {
  const trendColor =
    trend === undefined
      ? "text-muted-foreground"
      : trend > 0
        ? "text-success"
        : trend < 0
          ? "text-error"
          : "text-muted-foreground";

  const trendSign =
    trend === undefined ? "" : trend > 0 ? "▲" : trend < 0 ? "▼" : "■";

  const trendText =
    trend === undefined
      ? ""
      : `${trendSign} ${Math.abs(trend).toFixed(1)}% vs prev`;

  const TrendIcon =
    trend === undefined
      ? Minus
      : trend > 0
        ? TrendingUp
        : trend < 0
          ? TrendingDown
          : Minus;

  const formatValue = (val: string | number): string => {
    if (typeof val === "number") {
      // Format large numbers with commas
      if (val >= 1000) {
        return val.toLocaleString();
      }
      return val.toString();
    }
    return val;
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-card p-4 transition-shadow",
        onClick && "cursor-pointer hover:shadow-md",
        className
      )}
      onClick={onClick}
    >
      {/* Gradient accent */}
      <div
        className={`pointer-events-none absolute inset-x-0 -top-20 h-32 bg-gradient-to-b ${accent} opacity-20 blur-2xl`}
      />

      <div className="relative flex items-center gap-3">
        {/* Icon */}
        {icon && (
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-card ring-1 ring-border/20 text-foreground">
            {icon}
          </div>
        )}

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="text-sm text-muted-foreground">{title}</div>
          <div className="text-xl font-semibold text-foreground">
            {formatValue(value)}
          </div>
          {subtitle && (
            <div className="text-xs text-muted-foreground">{subtitle}</div>
          )}
          {trend !== undefined && (
            <div className={cn("text-[11px] flex items-center gap-1", trendColor)}>
              <TrendIcon className="h-3 w-3" />
              {trendText}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

