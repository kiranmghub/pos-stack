// pos-frontend/src/features/inventory/components/QuickFilters.tsx
import React from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle, PackageX, DollarSign } from "lucide-react";

export type QuickFilterType = "all" | "low_stock" | "out_of_stock" | "high_value";

export interface QuickFilter {
  id: QuickFilterType;
  label: string;
  icon?: React.ReactNode;
}

export interface QuickFiltersProps {
  /** Active filter */
  activeFilter: QuickFilterType;
  /** Filter change handler */
  onFilterChange: (filter: QuickFilterType) => void;
  /** Custom className */
  className?: string;
}

const filters: QuickFilter[] = [
  { id: "all", label: "All Items" },
  {
    id: "low_stock",
    label: "Low Stock",
    icon: <AlertTriangle className="h-4 w-4" />,
  },
  {
    id: "out_of_stock",
    label: "Out of Stock",
    icon: <PackageX className="h-4 w-4" />,
  },
  {
    id: "high_value",
    label: "High Value",
    icon: <DollarSign className="h-4 w-4" />,
  },
];

/**
 * QuickFilters - Quick filter chips for common stock views
 */
export function QuickFilters({
  activeFilter,
  onFilterChange,
  className,
}: QuickFiltersProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {filters.map((filter) => {
        const isActive = activeFilter === filter.id;
        return (
          <button
            key={filter.id}
            onClick={() => onFilterChange(filter.id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-foreground hover:bg-accent hover:border-accent-foreground/20"
            )}
          >
            {filter.icon && <span className="opacity-70">{filter.icon}</span>}
            {filter.label}
          </button>
        );
      })}
    </div>
  );
}

