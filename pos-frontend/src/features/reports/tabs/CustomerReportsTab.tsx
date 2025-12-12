// pos-frontend/src/features/reports/tabs/CustomerReportsTab.tsx
import React, { useState, useEffect } from "react";
import { Users, UserPlus, UserCheck, TrendingUp, DollarSign } from "lucide-react";
import { useCustomerAnalyticsReport } from "../hooks/useReports";
import { ReportFilters } from "../components/ReportFilters";
import { getMyStores, type StoreLite } from "@/features/pos/api";
import { cn } from "@/lib/utils";
import { useMoney, type CurrencyInfo } from "@/features/sales/useMoney";

interface CustomerReportsTabProps {
  storeId: string;
  setStoreId: (value: string) => void;
  dateFrom: string;
  setDateFrom: (value: string) => void;
  dateTo: string;
  setDateTo: (value: string) => void;
}

/**
 * Customer Reports Tab Component
 * Displays customer analytics including top customers, lifetime value, and repeat customer metrics
 */
export function CustomerReportsTab({
  storeId,
  setStoreId,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
}: CustomerReportsTabProps) {
  const [stores, setStores] = useState<StoreLite[]>([]);
  const [limit, setLimit] = useState<number>(50);
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

  // Fetch customer analytics report
  const {
    data: reportData,
    isLoading,
    error,
  } = useCustomerAnalyticsReport(
    {
      store_id: storeId || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      limit,
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

  // Format number
  const formatNumber = (value: number) => {
    return new Intl.NumberFormat("en-US").format(value);
  };

  // Format percentage
  const formatPercentage = (value: number) => {
    return `${value.toFixed(2)}%`;
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
      />

      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap">
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
          <p className="text-muted-foreground">Loading customer analytics report...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-error">Error loading customer report: {error.message}</p>
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
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Total Customers */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Total Customers</div>
                  <div className="text-2xl font-semibold text-foreground">
                    {formatNumber(reportData.summary.total_customers_in_period)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    In selected period
                  </div>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  <Users className="h-5 w-5 text-foreground" />
                </div>
              </div>
            </div>

            {/* New Customers */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">New Customers</div>
                  <div className="text-2xl font-semibold text-foreground">
                    {formatNumber(reportData.summary.new_customers)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    First purchase in period
                  </div>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  <UserPlus className="h-5 w-5 text-foreground" />
                </div>
              </div>
            </div>

            {/* Returning Customers */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Returning Customers</div>
                  <div className="text-2xl font-semibold text-foreground">
                    {formatNumber(reportData.summary.returning_customers)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Previous customers
                  </div>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  <UserCheck className="h-5 w-5 text-foreground" />
                </div>
              </div>
            </div>

            {/* Repeat Customer Rate */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Repeat Rate</div>
                  <div className="text-2xl font-semibold text-foreground">
                    {formatPercentage(reportData.summary.repeat_customer_rate)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Multiple purchases
                  </div>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  <TrendingUp className="h-5 w-5 text-foreground" />
                </div>
              </div>
            </div>
          </div>

          {/* Lifetime Value Stats */}
          {(reportData.lifetime_value_stats.avg_lifetime_value > 0 ||
            reportData.lifetime_value_stats.avg_visits > 0) && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Avg Lifetime Value</div>
                    <div className="text-xl font-semibold text-foreground">
                      {safeMoney(reportData.lifetime_value_stats.avg_lifetime_value)}
                    </div>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                    <DollarSign className="h-5 w-5 text-foreground" />
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Avg Visits</div>
                    <div className="text-xl font-semibold text-foreground">
                      {formatNumber(reportData.lifetime_value_stats.avg_visits)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Top Customers Table */}
          <div className="rounded-xl border border-border bg-card">
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  Top Customers by Revenue
                </h3>
                <div className="text-xs text-muted-foreground">
                  Showing {reportData.top_customers.length} customers
                </div>
              </div>
            </div>

            {reportData.top_customers.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/40 border-b border-border">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs text-muted-foreground font-medium">
                        #
                      </th>
                      <th className="px-4 py-2 text-left text-xs text-muted-foreground font-medium">
                        Customer
                      </th>
                      <th className="px-4 py-2 text-left text-xs text-muted-foreground font-medium">
                        Contact
                      </th>
                      <th className="px-4 py-2 text-right text-xs text-muted-foreground font-medium">
                        Total Revenue
                      </th>
                      <th className="px-4 py-2 text-right text-xs text-muted-foreground font-medium">
                        Orders
                      </th>
                      <th className="px-4 py-2 text-right text-xs text-muted-foreground font-medium">
                        Avg Order Value
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.top_customers.map((customer, index) => (
                      <tr
                        key={customer.customer_id}
                        className="border-b border-border/60 hover:bg-muted/20"
                      >
                        <td className="px-4 py-2 text-muted-foreground">{index + 1}</td>
                        <td className="px-4 py-2">
                          <div className="font-medium text-foreground">
                            {customer.customer_name}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <div className="text-xs text-muted-foreground">
                            {customer.email && <div>{customer.email}</div>}
                            {customer.phone && <div>{customer.phone}</div>}
                            {!customer.email && !customer.phone && <div>—</div>}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right text-foreground font-medium">
                          {safeMoney(customer.total_revenue)}
                        </td>
                        <td className="px-4 py-2 text-right text-foreground">
                          {formatNumber(customer.sale_count)}
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {safeMoney(customer.avg_order_value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                No customers found for the selected period
              </div>
            )}
          </div>
        </>
      )}

      {/* Empty State */}
      {!isLoading && !error && !reportData && (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">
            No customer data available for the selected period
          </p>
        </div>
      )}
    </div>
  );
}

