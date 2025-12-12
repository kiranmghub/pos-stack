// pos-frontend/src/features/reports/tabs/EmployeeReportsTab.tsx
import React, { useState, useEffect } from "react";
import { Users, TrendingUp, DollarSign, RefreshCw, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useEmployeePerformanceReport } from "../hooks/useReports";
import { ReportFilters } from "../components/ReportFilters";
import { getMyStores, type StoreLite } from "@/features/pos/api";
import { cn } from "@/lib/utils";
import { useMoney, type CurrencyInfo } from "@/features/sales/useMoney";

interface EmployeeReportsTabProps {
  storeId: string;
  setStoreId: (value: string) => void;
  dateFrom: string;
  setDateFrom: (value: string) => void;
  dateTo: string;
  setDateTo: (value: string) => void;
}

/**
 * Employee Reports Tab Component
 * Displays employee performance including sales by cashier, transaction counts, and return rates
 */
export function EmployeeReportsTab({
  storeId,
  setStoreId,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
}: EmployeeReportsTabProps) {
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

  // Fetch employee performance report
  const {
    data: reportData,
    isLoading,
    error,
  } = useEmployeePerformanceReport(
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
          <p className="text-muted-foreground">Loading employee performance report...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-error">Error loading employee report: {error.message}</p>
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
            {/* Total Employees */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Total Employees</div>
                  <div className="text-2xl font-semibold text-foreground">
                    {formatNumber(reportData.summary.total_employees)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Active cashiers
                  </div>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  <Users className="h-5 w-5 text-foreground" />
                </div>
              </div>
            </div>

            {/* Total Transactions */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Total Transactions</div>
                  <div className="text-2xl font-semibold text-foreground">
                    {formatNumber(reportData.summary.total_transactions)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Completed sales
                  </div>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  <TrendingUp className="h-5 w-5 text-foreground" />
                </div>
              </div>
            </div>

            {/* Total Returns */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Total Returns</div>
                  <div className="text-2xl font-semibold text-foreground">
                    {formatNumber(reportData.summary.total_returns)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Return transactions
                  </div>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  <RefreshCw className="h-5 w-5 text-foreground" />
                </div>
              </div>
            </div>

            {/* Overall Return Rate */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Return Rate</div>
                  <div className="text-2xl font-semibold text-foreground">
                    {formatPercentage(reportData.summary.overall_return_rate)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Overall rate
                  </div>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  {reportData.summary.overall_return_rate > 5 ? (
                    <ArrowDownRight className="h-5 w-5 text-error" />
                  ) : (
                    <ArrowUpRight className="h-5 w-5 text-success" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Top Employees Table */}
          <div className="rounded-xl border border-border bg-card">
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  Top Employees by Revenue
                </h3>
                <div className="text-xs text-muted-foreground">
                  Showing {reportData.top_employees.length} employees
                </div>
              </div>
            </div>

            {reportData.top_employees.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/40 border-b border-border">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs text-muted-foreground font-medium">
                        #
                      </th>
                      <th className="px-4 py-2 text-left text-xs text-muted-foreground font-medium">
                        Employee
                      </th>
                      <th className="px-4 py-2 text-right text-xs text-muted-foreground font-medium">
                        Total Revenue
                      </th>
                      <th className="px-4 py-2 text-right text-xs text-muted-foreground font-medium">
                        Transactions
                      </th>
                      <th className="px-4 py-2 text-right text-xs text-muted-foreground font-medium">
                        Avg Value
                      </th>
                      <th className="px-4 py-2 text-right text-xs text-muted-foreground font-medium">
                        Returns
                      </th>
                      <th className="px-4 py-2 text-right text-xs text-muted-foreground font-medium">
                        Return Rate
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.top_employees.map((employee, index) => (
                      <tr
                        key={employee.employee_id}
                        className="border-b border-border/60 hover:bg-muted/20"
                      >
                        <td className="px-4 py-2 text-muted-foreground">{index + 1}</td>
                        <td className="px-4 py-2">
                          <div>
                            <div className="font-medium text-foreground">
                              {employee.employee_name}
                            </div>
                            {employee.username && (
                              <div className="text-xs text-muted-foreground">
                                @{employee.username}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right text-foreground font-medium">
                          {safeMoney(employee.total_revenue)}
                        </td>
                        <td className="px-4 py-2 text-right text-foreground">
                          {formatNumber(employee.transaction_count)}
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {safeMoney(employee.avg_transaction_value)}
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {formatNumber(employee.return_count)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span
                            className={cn(
                              "font-medium",
                              employee.return_rate > 5 ? "text-error" : "text-success"
                            )}
                          >
                            {formatPercentage(employee.return_rate)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                No employees found for the selected period
              </div>
            )}
          </div>
        </>
      )}

      {/* Empty State */}
      {!isLoading && !error && !reportData && (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">
            No employee data available for the selected period
          </p>
        </div>
      )}
    </div>
  );
}

