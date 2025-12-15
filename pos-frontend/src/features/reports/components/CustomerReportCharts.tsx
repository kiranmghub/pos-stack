// pos-frontend/src/features/reports/components/CustomerReportCharts.tsx
import React from "react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useMoney, type CurrencyInfo } from "@/features/sales/useMoney";
import type { CustomerAnalyticsReport } from "../api/reports";

interface CustomerReportChartsProps {
  topCustomers: CustomerAnalyticsReport["top_customers"];
  summary: CustomerAnalyticsReport["summary"];
  trendData?: Array<{
    date: string;
    new_customers: number;
    returning_customers: number;
    sales_with_customers: number;
    sales_without_customers: number;
  }>;
  currency?: CurrencyInfo;
}

const SEGMENT_COLORS = ["#3b82f6", "#10b981", "#f59e0b"];

/**
 * Customer report charts showing top customers, segment mix, and acquisition trend.
 */
export function CustomerReportCharts({
  topCustomers,
  summary,
  trendData,
  currency,
}: CustomerReportChartsProps) {
  const currencyInfo: CurrencyInfo = currency || { code: "USD", symbol: "$", precision: 2 };
  const { safeMoney } = useMoney(currencyInfo);

  const topCustomerData = (topCustomers || []).slice(0, 10).map((customer) => ({
    ...customer,
    displayName:
      customer.customer_name && customer.customer_name.length > 22
        ? `${customer.customer_name.substring(0, 22)}…`
        : customer.customer_name || "Unknown",
  }));

  const segmentData = [
    { name: "New", value: summary?.new_customers || 0 },
    { name: "Returning", value: summary?.returning_customers || 0 },
    {
      name: "Repeat Purchasers",
      value: summary?.repeat_customers ?? 0,
    },
  ].filter((segment) => segment.value > 0);

  const trendSeries = (trendData || []).map((point) => {
    const dateObj = new Date(point.date);
    return {
      ...point,
      displayDate: dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    };
  });

  if (
    topCustomerData.length === 0 &&
    segmentData.length === 0 &&
    trendSeries.length === 0
  ) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-muted-foreground">No customer chart data available</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Top customers revenue */}
      {topCustomerData.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Top Customers by Revenue
          </h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topCustomerData}
                layout="vertical"
                margin={{ left: 0, right: 10, top: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis
                  type="number"
                  tickFormatter={(value) => safeMoney(Number(value))}
                  tick={{ fill: "#9aa4b2", fontSize: 11 }}
                />
                <YAxis
                  type="category"
                  dataKey="displayName"
                  tick={{ fill: "#9aa4b2", fontSize: 11 }}
                  width={160}
                />
                <Tooltip formatter={(value: number) => safeMoney(Number(value))} />
                <Bar dataKey="total_revenue" name="Revenue" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Segment pie */}
      {segmentData.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Customer Mix
          </h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={segmentData}
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  outerRadius={105}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                >
                  {segmentData.map((segment, index) => (
                    <Cell
                      key={segment.name}
                      fill={SEGMENT_COLORS[index % SEGMENT_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string) =>
                    [`${value}`, name]
                  }
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Trend line */}
      {trendSeries.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            New vs Returning Customers Trend
          </h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendSeries} margin={{ left: 0, right: 20, top: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="displayDate" tick={{ fill: "#9aa4b2", fontSize: 11 }} />
                <YAxis
                  yAxisId="left"
                  tick={{ fill: "#9aa4b2", fontSize: 11 }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: "#9aa4b2", fontSize: 11 }}
                />
                <Tooltip />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="new_customers"
                  name="New Customers"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="returning_customers"
                  name="Returning Customers"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="sales_with_customers"
                  name="Sales w/ Customer"
                  stroke="#f97316"
                  strokeDasharray="4 4"
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
