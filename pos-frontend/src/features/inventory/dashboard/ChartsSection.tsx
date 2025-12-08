// pos-frontend/src/features/inventory/dashboard/ChartsSection.tsx
import React, { useMemo } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ChartCard } from "../components/ChartCard";
import { useLedgerList } from "../hooks/useLedger";
import { subDays, format, parseISO, startOfDay, endOfDay } from "date-fns";
import { TrendingUp, Activity } from "lucide-react";
import { LoadingSkeleton } from "../components/LoadingSkeleton";

export interface ChartsSectionProps {
  /** Selected store ID (null = "All Stores") */
  storeId?: number | null;
  /** Currency info for formatting */
  currency?: {
    code: string;
    symbol?: string;
    precision?: number;
  };
}

// Color palette for charts (theme-aware)
const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

// Fallback colors if CSS variables not available
const FALLBACK_COLORS = [
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // purple
  "#06b6d4", // cyan
];

/**
 * ChartsSection - Displays stock value trend and movements by type charts
 * Security: All data is tenant-scoped via API
 */
export function ChartsSection({ storeId, currency }: ChartsSectionProps) {
  // Calculate date range (last 30 days)
  const dateTo = endOfDay(new Date());
  const dateFrom = startOfDay(subDays(new Date(), 30));

  // Fetch ledger data for the last 30 days
  const {
    data: ledgerData,
    isLoading: ledgerLoading,
    error: ledgerError,
  } = useLedgerList({
    store_id: storeId || null,
    date_from: dateFrom.toISOString(),
    date_to: dateTo.toISOString(),
    page_size: 1000, // Get more data for accurate charts
  });

  // Process data for stock value trend chart
  // Note: This shows daily movement activity as a trend indicator
  // A true stock value trend would require historical snapshots or complex calculation
  const stockValueTrendData = useMemo(() => {
    if (!ledgerData?.results) return [];

    // Group ledger entries by date and calculate daily metrics
    const dailyData: Record<string, { date: string; movements: number; positive: number; negative: number }> = {};

    ledgerData.results.forEach((entry) => {
      const date = format(parseISO(entry.created_at), "yyyy-MM-dd");
      if (!dailyData[date]) {
        dailyData[date] = { date, movements: 0, positive: 0, negative: 0 };
      }
      dailyData[date].movements += 1;
      if (entry.qty_delta > 0) {
        dailyData[date].positive += entry.qty_delta;
      } else {
        dailyData[date].negative += Math.abs(entry.qty_delta);
      }
    });

    // Convert to array and sort by date
    return Object.values(dailyData)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((item) => ({
        date: format(parseISO(item.date), "MMM dd"),
        movements: item.movements,
        in: item.positive,
        out: item.negative,
      }));
  }, [ledgerData]);

  // Process data for movements by type chart
  const movementsByTypeData = useMemo(() => {
    if (!ledgerData?.results) return [];

    // Aggregate by ref_type
    const typeCounts: Record<string, number> = {};

    ledgerData.results.forEach((entry) => {
      const refType = entry.ref_type || "UNKNOWN";
      typeCounts[refType] = (typeCounts[refType] || 0) + 1;
    });

    // Convert to array and format for chart
    return Object.entries(typeCounts)
      .map(([name, value]) => ({
        name: name.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
        value,
        count: value,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10); // Top 10 movement types
  }, [ledgerData]);

  const formatCurrency = (value: number) => {
    const symbol = currency?.symbol || currency?.code || "$";
    return `${symbol}${value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
          <p className="text-sm font-medium text-foreground mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (ledgerLoading) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <LoadingSkeleton variant="card" height={400} />
        <LoadingSkeleton variant="card" height={400} />
      </div>
    );
  }

  if (ledgerError) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard
          title="Stock Value Trend"
          subtitle="Last 30 days"
          error="Failed to load chart data"
        />
        <ChartCard
          title="Movements by Type"
          subtitle="Last 30 days"
          error="Failed to load chart data"
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Stock Value Trend Chart */}
      <ChartCard
        title="Stock Value Trend"
        subtitle="Last 30 days"
        loading={ledgerLoading}
        error={ledgerError ? "Failed to load data" : null}
      >
        {stockValueTrendData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={stockValueTrendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis
                dataKey="date"
                stroke="hsl(var(--muted-foreground))"
                style={{ fontSize: "12px" }}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                style={{ fontSize: "12px" }}
                label={{ value: "Movements", angle: -90, position: "insideLeft" }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line
                type="monotone"
                dataKey="movements"
                name="Daily Movements"
                stroke={CHART_COLORS[0] || FALLBACK_COLORS[0]}
                strokeWidth={2}
                dot={{ fill: CHART_COLORS[0] || FALLBACK_COLORS[0], r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="in"
                name="Stock In"
                stroke={CHART_COLORS[1] || FALLBACK_COLORS[1]}
                strokeWidth={2}
                dot={{ fill: CHART_COLORS[1] || FALLBACK_COLORS[1], r: 3 }}
                strokeDasharray="5 5"
              />
              <Line
                type="monotone"
                dataKey="out"
                name="Stock Out"
                stroke={CHART_COLORS[2] || FALLBACK_COLORS[2]}
                strokeWidth={2}
                dot={{ fill: CHART_COLORS[2] || FALLBACK_COLORS[2], r: 3 }}
                strokeDasharray="5 5"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">No data available for the selected period</p>
          </div>
        )}
      </ChartCard>

      {/* Movements by Type Chart */}
      <ChartCard
        title="Movements by Type"
        subtitle="Last 30 days"
        loading={ledgerLoading}
        error={ledgerError ? "Failed to load data" : null}
      >
        {movementsByTypeData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={movementsByTypeData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {movementsByTypeData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={CHART_COLORS[index % CHART_COLORS.length] || FALLBACK_COLORS[index % FALLBACK_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
                        <p className="text-sm font-medium text-foreground mb-1">{data.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Count: {data.count}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Percentage: {((data.value / ledgerData?.results.length) * 100).toFixed(1)}%
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                formatter={(value) => (
                  <span className="text-xs text-foreground">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Activity className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">No movement data available for the selected period</p>
          </div>
        )}
      </ChartCard>
    </div>
  );
}

