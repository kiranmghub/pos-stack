// pos-frontend/src/features/inventory/operations/returns/ReturnDisposition.tsx
import React from "react";
import { ReturnItem, ReturnItemDisposition, ReturnItemCondition } from "../../api/returns";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Package, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ReturnDispositionProps {
  /** Return item */
  item: ReturnItem;
  /** Current disposition */
  disposition: ReturnItemDisposition;
  /** Current condition */
  condition: ReturnItemCondition;
  /** Inspection notes */
  notes: string;
  /** On disposition change */
  onDispositionChange: (disposition: ReturnItemDisposition) => void;
  /** On condition change */
  onConditionChange?: (condition: ReturnItemCondition) => void;
  /** On notes change */
  onNotesChange?: (notes: string) => void;
  /** Whether item is already inspected */
  isInspected?: boolean;
}

const DISPOSITION_OPTIONS: Array<{
  value: ReturnItemDisposition;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}> = [
  {
    value: "RESTOCK",
    label: "Restock",
    description: "Item can be restocked and sold again",
    icon: <Package className="h-4 w-4" />,
    color: "text-badge-success-text",
  },
  {
    value: "WASTE",
    label: "Waste",
    description: "Item should be disposed of",
    icon: <Trash2 className="h-4 w-4" />,
    color: "text-badge-error-text",
  },
];

const CONDITION_OPTIONS: Array<{ value: ReturnItemCondition; label: string }> = [
  { value: "RESALEABLE", label: "Resaleable" },
  { value: "DAMAGED", label: "Damaged" },
  { value: "OPEN_BOX", label: "Open Box" },
];

/**
 * ReturnDisposition - Component for setting return item disposition
 * Security: All operations are tenant-scoped via API
 */
export function ReturnDisposition({
  item,
  disposition,
  condition,
  notes,
  onDispositionChange,
  onConditionChange,
  onNotesChange,
  isInspected = false,
}: ReturnDispositionProps) {
  return (
    <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/50">
      {/* Item Info */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="font-medium text-foreground">{item.product_name}</div>
          <div className="text-sm text-muted-foreground">
            {item.variant_name} • SKU: {item.sku}
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            Quantity: {item.qty_returned} • Refund: ${parseFloat(item.refund_total || "0").toFixed(2)}
          </div>
        </div>
        {isInspected && (
          <div className="text-xs px-2 py-1 rounded bg-badge-success-bg text-badge-success-text">
            Inspected
          </div>
        )}
      </div>

      {/* Disposition Selection */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Disposition *</Label>
        <RadioGroup
          value={disposition}
          onValueChange={(value) => onDispositionChange(value as ReturnItemDisposition)}
        >
          {DISPOSITION_OPTIONS.map((option) => (
            <div
              key={option.value}
              className={cn(
                "flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors",
                disposition === option.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-accent/50"
              )}
              onClick={() => onDispositionChange(option.value)}
            >
              <RadioGroupItem value={option.value} id={`${item.id}-${option.value}`} />
              <Label
                htmlFor={`${item.id}-${option.value}`}
                className="flex-1 cursor-pointer space-y-1"
              >
                <div className="flex items-center gap-2">
                  <span className={option.color}>{option.icon}</span>
                  <span className="font-medium text-foreground">{option.label}</span>
                </div>
                <div className="text-xs text-muted-foreground">{option.description}</div>
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      {/* Condition Selection (only for RESTOCK) */}
      {disposition === "RESTOCK" && onConditionChange && (
        <div className="space-y-2">
          <Label htmlFor={`condition-${item.id}`} className="text-sm font-semibold">
            Condition
          </Label>
          <select
            id={`condition-${item.id}`}
            value={condition}
            onChange={(e) => onConditionChange(e.target.value as ReturnItemCondition)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {CONDITION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Inspection Notes */}
      {onNotesChange && (
        <div className="space-y-2">
          <Label htmlFor={`notes-${item.id}`} className="text-sm font-semibold">
            Inspection Notes (Optional)
          </Label>
          <Input
            id={`notes-${item.id}`}
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Add inspection notes..."
            className="text-sm"
          />
        </div>
      )}
    </div>
  );
}

