// pos-frontend/src/features/reports/components/EmployeeReportCharts.tsx
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
  LineChart,
  Line,
} from "recharts";
import { useMoney, type CurrencyInfo } from "@/features/sales/useMoney";
import type { EmployeePerformanceReport } from "../api/reports";

interface EmployeeReportChartsProps {
  topEmployees: EmployeePerformanceReport["top_employees"];
  trendData?: Array<{
    date: string;
    total_revenue: number;
    transaction_count: number;
    return_count: number;
  }>;
  currency?: CurrencyInfo;
}

/**
 * Employee report charts showing revenue leaders, transaction volume, and trend lines.
 */
export function EmployeeReportCharts({
  topEmployees,
  trendData,
  currency,
}: EmployeeReportChartsProps) {
  const currencyInfo: CurrencyInfo = currency || { code: "USD", symbol: "$", precision: 2 };
  const { safeMoney } = useMoney(currencyInfo);

  const topEmployeesData = (topEmployees || []).slice(0, 10).map((employee) => ({
    ...employee,
    displayName:
      employee.employee_name && employee.employee_name.length > 22
        ? `${employee.employee_name.substring(0, 22)}…`
        : employee.employee_name || "Unknown",
  }));

  const trendSeries = (trendData || []).map((point) => {
    const dateObj = new Date(point.date);
    return {
      ...point,
      displayDate: dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    };
  });

  if (topEmployeesData.length === 0 && trendSeries.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-muted-foreground">No employee chart data available</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Revenue leaders */}
      {topEmployeesData.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Revenue by Employee
          </h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topEmployeesData}
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

      {/* Transaction volume */}
      {topEmployeesData.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Transactions by Employee
          </h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topEmployeesData}
                layout="vertical"
                margin={{ left: 0, right: 10, top: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis
                  type="number"
                  tickFormatter={(value) => `${value}`}
                  tick={{ fill: "#9aa4b2", fontSize: 11 }}
                />
                <YAxis
                  type="category"
                  dataKey="displayName"
                  tick={{ fill: "#9aa4b2", fontSize: 11 }}
                  width={160}
                />
                <Tooltip />
                <Bar dataKey="transaction_count" name="Transactions" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Trend chart */}
      {trendSeries.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Revenue & Returns Trend
          </h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendSeries} margin={{ left: 0, right: 20, top: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="displayDate" tick={{ fill: "#9aa4b2", fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fill: "#9aa4b2", fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: "#9aa4b2", fontSize: 11 }} />
                <Tooltip
                  formatter={(value: number, name: string) =>
                    name === "Revenue" ? safeMoney(Number(value)) : `${value}`
                  }
                />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="total_revenue"
                  name="Revenue"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="transaction_count"
                  name="Transactions"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="return_count"
                  name="Returns"
                  stroke="#ef4444"
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
