// pos-frontend/src/features/reports/tabs/ReturnsReportsTab.tsx
import React, { useState, useEffect, useMemo } from "react";
import { RefreshCw, TrendingDown, DollarSign, Percent } from "lucide-react";
import { useReturnsAnalysisReport } from "../hooks/useReports";
import { ReportFilters } from "../components/ReportFilters";
import { getMyStores, type StoreLite } from "@/features/pos/api";
import { useMoney, type CurrencyInfo } from "@/features/sales/useMoney";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { LoadingSkeleton, LoadingSkeletonTable } from "@/features/inventory/components/LoadingSkeleton";

interface ReturnsReportsTabProps {
  storeId: string;
  setStoreId: (value: string) => void;
  dateFrom: string;
  setDateFrom: (value: string) => void;
  dateTo: string;
  setDateTo: (value: string) => void;
}

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8", "#82ca9d"];

/**
 * Returns Reports Tab Component
 * Displays returns analysis including return rates, refunds, and breakdowns by reason and disposition
 */
export function ReturnsReportsTab({
  storeId,
  setStoreId,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
}: ReturnsReportsTabProps) {
  const [stores, setStores] = useState<StoreLite[]>([]);
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

  // Fetch returns analysis report
  const {
    data: reportData,
    isLoading,
    error,
  } = useReturnsAnalysisReport(
    {
      store_id: storeId || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    },
    !!(dateFrom && dateTo)
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

  // Format percentage
  const formatPercentage = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  const trendSeries = useMemo(() => {
    return (reportData?.trend || []).map((point) => {
      const dateObj = new Date(point.date);
      return {
        ...point,
        displayDate: dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      };
    });
  }, [reportData?.trend]);

  const { summary, reason_breakdown, disposition_breakdown, status_breakdown } = reportData || {};

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
        reportType="returns"
        exportParams={{
          store_id: storeId || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        }}
      />

      {/* Summary Cards */}
      {!isLoading && summary && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Total Returns</span>
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-semibold text-foreground">{summary.total_returns}</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Total Refunded</span>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-semibold text-foreground">{safeMoney(summary.total_refunded)}</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Return Rate</span>
              <Percent className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-semibold text-foreground">{formatPercentage(summary.return_rate)}</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Total Sales</span>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-semibold text-foreground">{summary.total_sales}</p>
          </div>
        </div>
      )}

      {/* Charts Section */}
      {!isLoading && reportData && (
        <>
          {trendSeries.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground mb-4">Return Trend</h3>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendSeries} margin={{ left: 0, right: 20, top: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="displayDate" tick={{ fill: "#9aa4b2", fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fill: "#9aa4b2", fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: "#9aa4b2", fontSize: 11 }} />
                    <Tooltip
                      formatter={(value: number, name: string) =>
                        name === "Refunded" ? safeMoney(value) : value
                      }
                    />
                    <Legend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="return_count"
                      name="Returns"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="refunded_amount"
                      name="Refunded"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="return_rate"
                      name="Return Rate %"
                      stroke="#f97316"
                      strokeDasharray="4 4"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Reason Breakdown */}
            {reason_breakdown && reason_breakdown.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-semibold text-foreground mb-4">Returns by Reason</h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={reason_breakdown}
                        dataKey="return_count"
                        nameKey="reason_code"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ reason_code, percent }) => `${reason_code} ${(percent * 100).toFixed(0)}%`}
                      >
                        {reason_breakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Disposition Breakdown */}
            {disposition_breakdown && disposition_breakdown.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-semibold text-foreground mb-4">Returns by Disposition</h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={disposition_breakdown}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="disposition" tick={{ fill: "#9aa4b2", fontSize: 11 }} />
                      <YAxis tick={{ fill: "#9aa4b2", fontSize: 11 }} />
                      <Tooltip
                        formatter={(value: number, name: string) => {
                          if (name === "refunded_amount") {
                            return safeMoney(value);
                          }
                          return value;
                        }}
                      />
                      <Bar dataKey="item_count" name="Items" fill="#3b82f6" />
                      <Bar dataKey="refunded_amount" name="Refunded" fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Breakdown Tables */}
      {!isLoading && reportData && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Reason Breakdown Table */}
        {reason_breakdown && reason_breakdown.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-4">Reason Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-2 text-muted-foreground">Reason</th>
                    <th className="text-right py-2 px-2 text-muted-foreground">Count</th>
                    <th className="text-right py-2 px-2 text-muted-foreground">Refunded</th>
                  </tr>
                </thead>
                <tbody>
                  {reason_breakdown.map((item, idx) => (
                    <tr key={idx} className="border-b border-border/50">
                      <td className="py-2 px-2 text-foreground">{item.reason_code}</td>
                      <td className="py-2 px-2 text-right text-foreground">{item.return_count}</td>
                      <td className="py-2 px-2 text-right text-foreground">{safeMoney(item.refunded_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Disposition Breakdown Table */}
        {disposition_breakdown && disposition_breakdown.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-4">Disposition Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-2 text-muted-foreground">Disposition</th>
                    <th className="text-right py-2 px-2 text-muted-foreground">Items</th>
                    <th className="text-right py-2 px-2 text-muted-foreground">Refunded</th>
                  </tr>
                </thead>
                <tbody>
                  {disposition_breakdown.map((item, idx) => (
                    <tr key={idx} className="border-b border-border/50">
                      <td className="py-2 px-2 text-foreground">{item.disposition}</td>
                      <td className="py-2 px-2 text-right text-foreground">{item.item_count}</td>
                      <td className="py-2 px-2 text-right text-foreground">{safeMoney(item.refunded_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Status Breakdown Table */}
        {status_breakdown && status_breakdown.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-4">Status Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-2 text-muted-foreground">Status</th>
                    <th className="text-right py-2 px-2 text-muted-foreground">Count</th>
                    <th className="text-right py-2 px-2 text-muted-foreground">Refunded</th>
                  </tr>
                </thead>
                <tbody>
                  {status_breakdown.map((item, idx) => (
                    <tr key={idx} className="border-b border-border/50">
                      <td className="py-2 px-2 text-foreground capitalize">{item.status}</td>
                      <td className="py-2 px-2 text-right text-foreground">{item.return_count}</td>
                      <td className="py-2 px-2 text-right text-foreground">{safeMoney(item.refunded_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <LoadingSkeleton key={idx} variant="card" />
            ))}
          </div>
          <LoadingSkeleton variant="rectangular" height={220} className="rounded-xl border border-border bg-card" />
          <LoadingSkeletonTable rows={4} columns={4} className="p-4" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="rounded-xl border border-destructive bg-destructive/10 p-8 text-center">
          <p className="text-destructive">Error loading returns report: {error.message}</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && !reportData && (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">No data available for the selected date range.</p>
          <p className="text-xs text-muted-foreground mt-2">
            Try adjusting your date range or selecting a different store.
          </p>
        </div>
      )}
    </div>
  );
}
