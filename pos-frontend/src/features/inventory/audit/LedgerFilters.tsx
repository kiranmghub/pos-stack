// pos-frontend/src/features/inventory/audit/LedgerFilters.tsx
import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { StoreFilter, type StoreOption } from "../components";
import { REF_TYPE_OPTIONS } from "../api/ledger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronUp, X, Calendar, Filter } from "lucide-react";
import { format } from "date-fns";

export interface LedgerFiltersProps {
  /** Available stores */
  stores: StoreOption[];
  /** Selected store ID (null = "All Stores") */
  storeId: number | null;
  /** Store change handler */
  onStoreChange: (storeId: number | null) => void;
  /** Search query */
  searchQuery: string;
  /** Search change handler */
  onSearchChange: (query: string) => void;
  /** Selected ref types */
  selectedRefTypes: string[];
  /** Ref types change handler */
  onRefTypesChange: (types: string[]) => void;
  /** Date from */
  dateFrom: string | null;
  /** Date from change handler */
  onDateFromChange: (date: string | null) => void;
  /** Date to */
  dateTo: string | null;
  /** Date to change handler */
  onDateToChange: (date: string | null) => void;
  /** Variant ID filter */
  variantId: number | null;
  /** Variant ID change handler */
  onVariantIdChange: (id: number | null) => void;
  /** Ref ID filter */
  refId: number | null;
  /** Ref ID change handler */
  onRefIdChange: (id: number | null) => void;
  /** Active filter count */
  activeFilterCount: number;
  /** Clear all filters */
  onClear: () => void;
}

/**
 * LedgerFilters - Advanced filter panel for ledger entries
 * Security: All filters are validated on the backend
 */
export function LedgerFilters({
  stores,
  storeId,
  onStoreChange,
  searchQuery,
  onSearchChange,
  selectedRefTypes,
  onRefTypesChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  variantId,
  onVariantIdChange,
  refId,
  onRefIdChange,
  activeFilterCount,
  onClear,
}: LedgerFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleRefTypeToggle = (type: string) => {
    if (selectedRefTypes.includes(type)) {
      onRefTypesChange(selectedRefTypes.filter((t) => t !== type));
    } else {
      onRefTypesChange([...selectedRefTypes, type]);
    }
  };

  const formatDateForInput = (dateStr: string | null): string => {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      return format(date, "yyyy-MM-dd");
    } catch {
      return dateStr.split("T")[0] || "";
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filters</span>
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">
              {activeFilterCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="h-8 text-xs"
            >
              <X className="h-3 w-3 mr-1" />
              Clear All
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-8"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-4 w-4 mr-1" />
                Collapse
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-1" />
                Expand
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Basic Filters (Always Visible) */}
      <div className="p-4 space-y-4">
        {/* Store Filter */}
        <div>
          <StoreFilter
            stores={stores}
            selectedStoreId={storeId}
            onStoreChange={onStoreChange}
            showAllStores={true}
            required={false}
          />
        </div>

        {/* Search */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Search
          </label>
          <Input
            type="text"
            placeholder="Search by product name, SKU, note, or store..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full"
          />
        </div>

        {/* Advanced Filters (Collapsible) */}
        {isExpanded && (
          <div className="space-y-4 pt-4 border-t border-border">
            {/* Date Range */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  <Calendar className="h-3 w-3 inline mr-1" />
                  Date From
                </label>
                <Input
                  type="date"
                  value={formatDateForInput(dateFrom)}
                  onChange={(e) => {
                    const value = e.target.value;
                    onDateFromChange(value ? `${value}T00:00:00` : null);
                  }}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  <Calendar className="h-3 w-3 inline mr-1" />
                  Date To
                </label>
                <Input
                  type="date"
                  value={formatDateForInput(dateTo)}
                  onChange={(e) => {
                    const value = e.target.value;
                    onDateToChange(value ? `${value}T23:59:59` : null);
                  }}
                  className="w-full"
                />
              </div>
            </div>

            {/* Ref Types */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Reference Types
              </label>
              <div className="flex flex-wrap gap-2">
                {REF_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleRefTypeToggle(option.value)}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                      "border",
                      selectedRefTypes.includes(option.value)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-border hover:bg-muted"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Variant ID and Ref ID */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Variant ID
                </label>
                <Input
                  type="number"
                  placeholder="Filter by variant ID"
                  value={variantId || ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    onVariantIdChange(value ? parseInt(value, 10) : null);
                  }}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Reference ID
                </label>
                <Input
                  type="number"
                  placeholder="Filter by reference ID"
                  value={refId || ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    onRefIdChange(value ? parseInt(value, 10) : null);
                  }}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

