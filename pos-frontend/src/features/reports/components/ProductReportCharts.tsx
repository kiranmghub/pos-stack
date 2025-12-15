// pos-frontend/src/features/reports/components/ProductReportCharts.tsx
import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import { useMoney, type CurrencyInfo } from "@/features/sales/useMoney";

interface ProductData {
  variant_id: number;
  variant_name: string;
  sku: string;
  product_id: number;
  product_name: string;
  product_code: string;
  category: string;
  revenue: number;
  quantity_sold: number;
  transaction_count: number;
  avg_price: number;
  avg_unit_price: number;
}

interface ProductReportChartsProps {
  topByRevenue: ProductData[];
  topByQuantity: ProductData[];
  categoryBreakdown?: Array<{ name: string; revenue: number; quantity: number }>;
  trendData?: Array<{ date: string; revenue: number; quantity: number }>;
  currency?: CurrencyInfo;
}

/**
 * Product Report Charts Component
 * Displays top products by revenue and quantity using bar charts
 */
export function ProductReportCharts({
  topByRevenue,
  topByQuantity,
  categoryBreakdown,
  trendData,
  currency,
}: ProductReportChartsProps) {
  const defaultCurrency: CurrencyInfo = { code: "USD", symbol: "$", precision: 2 };
  const currencyInfo = currency || defaultCurrency;
  const { safeMoney } = useMoney(currencyInfo);

  // Prepare chart data - truncate product names for display
  const prepareChartData = (products: ProductData[]) => {
    return products.map((product) => ({
      ...product,
      displayName: product.product_name.length > 20
        ? `${product.product_name.substring(0, 20)}...`
        : product.product_name,
    }));
  };

  const revenueData = prepareChartData(topByRevenue);
  const quantityData = prepareChartData(topByQuantity);

  // Format number for Y-axis
  const formatNumber = (value: number) => {
    return new Intl.NumberFormat("en-US").format(value);
  };

  // Get currency symbol for Y-axis labels
  const currencySymbol = currencyInfo.symbol || currencyInfo.code || "$";
  const yAxisRevenueFormatter = (value: number) => {
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
              {entry.name}:{" "}
              {entry.dataKey === "revenue" || entry.dataKey === "avg_price"
                ? safeMoney(entry.value)
                : formatNumber(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const categoryData = (categoryBreakdown || []).map((category) => ({
    ...category,
    displayName: category.name.length > 24 ? `${category.name.substring(0, 24)}...` : category.name,
  }));
  const CATEGORY_COLORS = ["#6366f1", "#ec4899", "#10b981", "#f97316", "#14b8a6", "#8b5cf6", "#ef4444"];

  const trendSeries = (trendData || []).map((trend) => {
    const dateObj = new Date(trend.date);
    return {
      ...trend,
      displayDate: dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    };
  });

  if (
    topByRevenue.length === 0 &&
    topByQuantity.length === 0 &&
    categoryData.length === 0 &&
    trendSeries.length === 0
  ) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-muted-foreground">No chart data available</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Top Products by Revenue */}
      {topByRevenue.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Top Products by Revenue
          </h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={revenueData}
                layout="vertical"
                margin={{ left: 0, right: 10, top: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis
                  type="number"
                  tickFormatter={yAxisRevenueFormatter}
                  tick={{ fill: "#9aa4b2", fontSize: 11 }}
                />
                <YAxis
                  type="category"
                  dataKey="displayName"
                  tick={{ fill: "#9aa4b2", fontSize: 11 }}
                  width={150}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Top Products by Quantity */}
      {topByQuantity.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Top Products by Quantity
          </h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={quantityData}
                layout="vertical"
                margin={{ left: 0, right: 10, top: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis
                  type="number"
                  tick={{ fill: "#9aa4b2", fontSize: 11 }}
                />
                <YAxis
                  type="category"
                  dataKey="displayName"
                  tick={{ fill: "#9aa4b2", fontSize: 11 }}
                  width={150}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="quantity_sold" name="Quantity" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {categoryData.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Revenue by Category
          </h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  dataKey="revenue"
                  nameKey="displayName"
                  cx="50%"
                  cy="50%"
                  outerRadius={110}
                  label={({ displayName, percent }) => `${displayName} ${(percent * 100).toFixed(0)}%`}
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={entry.name} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string) =>
                    name === "revenue" ? safeMoney(value) : formatNumber(value)
                  }
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {trendSeries.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Product Revenue Trend
          </h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendSeries} margin={{ left: 0, right: 20, top: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="displayDate" tick={{ fill: "#9aa4b2", fontSize: 11 }} />
                <YAxis
                  yAxisId="left"
                  tickFormatter={yAxisRevenueFormatter}
                  tick={{ fill: "#9aa4b2", fontSize: 11 }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickFormatter={(value) => formatNumber(value)}
                  tick={{ fill: "#9aa4b2", fontSize: 11 }}
                />
                <Tooltip
                  formatter={(value: number, name: string) =>
                    name === "Revenue" ? safeMoney(value) : formatNumber(value)
                  }
                />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="revenue"
                  name="Revenue"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="quantity"
                  name="Quantity"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
