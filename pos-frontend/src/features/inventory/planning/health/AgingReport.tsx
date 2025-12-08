// pos-frontend/src/features/inventory/planning/health/AgingReport.tsx
import React from "react";
import { AgingReport as AgingReportType } from "../../api/health";
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
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Package, Calendar } from "lucide-react";
import { format } from "date-fns";

export interface AgingReportProps {
  /** Aging report data */
  report: AgingReportType | null;
  /** Loading state */
  isLoading?: boolean;
  /** Custom className */
  className?: string;
}

/**
 * AgingReport - Aging inventory analysis component
 * Security: All data is tenant-scoped from the API
 */
export function AgingReport({ report, isLoading = false, className }: AgingReportProps) {
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
        <EmptyState variant="empty" title="No aging data" description="No aging inventory data available" />
      </div>
    );
  }

  const categoryChartData = report.aging_by_category.map((category) => ({
    name: category.category_name || category.category || "Uncategorized",
    value: category.total_value,
    quantity: category.total_quantity,
    variants: category.variant_count,
  }));

  const COLORS = [
    "hsl(var(--primary))",
    "hsl(var(--secondary))",
    "hsl(var(--accent))",
    "hsl(var(--muted-foreground))",
    "hsl(var(--destructive))",
  ];

  const tableColumns = [
    {
      key: "product_name",
      header: "Product",
      render: (variant: typeof report.aging_variants[0]) => (
        <div>
          <div className="font-medium text-foreground">{variant.product_name}</div>
          <div className="text-xs text-muted-foreground">SKU: {variant.sku || "N/A"}</div>
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (variant: typeof report.aging_variants[0]) => (
        <div className="text-sm text-foreground">{variant.category || "Uncategorized"}</div>
      ),
    },
    {
      key: "on_hand",
      header: "On Hand",
      render: (variant: typeof report.aging_variants[0]) => (
        <div className="font-semibold text-foreground">{variant.on_hand}</div>
      ),
    },
    {
      key: "value",
      header: "Value",
      render: (variant: typeof report.aging_variants[0]) => (
        <div className="font-semibold text-foreground">
          ${variant.value.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </div>
      ),
    },
    {
      key: "days_since_last_sale",
      header: "Days Since Last Sale",
      render: (variant: typeof report.aging_variants[0]) => (
        <div className="text-sm text-muted-foreground">
          {variant.days_since_last_sale !== null
            ? `${variant.days_since_last_sale} days`
            : "Never"}
        </div>
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
              <Package className="h-5 w-5 text-badge-warning-text" />
              <span className="text-sm font-medium text-muted-foreground">Total Value</span>
            </div>
            <div className="text-2xl font-bold text-badge-warning-text">
              ${report.total_aging_value.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            <div className="text-xs text-muted-foreground mt-1">of aging inventory</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Package className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Total Quantity</span>
            </div>
            <div className="text-2xl font-bold text-foreground">
              {report.total_aging_quantity}
            </div>
            <div className="text-xs text-muted-foreground mt-1">units</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Variants</span>
            </div>
            <div className="text-2xl font-bold text-foreground">{report.variant_count}</div>
            <div className="text-xs text-muted-foreground mt-1">
              no sales in {report.days_no_sales} days
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Aging by Category - Bar Chart */}
          {categoryChartData.length > 0 && (
            <ChartCard
              title="Aging Inventory by Category (Value)"
              subtitle={`${report.days_no_sales} days without sales`}
            >
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryChartData}>
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
                      formatter={(value: number) =>
                        `$${value.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}`
                      }
                    />
                    <Bar dataKey="value" fill="hsl(var(--warning))" name="Value ($)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          )}

          {/* Aging by Category - Pie Chart */}
          {categoryChartData.length > 0 && (
            <ChartCard
              title="Aging Inventory Distribution"
              subtitle="By category"
            >
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryChartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {categoryChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "6px",
                      }}
                      formatter={(value: number) =>
                        `$${value.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}`
                      }
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          )}
        </div>

        {/* Table */}
        {report.aging_variants.length > 0 ? (
          <div className="rounded-lg border border-border bg-card">
            <div className="p-4 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">
                Aging Variants ({report.aging_variants.length})
              </h3>
            </div>
            <DataTable
              columns={tableColumns}
              data={report.aging_variants}
              emptyMessage="No aging variants"
            />
          </div>
        ) : (
          <EmptyState
            variant="empty"
            title="No aging inventory"
            description="All variants have recent sales activity"
          />
        )}
      </div>
    </div>
  );
}

