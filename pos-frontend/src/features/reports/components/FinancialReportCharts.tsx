// pos-frontend/src/features/reports/components/FinancialReportCharts.tsx
import React from "react";
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
} from "recharts";
import { useMoney, type CurrencyInfo } from "@/features/sales/useMoney";

interface PaymentMethod {
  method: string;
  total_amount: number;
  payment_count: number;
}

interface DiscountRule {
  code: string;
  name: string;
  total_amount: number;
  sales_count: number;
}

interface TaxRule {
  code: string;
  name: string;
  tax_amount: number;
  sales_count: number;
}

interface FinancialReportChartsProps {
  paymentMethods: PaymentMethod[];
  discountRules: DiscountRule[];
  taxRules: TaxRule[];
  currency?: CurrencyInfo;
}

const COLORS = {
  payment: ["#3b82f6", "#10b981", "#f59e0b"], // Blue, Green, Amber
  discount: "#ef4444", // Red
  tax: "#8b5cf6", // Purple
};

/**
 * Financial Report Charts Component
 * Displays payment methods (pie), discount rules (bar), and tax rules (bar) charts
 */
export function FinancialReportCharts({
  paymentMethods,
  discountRules,
  taxRules,
  currency,
}: FinancialReportChartsProps) {
  const defaultCurrency: CurrencyInfo = { code: "USD", symbol: "$", precision: 2 };
  const currencyInfo = currency || defaultCurrency;
  const { safeMoney } = useMoney(currencyInfo);

  // Format number for Y-axis
  const formatNumber = (value: number) => {
    return new Intl.NumberFormat("en-US").format(value);
  };

  // Get currency symbol for Y-axis labels
  const currencySymbol = currencyInfo.symbol || currencyInfo.code || "$";
  const yAxisFormatter = (value: number) => {
    const num = Math.round(value / 1000);
    return `${currencySymbol}${num}k`;
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
          <p className="text-sm font-medium text-foreground mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-xs" style={{ color: entry.color }}>
              {entry.name}: {safeMoney(entry.value)}
              {entry.payload.payment_count && (
                <span className="ml-2 text-muted-foreground">
                  ({formatNumber(entry.payload.payment_count)} payments)
                </span>
              )}
              {entry.payload.sales_count && (
                <span className="ml-2 text-muted-foreground">
                  ({formatNumber(entry.payload.sales_count)} sales)
                </span>
              )}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Prepare payment methods data for pie chart
  const paymentData = paymentMethods.map((item, index) => ({
    name: item.method,
    value: item.total_amount,
    payment_count: item.payment_count,
    fill: COLORS.payment[index % COLORS.payment.length],
  }));

  // Prepare discount rules data (truncate names for display)
  const discountData = discountRules.map((rule) => ({
    code: rule.code,
    name: rule.name.length > 20 ? `${rule.name.substring(0, 20)}...` : rule.name,
    amount: rule.total_amount,
    sales_count: rule.sales_count,
  }));

  // Prepare tax rules data (truncate names for display)
  const taxData = taxRules.map((rule) => ({
    code: rule.code,
    name: rule.name.length > 20 ? `${rule.name.substring(0, 20)}...` : rule.name,
    amount: rule.tax_amount,
    sales_count: rule.sales_count,
  }));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Payment Methods Pie Chart */}
      {paymentMethods.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Payment Methods
          </h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={paymentData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {paymentData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Discount Rules Bar Chart */}
      {discountRules.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Top Discount Rules
          </h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={discountData}
                layout="vertical"
                margin={{ left: 0, right: 10, top: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis
                  type="number"
                  tickFormatter={yAxisFormatter}
                  tick={{ fill: "#9aa4b2", fontSize: 11 }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: "#9aa4b2", fontSize: 11 }}
                  width={150}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="amount" name="Discount" fill={COLORS.discount} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Tax Rules Bar Chart */}
      {taxRules.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Top Tax Rules
          </h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={taxData}
                layout="vertical"
                margin={{ left: 0, right: 10, top: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis
                  type="number"
                  tickFormatter={yAxisFormatter}
                  tick={{ fill: "#9aa4b2", fontSize: 11 }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: "#9aa4b2", fontSize: 11 }}
                  width={150}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="amount" name="Tax" fill={COLORS.tax} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

