// pos-frontend/src/features/reports/tabs/SalesReportsTab.tsx
import React, { useState, useEffect } from "react";
import { DollarSign, Package, TrendingUp, ArrowUpRight, ArrowDownRight, ChartPie } from "lucide-react";
import { useSalesSummaryReport, useSalesDetailReport } from "../hooks/useReports";
import { SalesReportCharts } from "../components/SalesReportCharts";
import { ReportFilters } from "../components/ReportFilters";
import { getMyStores, type StoreLite } from "@/features/pos/api";
import { cn } from "@/lib/utils";
import { useMoney, type CurrencyInfo } from "@/features/sales/useMoney";
import { LoadingSkeleton, LoadingSkeletonTable } from "@/features/inventory/components/LoadingSkeleton";

interface SalesReportsTabProps {
  storeId: string;
  setStoreId: (value: string) => void;
  dateFrom: string;
  setDateFrom: (value: string) => void;
  dateTo: string;
  setDateTo: (value: string) => void;
}

/**
 * Sales Reports Tab Component
 * Displays sales summary cards, charts, and detail table
 */
export function SalesReportsTab({ storeId, setStoreId, dateFrom, setDateFrom, dateTo, setDateTo }: SalesReportsTabProps) {
  const [stores, setStores] = useState<StoreLite[]>([]);
  const [groupBy, setGroupBy] = useState<"day" | "week" | "month">("day");
  const [detailPage, setDetailPage] = useState(1);
  const [detailPageSize, setDetailPageSize] = useState(100);
  const [detailStatus, setDetailStatus] = useState<string>("");
  const [currency, setCurrency] = useState<CurrencyInfo>({ code: "USD", symbol: "$", precision: 2 });
  const { safeMoney } = useMoney(currency);

  // Load stores on mount
  React.useEffect(() => {
    getMyStores()
      .then(setStores)
      .catch((err) => {
        console.error("Failed to load stores:", err);
      });
  }, []);

  // Fetch summary report
  // Only send dates if both are provided (matches Sales page pattern)
  const {
    data: summaryData,
    isLoading: summaryLoading,
    error: summaryError,
  } = useSalesSummaryReport(
    {
      store_id: storeId || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      group_by: groupBy,
    },
    !!(dateFrom && dateTo)
  );

  // Fetch detail report
  // Only send dates if both are provided (matches Sales page pattern)
  const {
    data: detailData,
    isLoading: detailLoading,
    error: detailError,
  } = useSalesDetailReport(
    {
      store_id: storeId || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      status: detailStatus || undefined,
      page: detailPage,
      page_size: detailPageSize,
    },
    !!(dateFrom && dateTo)
  );

  // Update currency from API responses
  useEffect(() => {
    if (summaryData?.currency) {
      setCurrency({
        code: summaryData.currency.code || "USD",
        symbol: summaryData.currency.symbol || undefined,
        precision: summaryData.currency.precision ?? 2,
      });
    } else if (detailData?.currency) {
      setCurrency({
        code: detailData.currency.code || "USD",
        symbol: detailData.currency.symbol || undefined,
        precision: detailData.currency.precision ?? 2,
      });
    }
  }, [summaryData?.currency, detailData?.currency]);

  // Format number
  const formatNumber = (value: number) => {
    return new Intl.NumberFormat("en-US").format(value);
  };

  const renderStoreBreakdown = () => {
    const breakdown = summaryData?.store_breakdown || [];
    if (!breakdown.length || storeId) {
      return null;
    }
    const sorted = [...breakdown].sort((a, b) => b.revenue - a.revenue);
    const totalRevenue = sorted.reduce((sum, item) => sum + (item.revenue || 0), 0);

    return (
      <div className="rounded-xl border border-border bg-card">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Store Breakdown</h3>
            <p className="text-xs text-muted-foreground">
              Revenue and order distribution across active stores
            </p>
          </div>
          <ChartPie className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Store</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Revenue</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Orders</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Mix %</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((store) => {
                const mix = totalRevenue > 0 ? (store.revenue / totalRevenue) * 100 : 0;
                return (
                  <tr key={store.store_id} className="border-b border-border/50">
                    <td className="px-4 py-2 text-foreground font-medium">{store.store_name || "Unknown store"}</td>
                    <td className="px-4 py-2 text-right text-foreground">{safeMoney(store.revenue)}</td>
                    <td className="px-4 py-2 text-right text-foreground">{formatNumber(store.orders)}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{mix.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

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
        reportType="sales"
        exportParams={{
          store_id: storeId || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          group_by: groupBy,
          status: detailStatus || undefined,
        }}
      />

      {/* Group By Selector */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground">Group by:</label>
        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as "day" | "week" | "month")}
          className="rounded-md border border-border bg-background text-xs text-foreground px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
        </select>
      </div>

      {/* Loading State */}
      {summaryLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <LoadingSkeleton key={idx} variant="card" />
            ))}
          </div>
          <LoadingSkeleton variant="rectangular" height={220} className="rounded-xl border border-border bg-card" />
        </div>
      )}

      {/* Error State */}
      {summaryError && (
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-error">Error loading sales report: {summaryError.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      )}

      {/* Summary Cards */}
      {!summaryLoading && summaryData && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Total Revenue */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Total Revenue</div>
                  <div className="text-2xl font-semibold text-foreground">
                    {safeMoney(summaryData.summary.total_revenue)}
                  </div>
                  {summaryData.summary.revenue_growth_percent !== undefined && (
                    <div
                      className={cn(
                        "text-xs mt-1 flex items-center gap-1",
                        summaryData.summary.revenue_growth_percent >= 0 ? "text-success" : "text-error"
                      )}
                    >
                      {summaryData.summary.revenue_growth_percent >= 0 ? (
                        <ArrowUpRight className="h-3 w-3" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3" />
                      )}
                      {Math.abs(summaryData.summary.revenue_growth_percent).toFixed(1)}% vs previous period
                    </div>
                  )}
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  <DollarSign className="h-5 w-5 text-foreground" />
                </div>
              </div>
            </div>

            {/* Order Count */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Total Orders</div>
                  <div className="text-2xl font-semibold text-foreground">
                    {formatNumber(summaryData.summary.order_count)}
                  </div>
                  {summaryData.summary.order_growth_percent !== undefined && (
                    <div
                      className={cn(
                        "text-xs mt-1 flex items-center gap-1",
                        summaryData.summary.order_growth_percent >= 0 ? "text-success" : "text-error"
                      )}
                    >
                      {summaryData.summary.order_growth_percent >= 0 ? (
                        <ArrowUpRight className="h-3 w-3" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3" />
                      )}
                      {Math.abs(summaryData.summary.order_growth_percent).toFixed(1)}% vs previous period
                    </div>
                  )}
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  <Package className="h-5 w-5 text-foreground" />
                </div>
              </div>
            </div>

            {/* Average Order Value */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Avg Order Value</div>
                  <div className="text-2xl font-semibold text-foreground">
                    {safeMoney(summaryData.summary.average_order_value)}
                  </div>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  <TrendingUp className="h-5 w-5 text-foreground" />
                </div>
              </div>
            </div>

            {/* Growth Percentage */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Revenue Growth</div>
                  <div
                    className={cn(
                      "text-2xl font-semibold",
                      summaryData.summary.revenue_growth_percent >= 0 ? "text-success" : "text-error"
                    )}
                  >
                    {summaryData.summary.revenue_growth_percent >= 0 ? "+" : ""}
                    {summaryData.summary.revenue_growth_percent.toFixed(1)}%
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">vs previous period</div>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  {summaryData.summary.revenue_growth_percent >= 0 ? (
                    <ArrowUpRight className="h-5 w-5 text-success" />
                  ) : (
                    <ArrowDownRight className="h-5 w-5 text-error" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Charts */}
          {summaryData.time_series && summaryData.time_series.length > 0 && (
            <SalesReportCharts timeSeries={summaryData.time_series} groupBy={groupBy} currency={currency} />
          )}

          {renderStoreBreakdown()}

          {/* Detail Table */}
          <div className="rounded-xl border border-border bg-card">
            <div className="p-4 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Sales Detail</h3>
            </div>

            {/* Status Filter */}
            <div className="p-4 border-b border-border">
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">Status:</label>
                <select
                  value={detailStatus}
                  onChange={(e) => {
                    setDetailStatus(e.target.value);
                    setDetailPage(1);
                  }}
                  className="rounded-md border border-border bg-background text-xs text-foreground px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">All</option>
                  <option value="completed">Completed</option>
                  <option value="pending">Pending</option>
                  <option value="void">Void</option>
                </select>
              </div>
            </div>

            {/* Table */}
            {detailLoading ? (
              <div className="p-6">
                <LoadingSkeletonTable rows={4} columns={5} />
              </div>
            ) : detailError ? (
              <div className="p-4 text-center text-error">Error: {detailError.message}</div>
            ) : detailData && detailData.results.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-muted/40 border-b border-border">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs text-muted-foreground font-medium">Receipt #</th>
                        <th className="px-4 py-2 text-left text-xs text-muted-foreground font-medium">Date</th>
                        <th className="px-4 py-2 text-left text-xs text-muted-foreground font-medium">Store</th>
                        <th className="px-4 py-2 text-left text-xs text-muted-foreground font-medium">Cashier</th>
                        <th className="px-4 py-2 text-right text-xs text-muted-foreground font-medium">Total</th>
                        <th className="px-4 py-2 text-left text-xs text-muted-foreground font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailData.results.map((sale) => (
                        <tr key={sale.id} className="border-b border-border/60 hover:bg-muted/20">
                          <td className="px-4 py-2 text-foreground">{sale.receipt_no || `#${sale.id}`}</td>
                          <td className="px-4 py-2 text-muted-foreground">{formatDate(sale.created_at)}</td>
                          <td className="px-4 py-2 text-foreground">{sale.store_name || "—"}</td>
                          <td className="px-4 py-2 text-foreground">{sale.cashier_name || "—"}</td>
                          <td className="px-4 py-2 text-right text-foreground font-medium">
                            {safeMoney(Number(sale.total))}
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded text-xs font-medium",
                                sale.status === "completed" && "bg-success/20 text-success",
                                sale.status === "pending" && "bg-warning/20 text-warning",
                                sale.status === "void" && "bg-error/20 text-error"
                              )}
                            >
                              {sale.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/40">
                  <div className="text-xs text-muted-foreground">
                    {detailData.count === 0
                      ? "No results"
                      : `Showing ${Math.min((detailPage - 1) * detailPageSize + 1, detailData.count)}–${Math.min(detailPage * detailPageSize, detailData.count)} of ${detailData.count}`}
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-muted-foreground">
                      Rows:&nbsp;
                      <select
                        className="rounded-md border border-border bg-card text-xs text-foreground px-2 py-1"
                        value={detailPageSize}
                        onChange={(e) => {
                          setDetailPageSize(Number(e.target.value));
                          setDetailPage(1);
                        }}
                      >
                        {[50, 100, 200, 500].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        className="rounded-md px-2 py-1 text-xs text-foreground hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
                        onClick={() => setDetailPage((p) => Math.max(1, p - 1))}
                        disabled={detailPage <= 1}
                      >
                        Prev
                      </button>
                      <div className="min-w-[7rem] text-center text-xs text-muted-foreground">
                        Page {detailPage} of {detailData.total_pages || 1}
                      </div>
                      <button
                        className="rounded-md px-2 py-1 text-xs text-foreground hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
                        onClick={() => setDetailPage((p) => Math.min(detailData.total_pages || 1, p + 1))}
                        disabled={detailPage >= (detailData.total_pages || 1)}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-8 text-center text-muted-foreground">No sales found</div>
            )}
          </div>
        </>
      )}

      {/* Empty State */}
      {!summaryLoading && !summaryError && !summaryData && (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-muted-foreground">No sales data available for the selected period.</p>
        <p className="text-xs text-muted-foreground mt-2">
          Try adjusting your date range or selecting a different store.
        </p>
        </div>
      )}
    </div>
  );
}
