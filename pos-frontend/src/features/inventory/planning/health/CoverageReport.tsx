// pos-frontend/src/features/inventory/planning/health/CoverageReport.tsx
import React from "react";
import { CoverageReport as CoverageReportType } from "../../api/health";
import { ChartCard } from "../../components/ChartCard";
import { LoadingSkeleton, EmptyState } from "../../components";
import { CheckCircle2, Package, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

export interface CoverageReportProps {
  /** Coverage report data */
  report: CoverageReportType | null;
  /** Loading state */
  isLoading?: boolean;
  /** Custom className */
  className?: string;
}

/**
 * CoverageReport - Cycle count coverage analysis component
 * Security: All data is tenant-scoped from the API
 */
export function CoverageReport({
  report,
  isLoading = false,
  className,
}: CoverageReportProps) {
  if (isLoading) {
    return (
      <div className={className}>
        <LoadingSkeleton variant="card" height={400} />
      </div>
    );
  }

  if (!report) {
    return (
      <div className={className}>
        <EmptyState variant="empty" title="No coverage data" description="No coverage data available" />
      </div>
    );
  }

  const coverageColor =
    report.coverage_percentage >= 80
      ? "text-badge-success-text"
      : report.coverage_percentage >= 50
      ? "text-badge-warning-text"
      : "text-badge-error-text";

  const coverageBgColor =
    report.coverage_percentage >= 80
      ? "bg-badge-success-bg"
      : report.coverage_percentage >= 50
      ? "bg-badge-warning-bg"
      : "bg-badge-error-bg";

  // Prepare data for pie chart
  const pieData = [
    {
      name: "Counted",
      value: report.counted_variants,
      color: "hsl(var(--success))",
    },
    {
      name: "Not Counted",
      value: report.total_variants - report.counted_variants,
      color: "hsl(var(--muted))",
    },
  ];

  const COLORS = [pieData[0].color, pieData[1].color];

  return (
    <div className={className}>
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-5 w-5 text-badge-success-text" />
              <span className="text-sm font-medium text-muted-foreground">Coverage</span>
            </div>
            <div className={cn("text-2xl font-bold", coverageColor)}>
              {report.coverage_percentage.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">of catalog counted</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Package className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Counted Variants</span>
            </div>
            <div className="text-2xl font-bold text-foreground">
              {report.counted_variants}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              of {report.total_variants} total
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Count Sessions</span>
            </div>
            <div className="text-2xl font-bold text-foreground">
              {report.count_sessions}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              in last {report.period_days} days
            </div>
          </div>
        </div>

        {/* Coverage Visualization */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Coverage Percentage Card */}
          <div className="rounded-lg border border-border bg-card p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4">Coverage Progress</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Coverage</span>
                <span className={cn("text-lg font-bold", coverageColor)}>
                  {report.coverage_percentage.toFixed(1)}%
                </span>
              </div>
              <div className="w-full h-8 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn("h-full transition-all flex items-center justify-end pr-2", coverageBgColor)}
                  style={{ width: `${report.coverage_percentage}%` }}
                >
                  {report.coverage_percentage > 10 && (
                    <span className="text-xs font-medium text-foreground">
                      {report.coverage_percentage.toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                <div>
                  <div className="text-xs text-muted-foreground">Counted</div>
                  <div className="text-lg font-semibold text-badge-success-text">
                    {report.counted_variants}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Not Counted</div>
                  <div className="text-lg font-semibold text-muted-foreground">
                    {report.total_variants - report.counted_variants}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Pie Chart */}
          <ChartCard
            title="Coverage Distribution"
            subtitle={`Last ${report.period_days} days`}
          >
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
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
        </div>

        {/* Status Message */}
        <div
          className={cn(
            "rounded-lg border p-4",
            report.coverage_percentage >= 80
              ? "border-badge-success-border bg-badge-success-bg/10"
              : report.coverage_percentage >= 50
              ? "border-badge-warning-border bg-badge-warning-bg/10"
              : "border-badge-error-border bg-badge-error-bg/10"
          )}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2
              className={cn(
                "h-5 w-5",
                report.coverage_percentage >= 80
                  ? "text-badge-success-text"
                  : report.coverage_percentage >= 50
                  ? "text-badge-warning-text"
                  : "text-badge-error-text"
              )}
            />
            <div>
              <div
                className={cn(
                  "text-sm font-medium",
                  report.coverage_percentage >= 80
                    ? "text-badge-success-text"
                    : report.coverage_percentage >= 50
                    ? "text-badge-warning-text"
                    : "text-badge-error-text"
                )}
              >
                {report.coverage_percentage >= 80
                  ? "Excellent Coverage"
                  : report.coverage_percentage >= 50
                  ? "Good Coverage"
                  : "Low Coverage"}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {report.coverage_percentage >= 80
                  ? "Most of your catalog has been counted recently. Keep up the good work!"
                  : report.coverage_percentage >= 50
                  ? "Consider scheduling more cycle counts to improve coverage."
                  : "Consider scheduling cycle counts to improve inventory accuracy."}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

