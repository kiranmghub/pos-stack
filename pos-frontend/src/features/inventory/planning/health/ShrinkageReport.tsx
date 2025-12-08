// pos-frontend/src/features/inventory/planning/health/ShrinkageReport.tsx
import React from "react";
import { ShrinkageReport as ShrinkageReportType } from "../../api/health";
import { ChartCard } from "../../components/ChartCard";
import { DataTable } from "../../components/DataTable";
import { LoadingSkeleton, EmptyState } from "../../components";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { TrendingDown, Package } from "lucide-react";

export interface ShrinkageReportProps {
  /** Shrinkage report data */
  report: ShrinkageReportType | null;
  /** Loading state */
  isLoading?: boolean;
  /** Custom className */
  className?: string;
}

/**
 * ShrinkageReport - Shrinkage analysis component
 * Security: All data is tenant-scoped from the API
 */
export function ShrinkageReport({
  report,
  isLoading = false,
  className,
}: ShrinkageReportProps) {
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
        <EmptyState variant="empty" title="No shrinkage data" description="No shrinkage data available" />
      </div>
    );
  }

  const chartData = report.shrinkage_by_reason.map((reason) => ({
    name: reason.name,
    quantity: reason.quantity,
    count: reason.count,
  }));

  const tableColumns = [
    {
      key: "name",
      header: "Reason",
      render: (reason: typeof report.shrinkage_by_reason[0]) => (
        <div className="font-medium text-foreground">{reason.name}</div>
      ),
    },
    {
      key: "code",
      header: "Code",
      render: (reason: typeof report.shrinkage_by_reason[0]) => (
        <div className="text-sm text-muted-foreground font-mono">{reason.code}</div>
      ),
    },
    {
      key: "quantity",
      header: "Quantity",
      render: (reason: typeof report.shrinkage_by_reason[0]) => (
        <div className="font-semibold text-badge-error-text">{reason.quantity}</div>
      ),
    },
    {
      key: "count",
      header: "Occurrences",
      render: (reason: typeof report.shrinkage_by_reason[0]) => (
        <div className="text-sm text-foreground">{reason.count}</div>
      ),
    },
  ];

  return (
    <div className={className}>
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="h-5 w-5 text-badge-error-text" />
              <span className="text-sm font-medium text-muted-foreground">Total Shrinkage</span>
            </div>
            <div className="text-2xl font-bold text-badge-error-text">
              {report.total_shrinkage}
            </div>
            <div className="text-xs text-muted-foreground mt-1">units</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Package className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">From Counts</span>
            </div>
            <div className="text-2xl font-bold text-foreground">
              {report.count_reconciliations.quantity}
            </div>
            <div className="text-xs text-muted-foreground mt-1">units</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Package className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">From Adjustments</span>
            </div>
            <div className="text-2xl font-bold text-foreground">{report.adjustments.quantity}</div>
            <div className="text-xs text-muted-foreground mt-1">units</div>
          </div>
        </div>

        {/* Chart */}
        {chartData.length > 0 && (
          <ChartCard
            title="Shrinkage by Reason"
            subtitle={`Last ${report.period_days} days`}
          >
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="name"
                    stroke="hsl(var(--muted-foreground))"
                    style={{ fontSize: "12px" }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" style={{ fontSize: "12px" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "6px",
                    }}
                  />
                  <Legend />
                  <Bar dataKey="quantity" fill="hsl(var(--destructive))" name="Quantity" />
                  <Bar dataKey="count" fill="hsl(var(--muted-foreground))" name="Occurrences" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        )}

        {/* Table */}
        {report.shrinkage_by_reason.length > 0 ? (
          <div className="rounded-lg border border-border bg-card">
            <div className="p-4 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Shrinkage Breakdown</h3>
            </div>
            <DataTable
              columns={tableColumns}
              data={report.shrinkage_by_reason}
              emptyMessage="No shrinkage data"
            />
          </div>
        ) : (
          <EmptyState
            variant="empty"
            title="No shrinkage data"
            description="No shrinkage recorded in the selected period"
          />
        )}
      </div>
    </div>
  );
}

