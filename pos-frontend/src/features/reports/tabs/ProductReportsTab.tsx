// pos-frontend/src/features/reports/tabs/ProductReportsTab.tsx
import React, { useState, useEffect, useMemo } from "react";
import { Package, DollarSign, TrendingUp, ArrowUp, ArrowDown } from "lucide-react";
import { useProductPerformanceReport } from "../hooks/useReports";
import { ReportFilters } from "../components/ReportFilters";
import { ProductReportCharts } from "../components/ProductReportCharts";
import { getMyStores, type StoreLite } from "@/features/pos/api";
import { cn } from "@/lib/utils";
import { useMoney, type CurrencyInfo } from "@/features/sales/useMoney";
import { LoadingSkeleton, LoadingSkeletonTable } from "@/features/inventory/components/LoadingSkeleton";
import type { ProductPerformanceReport } from "../api/reports";

type ProductRecord = ProductPerformanceReport["top_products_by_revenue"][number];
type SortableField = "product_name" | "sku" | "category" | "revenue" | "quantity_sold" | "avg_price" | "transaction_count";

interface ProductReportsTabProps {
  storeId: string;
  setStoreId: (value: string) => void;
  dateFrom: string;
  setDateFrom: (value: string) => void;
  dateTo: string;
  setDateTo: (value: string) => void;
}

/**
 * Product Reports Tab Component
 * Displays product performance summary cards, charts, and tables
 */
export function ProductReportsTab({
  storeId,
  setStoreId,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
}: ProductReportsTabProps) {
  const [stores, setStores] = useState<StoreLite[]>([]);
  const [limit, setLimit] = useState<number>(50);
  const [sortBy, setSortBy] = useState<"revenue" | "quantity">("revenue");
  const [tableSort, setTableSort] = useState<{ field: SortableField; direction: "asc" | "desc" }>({
    field: "revenue",
    direction: "desc",
  });
  const [tablePage, setTablePage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currency, setCurrency] = useState<CurrencyInfo>({
    code: "USD",
    symbol: "$",
    precision: 2,
  });
  const { safeMoney } = useMoney(currency);

  // Load stores on mount
  React.useEffect(() => {
    getMyStores()
      .then(setStores)
      .catch((err) => {
        console.error("Failed to load stores:", err);
      });
  }, []);

  // Fetch product performance report
  // Pass undefined if empty to let backend handle defaults (matches SalesReportsTab pattern)
  const {
    data: reportData,
    isLoading,
    error,
  } = useProductPerformanceReport(
    {
      store_id: storeId || undefined,
      date_from: dateFrom || undefined, // Pass undefined if empty
      date_to: dateTo || undefined,     // Pass undefined if empty
      limit,
      sort_by: sortBy,
    },
    !!(dateFrom && dateTo) // Only enable if both dates provided (matches SalesReportsTab pattern)
  );

  // Update currency from API response
  useEffect(() => {
    if (reportData?.currency) {
      setCurrency({
        code: reportData.currency.code || "USD",
        symbol: reportData.currency.symbol || undefined,
        precision: reportData.currency.precision ?? 2,
      });
    }
  }, [reportData?.currency]);

  // Format number
  const formatNumber = (value: number) => {
    return new Intl.NumberFormat("en-US").format(value);
  };

  // Get current products list based on sort_by
  const currentProducts: ProductRecord[] =
    sortBy === "revenue"
      ? reportData?.top_products_by_revenue || []
      : reportData?.top_products_by_quantity || [];

  useEffect(() => {
    // Reset table when sort option changes or new data arrives
    setTablePage(1);
    setTableSort({
      field: sortBy === "revenue" ? "revenue" : "quantity_sold",
      direction: "desc",
    });
  }, [sortBy, reportData?.summary.total_products]);

  const sortedProducts = useMemo(() => {
    const data = [...currentProducts];
    const getValue = (item: ProductRecord, field: SortableField) => {
      switch (field) {
        case "product_name":
          return item.product_name || "";
        case "sku":
          return item.sku || "";
        case "category":
          return item.category || "";
        case "revenue":
          return item.revenue ?? 0;
        case "quantity_sold":
          return item.quantity_sold ?? 0;
        case "avg_price":
          return item.avg_price ?? 0;
        case "transaction_count":
          return item.transaction_count ?? 0;
        default:
          return "";
      }
    };

    data.sort((a, b) => {
      const valueA = getValue(a, tableSort.field);
      const valueB = getValue(b, tableSort.field);
      if (typeof valueA === "number" && typeof valueB === "number") {
        return tableSort.direction === "asc" ? valueA - valueB : valueB - valueA;
      }
      return tableSort.direction === "asc"
        ? String(valueA).localeCompare(String(valueB))
        : String(valueB).localeCompare(String(valueA));
    });

    return data;
  }, [currentProducts, tableSort]);

  const totalPages = Math.max(1, Math.ceil(sortedProducts.length / rowsPerPage));
  useEffect(() => {
    setTablePage(1);
  }, [rowsPerPage]);

  const paginatedProducts = useMemo(() => {
    const start = (tablePage - 1) * rowsPerPage;
    return sortedProducts.slice(start, start + rowsPerPage);
  }, [sortedProducts, tablePage, rowsPerPage]);

  const handleSort = (field: SortableField) => {
    setTableSort((prev) => {
      if (prev.field === field) {
        return { field, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      const defaultDir: "asc" | "desc" = ["product_name", "category", "sku"].includes(field) ? "asc" : "desc";
      return { field, direction: defaultDir };
    });
  };

  const renderSortIcon = (field: SortableField) => {
    if (tableSort.field !== field) return null;
    return tableSort.direction === "asc" ? (
      <ArrowUp className="h-3 w-3 text-muted-foreground" aria-label="ascending" />
    ) : (
      <ArrowDown className="h-3 w-3 text-muted-foreground" aria-label="descending" />
    );
  };

  const categoryBreakdown = useMemo(() => {
    if (!reportData?.top_products_by_revenue?.length) {
      return [];
    }
    const map = new Map<string, { name: string; revenue: number; quantity: number }>();
    reportData.top_products_by_revenue.forEach((product) => {
      const key = product.category || "Uncategorized";
      const entry = map.get(key) || { name: key, revenue: 0, quantity: 0 };
      entry.revenue += product.revenue ?? 0;
      entry.quantity += product.quantity_sold ?? 0;
      map.set(key, entry);
    });
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [reportData?.top_products_by_revenue]);
  const trendData = reportData?.trends || [];

  return (
    <div className="space-y-6">
      {/* Filters */}
      <ReportFilters
        storeId={storeId}
        setStoreId={setStoreId}
        stores={stores}
        dateFrom={dateFrom}
        setDateFrom={setDateFrom}
        dateTo={dateTo}
        setDateTo={setDateTo}
        reportType="products"
        exportParams={{
          store_id: storeId || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          limit,
          sort_by: sortBy,
        }}
      />

      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Sort by:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "revenue" | "quantity")}
            className="rounded-md border border-border bg-background text-xs text-foreground px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="revenue">Revenue</option>
            <option value="quantity">Quantity</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Limit:</label>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="rounded-md border border-border bg-background text-xs text-foreground px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value={10}>Top 10</option>
            <option value={25}>Top 25</option>
            <option value={50}>Top 50</option>
            <option value={100}>Top 100</option>
          </select>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <LoadingSkeleton key={idx} variant="card" />
            ))}
          </div>
          <LoadingSkeleton variant="rectangular" height={220} className="rounded-xl border border-border bg-card" />
          <LoadingSkeletonTable rows={4} columns={5} className="p-4" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-error">Error loading product report: {error.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      )}

      {/* Summary Cards */}
      {reportData && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Total Products */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Total Products</div>
                  <div className="text-2xl font-semibold text-foreground">
                    {formatNumber(reportData.summary.total_products)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Unique products sold
                  </div>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  <Package className="h-5 w-5 text-foreground" />
                </div>
              </div>
            </div>

            {/* Total Revenue */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Total Revenue</div>
                  <div className="text-2xl font-semibold text-foreground">
                    {safeMoney(reportData.summary.total_revenue)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    From all products
                  </div>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  <DollarSign className="h-5 w-5 text-foreground" />
                </div>
              </div>
            </div>

            {/* Total Quantity */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Total Quantity</div>
                  <div className="text-2xl font-semibold text-foreground">
                    {formatNumber(reportData.summary.total_quantity_sold)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Units sold
                  </div>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  <TrendingUp className="h-5 w-5 text-foreground" />
                </div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <ProductReportCharts
            topByRevenue={reportData.top_products_by_revenue.slice(0, 10)}
            topByQuantity={reportData.top_products_by_quantity.slice(0, 10)}
            categoryBreakdown={categoryBreakdown}
            trendData={trendData}
            currency={currency}
          />

          {/* Product Table */}
          <div className="rounded-xl border border-border bg-card">
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  Top Products by {sortBy === "revenue" ? "Revenue" : "Quantity"}
                </h3>
                <div className="text-xs text-muted-foreground">
                  Showing{" "}
                  {paginatedProducts.length > 0
                    ? `${(tablePage - 1) * rowsPerPage + 1}-${(tablePage - 1) * rowsPerPage + paginatedProducts.length}`
                    : "0"}{" "}
                  of {Math.min(sortedProducts.length, reportData.summary.total_products)} products
                </div>
              </div>
            </div>

            {paginatedProducts.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/40 border-b border-border">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs text-muted-foreground font-medium">
                        #
                      </th>
                      {[
                        { field: "product_name" as SortableField, label: "Product", align: "text-left" },
                        { field: "sku" as SortableField, label: "SKU", align: "text-left" },
                        { field: "category" as SortableField, label: "Category", align: "text-left" },
                        { field: "revenue" as SortableField, label: "Revenue", align: "text-right" },
                        { field: "quantity_sold" as SortableField, label: "Quantity", align: "text-right" },
                        { field: "avg_price" as SortableField, label: "Avg Price", align: "text-right" },
                        { field: "transaction_count" as SortableField, label: "Transactions", align: "text-right" },
                      ].map((col) => (
                        <th
                          key={col.field}
                          className={cn(
                            "px-4 py-2 text-xs text-muted-foreground font-medium",
                            col.align,
                            "whitespace-nowrap"
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => handleSort(col.field)}
                            className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                          >
                            {col.label}
                            {renderSortIcon(col.field)}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedProducts.map((product, index) => (
                      <tr key={product.variant_id} className="border-b border-border/60 hover:bg-muted/20">
                        <td className="px-4 py-2 text-muted-foreground">
                          {(tablePage - 1) * rowsPerPage + index + 1}
                        </td>
                        <td className="px-4 py-2">
                          <div>
                            <div className="font-medium text-foreground">
                              {product.product_name || "—"}
                            </div>
                            {product.variant_name && product.variant_name !== product.product_name && (
                              <div className="text-xs text-muted-foreground">
                                {product.variant_name}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-foreground font-mono text-xs">
                          {product.sku || "—"}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {product.category || "—"}
                        </td>
                        <td className="px-4 py-2 text-right text-foreground font-medium">
                          {safeMoney(product.revenue)}
                        </td>
                        <td className="px-4 py-2 text-right text-foreground">
                          {formatNumber(product.quantity_sold)}
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {safeMoney(product.avg_price)}
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {formatNumber(product.transaction_count)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                No products found for the selected period
              </div>
            )}

            {paginatedProducts.length > 0 && (
              <div className="flex flex-col gap-2 px-4 py-3 border-t border-border bg-muted/40 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  Rows per page:
                  <select
                    className="rounded-md border border-border bg-card text-xs text-foreground px-2 py-1"
                    value={rowsPerPage}
                    onChange={(e) => setRowsPerPage(Number(e.target.value))}
                  >
                    {[10, 20, 50].map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <button
                    className="rounded-md px-2 py-1 text-xs text-foreground hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
                    onClick={() => setTablePage((prev) => Math.max(1, prev - 1))}
                    disabled={tablePage <= 1}
                  >
                    Prev
                  </button>
                  <span className="min-w-[7rem] text-center">
                    Page {tablePage} of {totalPages}
                  </span>
                  <button
                    className="rounded-md px-2 py-1 text-xs text-foreground hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
                    onClick={() => setTablePage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={tablePage >= totalPages}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Empty State */}
      {!isLoading && !error && !reportData && (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">
            No product data available for the selected period.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Try adjusting your date range or selecting a different store.
          </p>
        </div>
      )}
    </div>
  );
}
