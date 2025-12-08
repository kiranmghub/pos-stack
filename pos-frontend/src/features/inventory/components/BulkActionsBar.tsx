// pos-frontend/src/features/inventory/components/BulkActionsBar.tsx
import React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { X, CheckSquare } from "lucide-react";

export interface BulkAction {
  /** Action label */
  label: string;
  /** Action handler */
  onClick: () => void;
  /** Action variant */
  variant?: "default" | "destructive" | "outline" | "secondary";
  /** Disabled state */
  disabled?: boolean;
}

export interface BulkActionsBarProps {
  /** Number of selected items */
  selectedCount: number;
  /** Bulk actions */
  actions: BulkAction[];
  /** Clear selection handler */
  onClearSelection: () => void;
  /** Custom className */
  className?: string;
  /** Show select all option */
  showSelectAll?: boolean;
  /** Select all handler */
  onSelectAll?: () => void;
  /** Total items count */
  totalCount?: number;
}

/**
 * BulkActionsBar - Toolbar for bulk actions on selected items
 */
export function BulkActionsBar({
  selectedCount,
  actions,
  onClearSelection,
  className,
  showSelectAll = false,
  onSelectAll,
  totalCount,
}: BulkActionsBarProps) {
  if (selectedCount === 0) {
    return null;
  }

  const allSelected = totalCount !== undefined && selectedCount === totalCount;

  return (
    <div
      className={cn(
        "sticky top-0 z-10 flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3 shadow-sm",
        className
      )}
    >
      {/* Selection Info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-foreground">
          <CheckSquare className="h-4 w-4 text-primary" />
          <span className="font-medium">
            {selectedCount} {selectedCount === 1 ? "item" : "items"} selected
          </span>
        </div>
        {showSelectAll && onSelectAll && totalCount && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSelectAll}
            className="h-7 text-xs"
          >
            {allSelected ? "Deselect All" : "Select All"}
          </Button>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {actions.map((action, index) => (
          <Button
            key={index}
            variant={action.variant || "default"}
            size="sm"
            onClick={action.onClick}
            disabled={action.disabled}
          >
            {action.label}
          </Button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          className="gap-2"
        >
          <X className="h-4 w-4" />
          Clear
        </Button>
      </div>
    </div>
  );
}

