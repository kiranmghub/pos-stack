// pos-frontend/src/features/inventory/planning/health/HealthSummary.tsx
import React from "react";
import { InventoryHealthSummary } from "../../api/health";
import { KpiCard } from "../../components/KpiCard";
import { ChartCard } from "../../components/ChartCard";
import { TrendingUp, TrendingDown, Package, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

export interface HealthSummaryProps {
  /** Health summary data */
  summary: InventoryHealthSummary;
  /** Custom className */
  className?: string;
}

/**
 * HealthSummary - Overall inventory health summary with KPIs and charts
 * Security: All data is tenant-scoped from the API
 */
export function HealthSummary({ summary, className }: HealthSummaryProps) {
  const { shrinkage, aging, coverage } = summary;

  // Calculate health score (0-100)
  // Higher is better: lower shrinkage, lower aging value, higher coverage
  const healthScore = React.useMemo(() => {
    // Coverage score (0-40 points)
    const coverageScore = (coverage.coverage_percentage / 100) * 40;

    // Shrinkage score (0-30 points) - inverse relationship
    // Assume 0 shrinkage = 30 points, scale down based on total_shrinkage
    // This is a simplified calculation - in production, you'd want more sophisticated scoring
    const shrinkageScore = Math.max(0, 30 - (shrinkage.total_shrinkage / 100) * 30);

    // Aging score (0-30 points) - inverse relationship
    // Assume 0 aging value = 30 points, scale down based on total_aging_value
    // This is a simplified calculation
    const agingScore = Math.max(0, 30 - (aging.total_aging_value / 10000) * 30);

    return Math.round(coverageScore + shrinkageScore + agingScore);
  }, [shrinkage, aging, coverage]);

  const healthColor =
    healthScore >= 80
      ? "text-badge-success-text"
      : healthScore >= 60
      ? "text-badge-warning-text"
      : "text-badge-error-text";

  const healthIcon =
    healthScore >= 80 ? (
      <CheckCircle2 className="h-5 w-5 text-badge-success-text" />
    ) : healthScore >= 60 ? (
      <AlertTriangle className="h-5 w-5 text-badge-warning-text" />
    ) : (
      <AlertTriangle className="h-5 w-5 text-badge-error-text" />
    );

  // Prepare data for charts
  const shrinkageByReasonData = shrinkage.shrinkage_by_reason.map((reason) => ({
    name: reason.name,
    quantity: reason.quantity,
    count: reason.count,
  }));

  const agingByCategoryData = aging.aging_by_category.map((category) => ({
    name: category.category_name,
    value: category.total_value,
    quantity: category.total_quantity,
    variants: category.variant_count,
  }));

  const COLORS = [
    "hsl(var(--primary))",
    "hsl(var(--secondary))",
    "hsl(var(--accent))",
    "hsl(var(--muted-foreground))",
  ];

  return (
    <div className={cn("space-y-6", className)}>
      {/* Health Score */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Overall Health Score</h3>
            <p className="text-sm text-muted-foreground">
              Based on shrinkage, aging, and coverage metrics
            </p>
          </div>
          {healthIcon}
        </div>
        <div className="flex items-center gap-4">
          <div className={cn("text-5xl font-bold", healthColor)}>{healthScore}</div>
          <div className="flex-1">
            <div className="w-full h-4 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all",
                  healthScore >= 80
                    ? "bg-badge-success-bg"
                    : healthScore >= 60
                    ? "bg-badge-warning-bg"
                    : "bg-badge-error-bg"
                )}
                style={{ width: `${healthScore}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {healthScore >= 80
                ? "Excellent"
                : healthScore >= 60
                ? "Good"
                : healthScore >= 40
                ? "Fair"
                : "Needs Attention"}
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          title="Total Shrinkage"
          value={shrinkage.total_shrinkage.toString()}
          subtitle={`Over ${shrinkage.period_days} days`}
        />
        <KpiCard
          title="Aging Inventory Value"
          value={`$${aging.total_aging_value.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
          subtitle={`${aging.variant_count} variants`}
        />
        <KpiCard
          title="Count Coverage"
          value={`${coverage.coverage_percentage.toFixed(1)}%`}
          subtitle={`${coverage.counted_variants} of ${coverage.total_variants} variants`}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Shrinkage by Reason */}
        {shrinkageByReasonData.length > 0 && (
          <ChartCard title="Shrinkage by Reason" subtitle={`Last ${shrinkage.period_days} days`}>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={shrinkageByReasonData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="name"
                    stroke="hsl(var(--muted-foreground))"
                    style={{ fontSize: "12px" }}
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" style={{ fontSize: "12px" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                    }}
                  />
                  <Bar dataKey="quantity" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        )}

        {/* Aging by Category */}
        {agingByCategoryData.length > 0 && (
          <ChartCard
            title="Aging Inventory by Category"
            subtitle={`${aging.days_no_sales} days without sales`}
          >
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={agingByCategoryData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {agingByCategoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        )}
      </div>
    </div>
  );
}

