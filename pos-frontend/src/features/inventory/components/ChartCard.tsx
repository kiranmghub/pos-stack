// pos-frontend/src/features/inventory/components/ChartCard.tsx
import React from "react";
import { cn } from "@/lib/utils";

export interface ChartCardProps {
  /** Chart title */
  title: string;
  /** Optional subtitle */
  subtitle?: string;
  /** Chart content */
  children: React.ReactNode;
  /** Custom className */
  className?: string;
  /** Optional actions (buttons, etc.) */
  actions?: React.ReactNode;
  /** Loading state */
  loading?: boolean;
  /** Error state */
  error?: string | null;
}

/**
 * ChartCard - Container for charts with consistent styling
 */
export function ChartCard({
  title,
  subtitle,
  children,
  className,
  actions,
  loading,
  error,
}: ChartCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-6",
        className
      )}
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      {/* Content */}
      <div className="relative">
        {loading && (
          <div className="flex items-center justify-center h-64">
            <div className="text-sm text-muted-foreground">Loading chart...</div>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-64">
            <div className="text-sm text-destructive">{error}</div>
          </div>
        )}
        {!loading && !error && children}
      </div>
    </div>
  );
}

