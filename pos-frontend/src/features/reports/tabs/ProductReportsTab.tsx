// pos-frontend/src/features/reports/tabs/ProductReportsTab.tsx
import React, { useState, useEffect } from "react";
import { Package, DollarSign, TrendingUp, BarChart3 } from "lucide-react";
import { useProductPerformanceReport } from "../hooks/useReports";
import { ReportFilters } from "../components/ReportFilters";
import { ProductReportCharts } from "../components/ProductReportCharts";
import { getMyStores, type StoreLite } from "@/features/pos/api";
import { cn } from "@/lib/utils";
import { useMoney, type CurrencyInfo } from "@/features/sales/useMoney";

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
  const currentProducts =
    sortBy === "revenue"
      ? reportData?.top_products_by_revenue || []
      : reportData?.top_products_by_quantity || [];

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
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">Loading product performance report...</p>
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
                  Showing {currentProducts.length} of {reportData.summary.total_products} products
                </div>
              </div>
            </div>

            {currentProducts.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/40 border-b border-border">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs text-muted-foreground font-medium">
                        #
                      </th>
                      <th className="px-4 py-2 text-left text-xs text-muted-foreground font-medium">
                        Product
                      </th>
                      <th className="px-4 py-2 text-left text-xs text-muted-foreground font-medium">
                        SKU
                      </th>
                      <th className="px-4 py-2 text-left text-xs text-muted-foreground font-medium">
                        Category
                      </th>
                      <th className="px-4 py-2 text-right text-xs text-muted-foreground font-medium">
                        Revenue
                      </th>
                      <th className="px-4 py-2 text-right text-xs text-muted-foreground font-medium">
                        Quantity
                      </th>
                      <th className="px-4 py-2 text-right text-xs text-muted-foreground font-medium">
                        Avg Price
                      </th>
                      <th className="px-4 py-2 text-right text-xs text-muted-foreground font-medium">
                        Transactions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentProducts.map((product, index) => (
                      <tr
                        key={product.variant_id}
                        className="border-b border-border/60 hover:bg-muted/20"
                      >
                        <td className="px-4 py-2 text-muted-foreground">{index + 1}</td>
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
          </div>
        </>
      )}

      {/* Empty State */}
      {!isLoading && !error && !reportData && (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">
            No product data available for the selected period
          </p>
        </div>
      )}
    </div>
  );
}

