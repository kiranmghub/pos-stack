// pos-frontend/src/features/inventory/dashboard/QuickActions.tsx
import React from "react";
import { Button } from "@/components/ui/button";
import {
  ArrowRightLeft,
  ClipboardList,
  ShoppingCart,
  Edit,
} from "lucide-react";

export interface QuickActionsProps {
  onCreateTransfer?: () => void;
  onStartCount?: () => void;
  onCreatePO?: () => void;
  onBulkAdjust?: () => void;
}

/**
 * QuickActions - Quick action buttons for common inventory operations
 */
export function QuickActions({
  onCreateTransfer,
  onStartCount,
  onCreatePO,
  onBulkAdjust,
}: QuickActionsProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-lg font-semibold text-foreground mb-4">
        Quick Actions
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Button
          variant="outline"
          className="h-auto flex-col items-start gap-2 p-4"
          onClick={onCreateTransfer}
        >
          <ArrowRightLeft className="h-5 w-5" />
          <div className="text-left">
            <div className="font-medium">Create Transfer</div>
            <div className="text-xs text-muted-foreground">
              Move stock between stores
            </div>
          </div>
        </Button>

        <Button
          variant="outline"
          className="h-auto flex-col items-start gap-2 p-4"
          onClick={onStartCount}
        >
          <ClipboardList className="h-5 w-5" />
          <div className="text-left">
            <div className="font-medium">Start Count</div>
            <div className="text-xs text-muted-foreground">
              Begin cycle count session
            </div>
          </div>
        </Button>

        <Button
          variant="outline"
          className="h-auto flex-col items-start gap-2 p-4"
          onClick={onCreatePO}
        >
          <ShoppingCart className="h-5 w-5" />
          <div className="text-left">
            <div className="font-medium">Create PO</div>
            <div className="text-xs text-muted-foreground">
              New purchase order
            </div>
          </div>
        </Button>

        <Button
          variant="outline"
          className="h-auto flex-col items-start gap-2 p-4"
          onClick={onBulkAdjust}
        >
          <Edit className="h-5 w-5" />
          <div className="text-left">
            <div className="font-medium">Bulk Adjust</div>
            <div className="text-xs text-muted-foreground">
              Adjust multiple items
            </div>
          </div>
        </Button>
      </div>
    </div>
  );
}

