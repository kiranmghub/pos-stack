// pos-frontend/src/features/reports/components/SalesReportCharts.tsx
import React from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useMoney, type CurrencyInfo } from "@/features/sales/useMoney";

interface TimeSeriesData {
  date: string;
  revenue: number;
  orders: number;
  aov: number;
}

interface SalesReportChartsProps {
  timeSeries: TimeSeriesData[];
  groupBy?: "day" | "week" | "month";
  currency?: CurrencyInfo;
}

/**
 * Sales Report Charts Component
 * Displays revenue, orders, and AOV trends using recharts
 */
export function SalesReportCharts({ timeSeries, groupBy = "day", currency }: SalesReportChartsProps) {
  const defaultCurrency: CurrencyInfo = { code: "USD", symbol: "$", precision: 2 };
  const currencyInfo = currency || defaultCurrency;
  const { safeMoney } = useMoney(currencyInfo);

  if (!timeSeries || timeSeries.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-muted-foreground">No chart data available</p>
      </div>
    );
  }

  // Format date labels based on group_by
  // CRITICAL: Parse date strings as local dates, not UTC
  // Backend sends dates as "YYYY-MM-DD" strings representing tenant timezone dates
  // We need to parse them as local dates to avoid timezone shifts
  const formatDateLabel = (dateStr: string) => {
    if (groupBy === "month") {
      // Format: "Jan 2024"
      // Parse "YYYY-MM" by adding "-01" and parsing as local date
      const parts = dateStr.split("-");
      if (parts.length === 2) {
        const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
        return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      }
      // Fallback for any other format
      const date = new Date(dateStr + "-01");
      return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    } else if (groupBy === "week") {
      // Format: "Jan 15" (week start date)
      // Parse "YYYY-MM-DD" as local date components (not UTC)
      const parts = dateStr.split("-");
      if (parts.length === 3) {
        const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      }
      // Fallback
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } else {
      // Format: "Jan 15" for daily
      // Parse "YYYY-MM-DD" as local date components (not UTC) to avoid day shift
      const parts = dateStr.split("-");
      if (parts.length === 3) {
        const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      }
      // Fallback for any other format
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
  };

  const chartData = timeSeries.map((item) => ({
    ...item,
    dateLabel: formatDateLabel(item.date),
  }));

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat("en-US").format(value);
  };

  // Get currency symbol for Y-axis compact formatting
  const getCurrencySymbol = () => {
    if (currencyInfo.symbol) return currencyInfo.symbol;
    // Fallback: try to get symbol from currency code
    try {
      const formatter = new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currencyInfo.code || "USD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
      return formatter.format(0).replace(/[\d\s.,]/g, "");
    } catch {
      return currencyInfo.code || "USD";
    }
  };

  const currencySymbol = getCurrencySymbol();

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
          <p className="text-sm font-medium text-foreground mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-xs" style={{ color: entry.color }}>
              {entry.name}: {entry.name.includes("Revenue") || entry.name.includes("AOV") ? safeMoney(entry.value) : formatNumber(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Revenue Trend - Line Chart */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground mb-4">Revenue Trend</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ left: 0, right: 10, top: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis
                dataKey="dateLabel"
                tick={{ fill: "#9aa4b2", fontSize: 11 }}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tickFormatter={(v) => {
                  // Compact display: "{symbol}10k" format
                  const num = Math.round(v / 1000);
                  return `${currencySymbol}${num}k`;
                }}
                tick={{ fill: "#9aa4b2", fontSize: 11 }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="revenue"
                name="Revenue"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: "#3b82f6", r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Orders Trend - Bar Chart */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground mb-4">Orders</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ left: 0, right: 10, top: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis
                dataKey="dateLabel"
                tick={{ fill: "#9aa4b2", fontSize: 11 }}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis tick={{ fill: "#9aa4b2", fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="orders" name="Orders" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Average Order Value - Area Chart */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground mb-4">Average Order Value</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ left: 0, right: 10, top: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="colorAOV" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis
                dataKey="dateLabel"
                tick={{ fill: "#9aa4b2", fontSize: 11 }}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tickFormatter={(v) => safeMoney(v)}
                tick={{ fill: "#9aa4b2", fontSize: 11 }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="aov"
                name="AOV"
                stroke="#8b5cf6"
                fillOpacity={1}
                fill="url(#colorAOV)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

