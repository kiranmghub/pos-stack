// pos-frontend/src/features/inventory/components/StoreFilter.tsx
import React from "react";
import { cn } from "@/lib/utils";
import { Store } from "lucide-react";

export interface StoreOption {
  id: number;
  name: string;
  code?: string;
}

export interface StoreFilterProps {
  /** Available stores */
  stores: StoreOption[];
  /** Selected store ID (undefined/null = "All Stores") */
  selectedStoreId?: number | null;
  /** Store change handler */
  onStoreChange: (storeId: number | null) => void;
  /** Show "All Stores" option */
  showAllStores?: boolean;
  /** Required (no "All Stores" option) */
  required?: boolean;
  /** Custom className */
  className?: string;
  /** Label text */
  label?: string;
}

/**
 * StoreFilter - Store selector dropdown component
 * Supports both optional (with "All Stores") and required (no "All Stores") modes
 */
export function StoreFilter({
  stores,
  selectedStoreId,
  onStoreChange,
  showAllStores = true,
  required = false,
  className,
  label = "Store",
}: StoreFilterProps) {
  const effectiveShowAllStores = showAllStores && !required;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <label className="flex items-center gap-1.5 text-sm text-muted-foreground whitespace-nowrap">
        <Store className="h-4 w-4" />
        <span>{label}:</span>
      </label>
      <select
        value={selectedStoreId || ""}
        onChange={(e) => {
          const value = e.target.value;
          if (value === "" || value === "all") {
            onStoreChange(null);
          } else {
            onStoreChange(Number(value));
          }
        }}
        required={required}
        className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        {effectiveShowAllStores && (
          <option value="all">All Stores</option>
        )}
        {stores.map((store) => (
          <option key={store.id} value={store.id}>
            {store.name} {store.code ? `(${store.code})` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

