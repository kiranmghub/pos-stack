// pos-frontend/src/features/inventory/planning/reorder/SuggestionCard.tsx
import React from "react";
import { ReorderSuggestion } from "../../api/reorderSuggestions";
import { StockBadge } from "../../components/StockBadge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Package, AlertTriangle } from "lucide-react";

export interface SuggestionCardProps {
  /** Reorder suggestion data */
  suggestion: ReorderSuggestion;
  /** Whether this suggestion is selected */
  selected?: boolean;
  /** On selection change handler */
  onSelectChange?: (selected: boolean) => void;
  /** On click handler */
  onClick?: () => void;
}

/**
 * SuggestionCard - Individual reorder suggestion card
 * Security: All data is tenant-scoped from the API
 */
export function SuggestionCard({
  suggestion,
  selected = false,
  onSelectChange,
  onClick,
}: SuggestionCardProps) {
  const stockLevel = suggestion.on_hand <= 0 ? "out" : 
                     suggestion.on_hand <= suggestion.threshold ? "low" : "in";

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-4 hover:bg-accent/50 transition-colors cursor-pointer",
        selected && "ring-2 ring-primary"
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        {onSelectChange && (
          <div
            className="pt-1"
            onClick={(e) => {
              e.stopPropagation();
              onSelectChange(!selected);
            }}
          >
            <Checkbox
              checked={selected}
              onCheckedChange={onSelectChange}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-foreground truncate">
                {suggestion.product_name}
              </h4>
              <div className="text-xs text-muted-foreground mt-0.5">
                SKU: {suggestion.sku || "N/A"}
              </div>
            </div>
            <StockBadge
              quantity={suggestion.on_hand}
              lowStockThreshold={suggestion.threshold || 0}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <div className="text-xs text-muted-foreground">Store</div>
              <div className="text-sm font-medium text-foreground">
                {suggestion.store_name}
              </div>
              <div className="text-xs text-muted-foreground">
                {suggestion.store_code}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Current Stock</div>
              <div className="text-sm font-semibold text-foreground">
                {suggestion.on_hand}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Reorder Point</div>
              <div className="text-sm font-medium text-foreground">
                {suggestion.threshold}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Suggested Qty</div>
              <div className="text-sm font-semibold text-badge-warning-text">
                {suggestion.suggested_qty}
              </div>
            </div>
          </div>

          {suggestion.on_hand <= suggestion.threshold && (
            <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 text-xs text-badge-warning-text">
              <AlertTriangle className="h-4 w-4" />
              <span>Stock is at or below reorder point</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

