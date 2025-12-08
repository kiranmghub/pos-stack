// pos-frontend/src/features/inventory/stock/CrossStoreView.tsx
import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetchJSON } from "@/lib/auth";
import { useStockAcrossStores } from "../hooks/useStock";
import { StockBadge, LoadingSkeleton, EmptyState } from "../components";
import { StockAcrossStoresResponse } from "../api/stock";
import { Search, Store, Package, BarChart3 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";

export interface CrossStoreViewProps {
  /** Whether modal is open */
  open: boolean;
  /** On close handler */
  onClose: () => void;
  /** Optional initial variant ID to load */
  initialVariantId?: number | null;
}

interface VariantSearchResult {
  id: number;
  sku: string | null;
  product_name: string;
  name?: string;
}

// Color palette for charts (theme-aware)
const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

// Fallback colors if CSS variables not available
const FALLBACK_COLORS = [
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // purple
  "#06b6d4", // cyan
];

/**
 * CrossStoreView - Modal for viewing stock distribution across stores for a variant
 * Security: All data is tenant-scoped via API
 */
export function CrossStoreView({
  open,
  onClose,
  initialVariantId = null,
}: CrossStoreViewProps) {
  const [variantSearch, setVariantSearch] = useState("");
  const [searchResults, setSearchResults] = useState<VariantSearchResult[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(initialVariantId);
  const [searchLoading, setSearchLoading] = useState(false);
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);

  // Fetch cross-store stock data for selected variant
  const {
    data: crossStoreData,
    isLoading: stockLoading,
    error: stockError,
  } = useStockAcrossStores(selectedVariantId);

  // Initialize with provided variant ID
  useEffect(() => {
    if (initialVariantId && open) {
      setSelectedVariantId(initialVariantId);
    }
  }, [initialVariantId, open]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setVariantSearch("");
      setSearchResults([]);
      setSelectedVariantId(null);
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    }
  }, [open]);

  // Debounced variant search
  useEffect(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    if (!variantSearch || variantSearch.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const response = await apiFetchJSON<{ results: VariantSearchResult[] }>(
          `/api/v1/catalog/variants?q=${encodeURIComponent(variantSearch)}&limit=20`
        );
        const results = Array.isArray(response) ? response : response.results || [];
        setSearchResults(results);
      } catch (error) {
        console.error("Failed to search variants:", error);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    setDebounceTimer(timer);

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [variantSearch]);

  const handleVariantSelect = (variant: VariantSearchResult) => {
    setSelectedVariantId(variant.id);
    setVariantSearch(variant.product_name || variant.name || variant.sku || "");
    setSearchResults([]);
  };

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!crossStoreData?.stores) return [];

    return crossStoreData.stores
      .map((store) => ({
        store: store.store_name,
        storeCode: store.store_code,
        onHand: store.on_hand,
        threshold: store.low_stock_threshold,
        lowStock: store.low_stock,
      }))
      .sort((a, b) => b.onHand - a.onHand); // Sort by quantity descending
  }, [crossStoreData]);

  // Calculate summary statistics
  const summary = useMemo(() => {
    if (!crossStoreData?.stores) {
      return { total: 0, average: 0, stores: 0, lowStockCount: 0 };
    }

    const stores = crossStoreData.stores;
    const total = stores.reduce((sum, store) => sum + store.on_hand, 0);
    const average = stores.length > 0 ? total / stores.length : 0;
    const lowStockCount = stores.filter((store) => store.low_stock).length;

    return {
      total,
      average: Math.round(average * 100) / 100,
      stores: stores.length,
      lowStockCount,
    };
  }, [crossStoreData]);

  // Custom tooltip for bar chart
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
          <p className="text-sm font-medium text-foreground mb-2">{label}</p>
          <p className="text-sm text-muted-foreground">Code: {data.storeCode}</p>
          <p className="text-sm font-semibold text-foreground">
            Stock: {data.onHand} units
          </p>
          <p className="text-sm text-muted-foreground">
            Threshold: {data.threshold}
          </p>
          {data.lowStock && (
            <p className="text-xs text-badge-warning-text mt-1">Low Stock</p>
          )}
        </div>
      );
    }
    return null;
  };

  // Get color for bar based on stock level
  const getBarColor = (onHand: number, threshold: number, lowStock: boolean) => {
    if (onHand === 0) {
      return "hsl(var(--destructive))" || "#ef4444";
    }
    if (lowStock) {
      return "hsl(var(--chart-3))" || "#f59e0b";
    }
    return "hsl(var(--chart-1))" || "#10b981";
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cross-Store Stock View</DialogTitle>
          <DialogDescription>
            View stock distribution across all stores for a specific product variant
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Variant Search */}
          <div className="space-y-2">
            <Label htmlFor="variant-search">Search Product Variant</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="variant-search"
                type="text"
                placeholder="Search by product name, SKU, or barcode..."
                value={variantSearch}
                onChange={(e) => setVariantSearch(e.target.value)}
                className="pl-10"
              />
              {searchLoading && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              )}
            </div>

            {/* Search Results Dropdown */}
            {searchResults.length > 0 && (
              <div className="relative z-50 mt-1 w-full rounded-lg border border-border bg-card shadow-lg max-h-60 overflow-y-auto">
                {searchResults.map((variant) => (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => handleVariantSelect(variant)}
                    className="w-full text-left px-4 py-2 hover:bg-accent transition-colors border-b border-border last:border-b-0"
                  >
                    <div className="font-medium text-foreground">
                      {variant.product_name || variant.name}
                    </div>
                    {variant.sku && (
                      <div className="text-xs text-muted-foreground">SKU: {variant.sku}</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected Variant Info */}
          {crossStoreData && (
            <div className="rounded-lg border border-border bg-muted/50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Package className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold text-foreground">
                  {crossStoreData.variant_name}
                </h3>
              </div>
              {crossStoreData.variant_sku && (
                <div className="text-sm text-muted-foreground">
                  SKU: {crossStoreData.variant_sku}
                </div>
              )}
            </div>
          )}

          {/* Summary Statistics */}
          {crossStoreData && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="text-sm text-muted-foreground">Total Stock</div>
                <div className="text-2xl font-semibold text-foreground mt-1">
                  {summary.total}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="text-sm text-muted-foreground">Average per Store</div>
                <div className="text-2xl font-semibold text-foreground mt-1">
                  {summary.average}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="text-sm text-muted-foreground">Stores</div>
                <div className="text-2xl font-semibold text-foreground mt-1">
                  {summary.stores}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="text-sm text-muted-foreground">Low Stock Stores</div>
                <div className="text-2xl font-semibold text-badge-warning-text mt-1">
                  {summary.lowStockCount}
                </div>
              </div>
            </div>
          )}

          {/* Loading State */}
          {stockLoading && (
            <div className="space-y-4">
              <LoadingSkeleton variant="rectangular" height={300} />
              <LoadingSkeleton variant="rectangular" height={200} />
            </div>
          )}

          {/* Error State */}
          {stockError && (
            <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
              <p className="text-sm text-destructive">
                Failed to load cross-store stock data. Please try again.
              </p>
            </div>
          )}

          {/* Chart View */}
          {crossStoreData && chartData.length > 0 && !stockLoading && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold text-foreground">Stock Distribution</h3>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis
                      dataKey="store"
                      stroke="hsl(var(--muted-foreground))"
                      style={{ fontSize: "12px" }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      style={{ fontSize: "12px" }}
                      label={{ value: "Stock (units)", angle: -90, position: "insideLeft" }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="onHand" name="On Hand Stock">
                      {chartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={getBarColor(entry.onHand, entry.threshold, entry.lowStock)}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Table View */}
          {crossStoreData && crossStoreData.stores.length > 0 && !stockLoading && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Store className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold text-foreground">Store Details</h3>
              </div>
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                          Store
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                          Code
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-foreground">
                          On Hand
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-foreground">
                          Threshold
                        </th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-foreground">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {crossStoreData.stores
                        .sort((a, b) => b.on_hand - a.on_hand)
                        .map((store) => (
                          <tr
                            key={store.store_id}
                            className="hover:bg-accent/50 transition-colors"
                          >
                            <td className="px-4 py-3 text-sm font-medium text-foreground">
                              {store.store_name}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {store.store_code}
                            </td>
                            <td className="px-4 py-3 text-sm font-semibold text-right text-foreground">
                              {store.on_hand}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                              {store.low_stock_threshold}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <StockBadge
                                quantity={store.on_hand}
                                lowStockThreshold={store.low_stock_threshold}
                              />
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!selectedVariantId && !stockLoading && (
            <EmptyState
              icon={<Package className="h-12 w-12" />}
              title="No Variant Selected"
              description="Search and select a product variant to view its stock distribution across stores"
            />
          )}

          {selectedVariantId && !stockLoading && !crossStoreData && (
            <EmptyState
              icon={<Store className="h-12 w-12" />}
              title="No Stock Data"
              description="No stock data found for this variant across stores"
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

