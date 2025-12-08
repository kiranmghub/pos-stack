// pos-frontend/src/features/inventory/stock/StockDetailDrawer.tsx
import React, { useState } from "react";
import { X, Package, Store, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { StockItem, StockAcrossStoresResponse } from "../api/stock";
import { useStockAcrossStores } from "../hooks/useStock";
import { StockBadge, LoadingSkeleton } from "../components";
import { formatDistanceToNow } from "date-fns";

export interface StockDetailDrawerProps {
  /** Stock item to display */
  item: StockItem | null;
  /** Is drawer open */
  open: boolean;
  /** Close handler */
  onClose: () => void;
  /** Currency info */
  currency?: {
    code: string;
    symbol?: string;
    precision?: number;
  };
}

/**
 * StockDetailDrawer - Side drawer showing detailed stock information
 * Security: All data is tenant-scoped via API
 */
export function StockDetailDrawer({
  item,
  open,
  onClose,
  currency,
}: StockDetailDrawerProps) {
  const {
    data: crossStoreData,
    isLoading: loadingCrossStore,
  } = useStockAcrossStores(item?.id || null);

  if (!open || !item) {
    return null;
  }

  const formatCurrency = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    const symbol = currency?.symbol || currency?.code || "$";
    return `${symbol}${num.toLocaleString(undefined, {
      minimumFractionDigits: currency?.precision || 2,
      maximumFractionDigits: currency?.precision || 2,
    })}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-2xl flex-col border-l border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Stock Details
            </div>
            <div className="mt-1 text-xl font-semibold text-foreground">
              {item.product_name}
            </div>
            {item.sku && (
              <div className="mt-1 text-sm text-muted-foreground">
                SKU: {item.sku}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-4 rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-6">
            {/* Current Store Stock */}
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Package className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold text-foreground">
                  Current Stock
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">On Hand</div>
                  <div className="mt-1 text-2xl font-semibold text-foreground">
                    {item.on_hand}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Status</div>
                  <div className="mt-1">
                    <StockBadge
                      quantity={item.on_hand}
                      reorderPoint={item.reorder_point}
                      lowStockThreshold={item.low_stock_threshold}
                    />
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Reorder Point</div>
                  <div className="mt-1 text-lg font-medium text-foreground">
                    {item.reorder_point ?? item.low_stock_threshold}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Price</div>
                  <div className="mt-1 text-lg font-medium text-foreground">
                    {formatCurrency(item.price)}
                  </div>
                </div>
              </div>
            </div>

            {/* Cross-Store Stock */}
            {loadingCrossStore ? (
              <div className="rounded-lg border border-border bg-card p-4">
                <LoadingSkeleton variant="rectangular" height={200} />
              </div>
            ) : crossStoreData && crossStoreData.stores.length > 0 ? (
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Store className="h-5 w-5 text-muted-foreground" />
                  <h3 className="text-lg font-semibold text-foreground">
                    Stock Across Stores
                  </h3>
                </div>
                <div className="space-y-2">
                  {crossStoreData.stores.map((store) => (
                    <div
                      key={store.store_id}
                      className="flex items-center justify-between rounded-lg border border-border bg-background p-3"
                    >
                      <div>
                        <div className="font-medium text-foreground">
                          {store.store_name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {store.store_code}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <StockBadge
                          quantity={store.on_hand}
                          lowStockThreshold={store.low_stock_threshold}
                        />
                        <span className="text-sm font-medium text-foreground">
                          {store.on_hand} units
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Additional Info */}
            {item.barcode && (
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="text-sm text-muted-foreground">Barcode</div>
                <div className="mt-1 font-mono text-sm text-foreground">
                  {item.barcode}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

