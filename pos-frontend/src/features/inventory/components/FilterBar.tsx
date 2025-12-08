// pos-frontend/src/features/inventory/components/FilterBar.tsx
import React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X, Filter } from "lucide-react";

export interface FilterBarProps {
  /** Search query value */
  searchQuery: string;
  /** Search query change handler */
  onSearchChange: (value: string) => void;
  /** Placeholder text for search */
  searchPlaceholder?: string;
  /** Additional filter controls */
  children?: React.ReactNode;
  /** Custom className */
  className?: string;
  /** Show clear button */
  showClear?: boolean;
  /** Clear all filters handler */
  onClear?: () => void;
  /** Active filter count */
  activeFilterCount?: number;
}

/**
 * FilterBar - Reusable filter bar with search and additional filters
 */
export function FilterBar({
  searchQuery,
  onSearchChange,
  searchPlaceholder = "Search...",
  children,
  className,
  showClear = true,
  onClear,
  activeFilterCount = 0,
}: FilterBarProps) {
  const hasActiveFilters = activeFilterCount > 0 || searchQuery.trim().length > 0;

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-lg border border-border bg-card p-4",
        className
      )}
    >
      {/* Search and Actions Row */}
      <div className="flex items-center gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Clear Button */}
        {showClear && hasActiveFilters && onClear && (
          <Button
            variant="outline"
            size="sm"
            onClick={onClear}
            className="gap-2"
          >
            <X className="h-4 w-4" />
            Clear
            {activeFilterCount > 0 && (
              <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs">
                {activeFilterCount}
              </span>
            )}
          </Button>
        )}
      </div>

      {/* Additional Filters */}
      {children && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Filter className="h-4 w-4" />
            <span>Filters:</span>
          </div>
          {children}
        </div>
      )}
    </div>
  );
}

