// pos-frontend/src/features/inventory/stock/StockListPage.tsx
import React, { useState, useMemo, useEffect } from "react";
import { useStockList } from "../hooks/useStock";
import { DataTable, DataTablePagination, FilterBar, BulkActionsBar, StockBadge, EmptyState, LoadingSkeleton, StoreFilter, type StoreOption } from "../components";
import { QuickFilters, type QuickFilterType } from "../components/QuickFilters";
import { StockDetailDrawer } from "./StockDetailDrawer";
import { BulkAdjustModal } from "./BulkAdjustModal";
import { CrossStoreView } from "./CrossStoreView";
import { StockItem } from "../api/stock";
import { exportStockToCSV } from "../api/stock";
import { Package, Download, Edit, ArrowRightLeft, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Column } from "../components/DataTable";

export interface StockListPageProps {
  /** Available stores */
  stores: StoreOption[];
  /** Store ID (required) */
  storeId?: number;
  /** Store change handler */
  onStoreChange?: (storeId: number) => void;
  /** On item click handler */
  onItemClick?: (item: StockItem) => void;
  /** On create transfer handler */
  onCreateTransfer?: (items: StockItem[]) => void;
}

/**
 * StockListPage - Enhanced stock management page with filtering, bulk operations, and detail view
 * Security: All operations are tenant-scoped via API, validates store ownership
 */
export function StockListPage({
  stores,
  storeId,
  onStoreChange,
  onItemClick,
  onCreateTransfer,
}: StockListPageProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilterType>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [detailItem, setDetailItem] = useState<StockItem | null>(null);
  const [showBulkAdjust, setShowBulkAdjust] = useState(false);
  const [showCrossStoreView, setShowCrossStoreView] = useState(false);
  const [crossStoreVariantId, setCrossStoreVariantId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  // Auto-select first store if none selected
  useEffect(() => {
    if (!storeId && stores.length > 0 && onStoreChange) {
      onStoreChange(stores[0].id);
    }
  }, [storeId, stores, onStoreChange]);

  // Fetch stock data (only if storeId is set)
  const {
    data: stockData,
    isLoading,
    error,
  } = useStockList(
    storeId
      ? {
          store_id: storeId,
          q: searchQuery || undefined,
          category: category || undefined,
          page,
          page_size: pageSize,
        }
      : { store_id: 0, page: 1, page_size: 24 }, // Invalid store_id to prevent API call
    { enabled: !!storeId } // Only fetch if storeId is set
  );

  // Apply quick filters
  const filteredItems = useMemo(() => {
    if (!stockData?.results) return [];
    let items = stockData.results;

    switch (quickFilter) {
      case "low_stock":
        items = items.filter((item) => item.low_stock && item.on_hand > 0);
        break;
      case "out_of_stock":
        items = items.filter((item) => item.on_hand === 0);
        break;
      case "high_value":
        items = items
          .filter((item) => {
            const price = parseFloat(item.price) || 0;
            return price > 100; // Configurable threshold
          })
          .sort((a, b) => {
            const priceA = parseFloat(a.price) || 0;
            const priceB = parseFloat(b.price) || 0;
            return priceB - priceA;
          });
        break;
      default:
        // "all" - no filtering
        break;
    }

    return items;
  }, [stockData?.results, quickFilter]);

  const formatCurrency = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    const symbol = stockData?.currency?.symbol || stockData?.currency?.code || "$";
    return `${symbol}${num.toLocaleString(undefined, {
      minimumFractionDigits: stockData?.currency?.precision || 2,
      maximumFractionDigits: stockData?.currency?.precision || 2,
    })}`;
  };

  const handleSelectItem = (item: StockItem, selected: boolean) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(item.id);
      } else {
        next.delete(item.id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedItems.size === filteredItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredItems.map((item) => item.id)));
    }
  };

  const handleClearSelection = () => {
    setSelectedItems(new Set());
  };

  const handleExport = async () => {
    if (!storeId) return; // Can't export without a store
    
    try {
      setExporting(true);
      const blob = await exportStockToCSV({
        store_id: storeId,
        q: searchQuery || undefined,
        category: category || undefined,
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `stock-export-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Failed to export stock. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const selectedStockItems = useMemo(() => {
    return filteredItems.filter((item) => selectedItems.has(item.id));
  }, [filteredItems, selectedItems]);

  // Define table columns
  const columns: Column<StockItem>[] = [
    {
      key: "select",
      header: "",
      width: "3rem",
      cell: (row) => (
        <input
          type="checkbox"
          checked={selectedItems.has(row.id)}
          onChange={(e) => handleSelectItem(row, e.target.checked)}
          onClick={(e) => e.stopPropagation()}
          className="rounded border-border"
        />
      ),
    },
    {
      key: "product_name",
      header: "Product",
      width: "minmax(200px, 1fr)",
      cell: (row) => (
        <div>
          <div className="font-medium text-foreground">{row.product_name}</div>
          {row.sku && (
            <div className="text-xs text-muted-foreground">SKU: {row.sku}</div>
          )}
        </div>
      ),
    },
    {
      key: "price",
      header: "Price",
      width: "8rem",
      align: "right",
      cell: (row) => (
        <div className="font-medium text-foreground">{formatCurrency(row.price)}</div>
      ),
    },
    {
      key: "on_hand",
      header: "Stock",
      width: "10rem",
      align: "right",
      cell: (row) => (
        <StockBadge
          quantity={row.on_hand}
          reorderPoint={row.reorder_point}
          lowStockThreshold={row.low_stock_threshold}
        />
      ),
    },
    {
      key: "reorder_point",
      header: "Reorder Point",
      width: "8rem",
      align: "right",
      cell: (row) => (
        <div className="text-sm text-muted-foreground">
          {row.reorder_point ?? row.low_stock_threshold}
        </div>
      ),
    },
  ];

  const lastPage = stockData
    ? Math.max(1, Math.ceil(stockData.count / pageSize))
    : 1;

  // Show store selector if no store selected
  if (!storeId) {
    return (
      <div className="space-y-4">
        <FilterBar
          searchQuery=""
          onSearchChange={() => {}}
          searchPlaceholder=""
          showClear={false}
        >
          <StoreFilter
            stores={stores}
            selectedStoreId={storeId}
            onStoreChange={(id) => {
              if (id !== null && onStoreChange) {
                onStoreChange(id);
              }
            }}
            showAllStores={false}
            required={true}
          />
        </FilterBar>
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">
            Please select a store to view stock
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        variant="error"
        title="Failed to load stock"
        description="Please try again or contact support if the problem persists."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search by product name, SKU, or barcode..."
        activeFilterCount={
          (searchQuery ? 1 : 0) + (category ? 1 : 0) + (quickFilter !== "all" ? 1 : 0)
        }
        onClear={() => {
          setSearchQuery("");
          setCategory("");
          setQuickFilter("all");
        }}
      >
        <StoreFilter
          stores={stores}
          selectedStoreId={storeId}
          onStoreChange={(id) => {
            if (id !== null && onStoreChange) {
              onStoreChange(id);
            }
          }}
          showAllStores={false}
          required={true}
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">All Categories</option>
          {/* TODO: Fetch categories from API */}
        </select>
      </FilterBar>

      {/* Actions Bar */}
      <div className="flex items-center justify-between">
        <QuickFilters
          activeFilter={quickFilter}
          onFilterChange={setQuickFilter}
        />
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowCrossStoreView(true);
              setCrossStoreVariantId(null);
            }}
          >
            <Store className="h-4 w-4 mr-2" />
            Cross-Store View
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting}
          >
            <Download className="h-4 w-4 mr-2" />
            {exporting ? "Exporting..." : "Export to CSV"}
          </Button>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedItems.size > 0 && (
        <BulkActionsBar
          selectedCount={selectedItems.size}
          totalCount={filteredItems.length}
          showSelectAll
          onSelectAll={handleSelectAll}
          onClearSelection={handleClearSelection}
          actions={[
            {
              label: "Adjust",
              onClick: () => setShowBulkAdjust(true),
              variant: "default",
            },
            {
              label: "Create Transfer",
              onClick: () => onCreateTransfer?.(selectedStockItems),
              variant: "outline",
            },
            {
              label: "Export",
              onClick: handleExport,
              variant: "outline",
              disabled: exporting,
            },
          ]}
        />
      )}

      {/* Stock Table */}
      {isLoading ? (
        <LoadingSkeleton variant="card" height={400} />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={filteredItems}
            onRowClick={(item) => {
              setDetailItem(item);
              onItemClick?.(item);
            }}
            getRowKey={(item) => item.id}
            hoverable
            emptyMessage="No stock items found"
          />
          <DataTablePagination
            page={page}
            pageSize={pageSize}
            count={stockData?.count || 0}
            lastPage={lastPage}
            onPageChange={setPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setPage(1);
            }}
          />
        </>
      )}

      {/* Detail Drawer */}
      <StockDetailDrawer
        item={detailItem}
        open={!!detailItem}
        onClose={() => setDetailItem(null)}
        currency={stockData?.currency}
      />

      {/* Bulk Adjust Modal */}
      {storeId && (
        <BulkAdjustModal
          open={showBulkAdjust}
          onClose={() => setShowBulkAdjust(false)}
          items={selectedStockItems}
          storeId={storeId}
          onSuccess={() => {
            handleClearSelection();
          }}
        />
      )}

      {/* Cross-Store View Modal */}
      <CrossStoreView
        open={showCrossStoreView}
        onClose={() => {
          setShowCrossStoreView(false);
          setCrossStoreVariantId(null);
        }}
        initialVariantId={crossStoreVariantId}
      />
    </div>
  );
}

