// pos-frontend/src/features/reports/tabs/FinancialReportsTab.tsx
import React, { useState, useEffect } from "react";
import { DollarSign, TrendingDown, Percent, CreditCard, Receipt } from "lucide-react";
import { useFinancialSummaryReport } from "../hooks/useReports";
import { ReportFilters } from "../components/ReportFilters";
import { FinancialReportCharts } from "../components/FinancialReportCharts";
import { getMyStores, type StoreLite } from "@/features/pos/api";
import { cn } from "@/lib/utils";
import { useMoney, type CurrencyInfo } from "@/features/sales/useMoney";

interface FinancialReportsTabProps {
  storeId: string;
  setStoreId: (value: string) => void;
  dateFrom: string;
  setDateFrom: (value: string) => void;
  dateTo: string;
  setDateTo: (value: string) => void;
}

/**
 * Financial Reports Tab Component
 * Displays financial summary including revenue, discounts, taxes, and payment methods
 */
export function FinancialReportsTab({
  storeId,
  setStoreId,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
}: FinancialReportsTabProps) {
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

  // Fetch financial summary report
  const {
    data: reportData,
    isLoading,
    error,
  } = useFinancialSummaryReport(
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

  // Format number
  const formatNumber = (value: number) => {
    return new Intl.NumberFormat("en-US").format(value);
  };

  // Format percentage
  const formatPercentage = (value: number) => {
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
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

      {/* Loading State */}
      {isLoading && (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">Loading financial report...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-error">Error loading financial report: {error.message}</p>
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
            {/* Total Revenue */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Total Revenue</div>
                  <div className="text-2xl font-semibold text-foreground">
                    {safeMoney(reportData.summary.total_revenue)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {formatNumber(reportData.summary.sale_count)} sales
                  </div>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  <DollarSign className="h-5 w-5 text-foreground" />
                </div>
              </div>
            </div>

            {/* Net Revenue */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Net Revenue</div>
                  <div className="text-2xl font-semibold text-foreground">
                    {safeMoney(reportData.summary.net_revenue)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    After discounts
                  </div>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  <TrendingDown className="h-5 w-5 text-foreground" />
                </div>
              </div>
            </div>

            {/* Total Discounts */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Total Discounts</div>
                  <div className="text-2xl font-semibold text-foreground">
                    {safeMoney(reportData.summary.total_discounts)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {formatPercentage(reportData.summary.discount_percentage)} of revenue
                  </div>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  <Percent className="h-5 w-5 text-foreground" />
                </div>
              </div>
            </div>

            {/* Total Taxes */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Total Taxes</div>
                  <div className="text-2xl font-semibold text-foreground">
                    {safeMoney(reportData.summary.total_taxes)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {formatPercentage(reportData.summary.tax_percentage)} of revenue
                  </div>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  <Receipt className="h-5 w-5 text-foreground" />
                </div>
              </div>
            </div>
          </div>

          {/* Additional Summary Cards */}
          {reportData.summary.total_fees > 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Total Fees</div>
                    <div className="text-xl font-semibold text-foreground">
                      {safeMoney(reportData.summary.total_fees)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Charts */}
          <FinancialReportCharts
            paymentMethods={reportData.payment_methods}
            discountRules={reportData.discount_rules.slice(0, 10)}
            taxRules={reportData.tax_rules.slice(0, 10)}
            currency={currency}
          />

          {/* Discount Rules Table */}
          {reportData.discount_rules.length > 0 && (
            <div className="rounded-xl border border-border bg-card">
              <div className="p-4 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">
                  Discount Rules Breakdown
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/40 border-b border-border">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs text-muted-foreground font-medium">
                        Code
                      </th>
                      <th className="px-4 py-2 text-left text-xs text-muted-foreground font-medium">
                        Name
                      </th>
                      <th className="px-4 py-2 text-right text-xs text-muted-foreground font-medium">
                        Total Discount
                      </th>
                      <th className="px-4 py-2 text-right text-xs text-muted-foreground font-medium">
                        Sales Count
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.discount_rules.map((rule, index) => (
                      <tr
                        key={rule.code}
                        className="border-b border-border/60 hover:bg-muted/20"
                      >
                        <td className="px-4 py-2 font-mono text-xs text-foreground">
                          {rule.code}
                        </td>
                        <td className="px-4 py-2 text-foreground">{rule.name}</td>
                        <td className="px-4 py-2 text-right text-foreground font-medium">
                          {safeMoney(rule.total_amount)}
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {formatNumber(rule.sales_count)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tax Rules Table */}
          {reportData.tax_rules.length > 0 && (
            <div className="rounded-xl border border-border bg-card">
              <div className="p-4 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">
                  Tax Rules Breakdown
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/40 border-b border-border">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs text-muted-foreground font-medium">
                        Code
                      </th>
                      <th className="px-4 py-2 text-left text-xs text-muted-foreground font-medium">
                        Name
                      </th>
                      <th className="px-4 py-2 text-right text-xs text-muted-foreground font-medium">
                        Total Tax
                      </th>
                      <th className="px-4 py-2 text-right text-xs text-muted-foreground font-medium">
                        Sales Count
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.tax_rules.map((rule) => (
                      <tr
                        key={rule.code}
                        className="border-b border-border/60 hover:bg-muted/20"
                      >
                        <td className="px-4 py-2 font-mono text-xs text-foreground">
                          {rule.code}
                        </td>
                        <td className="px-4 py-2 text-foreground">{rule.name}</td>
                        <td className="px-4 py-2 text-right text-foreground font-medium">
                          {safeMoney(rule.tax_amount)}
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {formatNumber(rule.sales_count)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Empty State */}
      {!isLoading && !error && !reportData && (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">
            No financial data available for the selected period
          </p>
        </div>
      )}
    </div>
  );
}

