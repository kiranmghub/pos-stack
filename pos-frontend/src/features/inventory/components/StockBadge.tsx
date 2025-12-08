// pos-frontend/src/features/inventory/components/StockBadge.tsx
import React from "react";
import { cn } from "@/lib/utils";

export interface StockBadgeProps {
  /** Current stock quantity */
  quantity: number;
  /** Reorder point threshold (optional) */
  reorderPoint?: number | null;
  /** Low stock threshold (optional, defaults to reorderPoint or 5) */
  lowStockThreshold?: number | null;
  /** Custom className */
  className?: string;
  /** Show quantity text */
  showQuantity?: boolean;
}

/**
 * StockBadge - Displays stock level with color-coded badge
 * 
 * Color coding:
 * - Red (error): Out of stock (quantity === 0)
 * - Yellow (warning): Low stock (quantity > 0 && quantity <= lowStockThreshold)
 * - Green (success): In stock (quantity > lowStockThreshold)
 */
export function StockBadge({
  quantity,
  reorderPoint,
  lowStockThreshold,
  className,
  showQuantity = true,
}: StockBadgeProps) {
  const threshold = lowStockThreshold ?? reorderPoint ?? 5;
  const isOutOfStock = quantity === 0;
  const isLowStock = quantity > 0 && quantity <= threshold;

  const badgeClasses = cn(
    "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
    {
      "bg-badge-error-bg text-badge-error-text ring-error/30": isOutOfStock,
      "bg-badge-warning-bg text-badge-warning-text ring-warning/30": isLowStock,
      "bg-badge-success-bg text-badge-success-text ring-success/30": !isOutOfStock && !isLowStock,
    },
    className
  );

  return (
    <span className={badgeClasses}>
      {showQuantity && <span className="font-semibold">{quantity}</span>}
      {!showQuantity && (
        <>
          {isOutOfStock && "Out of Stock"}
          {isLowStock && "Low Stock"}
          {!isOutOfStock && !isLowStock && "In Stock"}
        </>
      )}
    </span>
  );
}

