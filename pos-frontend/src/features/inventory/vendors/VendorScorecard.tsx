// pos-frontend/src/features/inventory/vendors/VendorScorecard.tsx
import React from "react";
import { VendorScorecard as VendorScorecardType } from "../api/vendors";
import { KpiCard } from "../components/KpiCard";
import { ChartCard } from "../components/ChartCard";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { TrendingUp, TrendingDown, Package, Clock, CheckCircle2, DollarSign } from "lucide-react";

export interface VendorScorecardProps {
  /** Vendor scorecard data */
  scorecard: VendorScorecardType | null;
  /** Loading state */
  isLoading?: boolean;
  /** Custom className */
  className?: string;
}

/**
 * VendorScorecard - Comprehensive vendor performance scorecard
 * Security: All data is tenant-scoped from the API
 */
export function VendorScorecard({
  scorecard,
  isLoading = false,
  className,
}: VendorScorecardProps) {
  if (isLoading || !scorecard) {
    return (
      <div className={className}>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading scorecard...</p>
        </div>
      </div>
    );
  }

  const overallScore = scorecard.overall_score;
  const scoreColor =
    overallScore >= 80
      ? "text-badge-success-text"
      : overallScore >= 60
      ? "text-badge-warning-text"
      : "text-badge-error-text";

  const scoreBgColor =
    overallScore >= 80
      ? "bg-badge-success-bg"
      : overallScore >= 60
      ? "bg-badge-warning-bg"
      : "bg-badge-error-bg";

  // Prepare data for charts
  const onTimeData = [
    {
      name: "On Time",
      value: scorecard.on_time_performance.on_time_orders,
      color: "hsl(var(--success))",
    },
    {
      name: "Late",
      value: scorecard.on_time_performance.late_orders,
      color: "hsl(var(--destructive))",
    },
  ];

  const fillRateData = [
    {
      name: "Received",
      value: scorecard.fill_rate.total_received,
      color: "hsl(var(--success))",
    },
    {
      name: "Not Received",
      value: scorecard.fill_rate.total_ordered - scorecard.fill_rate.total_received,
      color: "hsl(var(--muted))",
    },
  ];

  return (
    <div className={cn("space-y-6", className)}>
      {/* Overall Score */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Overall Performance Score</h3>
            <p className="text-sm text-muted-foreground">
              Based on on-time delivery, fill rate, lead time, and cost stability
            </p>
          </div>
          <div className={cn("text-4xl font-bold", scoreColor)}>{overallScore.toFixed(1)}</div>
        </div>
        <div className="w-full h-4 rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full transition-all flex items-center justify-end pr-2", scoreBgColor)}
            style={{ width: `${overallScore}%` }}
          >
            {overallScore > 10 && (
              <span className="text-xs font-medium text-foreground">
                {overallScore.toFixed(0)}%
              </span>
            )}
          </div>
        </div>
        <div className="text-xs text-muted-foreground mt-2">
          {overallScore >= 80
            ? "Excellent"
            : overallScore >= 60
            ? "Good"
            : overallScore >= 40
            ? "Fair"
            : "Needs Improvement"}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard
          title="On-Time Performance"
          value={`${scorecard.on_time_performance.on_time_percentage.toFixed(1)}%`}
          subtitle={`${scorecard.on_time_performance.on_time_orders} of ${scorecard.on_time_performance.total_orders} orders`}
          trend={
            scorecard.on_time_performance.confidence > 0
              ? scorecard.on_time_performance.on_time_percentage - 50
              : undefined
          }
        />
        <KpiCard
          title="Average Lead Time"
          value={
            scorecard.lead_time.average_lead_time_days !== null
              ? `${scorecard.lead_time.average_lead_time_days.toFixed(1)} days`
              : "N/A"
          }
          subtitle={`${scorecard.lead_time.orders_count} orders`}
        />
        <KpiCard
          title="Fill Rate"
          value={`${scorecard.fill_rate.fill_rate_percentage.toFixed(1)}%`}
          subtitle={`${scorecard.fill_rate.total_received} of ${scorecard.fill_rate.total_ordered} units`}
          trend={
            scorecard.fill_rate.confidence > 0
              ? scorecard.fill_rate.fill_rate_percentage - 50
              : undefined
          }
        />
        <KpiCard
          title="Cost Variance"
          value={
            scorecard.cost_variance.cost_variance !== null
              ? `${scorecard.cost_variance.cost_variance.toFixed(2)}`
              : "N/A"
          }
          subtitle={`${scorecard.cost_variance.orders_count} orders`}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* On-Time Performance */}
        {scorecard.on_time_performance.total_orders > 0 && (
          <ChartCard
            title="On-Time Delivery"
            subtitle={`Last ${scorecard.period_days} days`}
          >
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={onTimeData}>
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
                  <Bar dataKey="value" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        )}

        {/* Fill Rate */}
        {scorecard.fill_rate.total_ordered > 0 && (
          <ChartCard
            title="Fill Rate"
            subtitle={`Last ${scorecard.period_days} days`}
          >
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={fillRateData}>
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
                  <Bar dataKey="value" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        )}
      </div>

      {/* Detailed Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* On-Time Performance Details */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            On-Time Performance
          </h4>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">On-Time Percentage</span>
              <span className="text-lg font-semibold text-foreground">
                {scorecard.on_time_performance.on_time_percentage.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Orders</span>
              <span className="text-sm font-medium text-foreground">
                {scorecard.on_time_performance.total_orders}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">On-Time Orders</span>
              <span className="text-sm font-medium text-badge-success-text">
                {scorecard.on_time_performance.on_time_orders}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Late Orders</span>
              <span className="text-sm font-medium text-badge-error-text">
                {scorecard.on_time_performance.late_orders}
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-sm text-muted-foreground">Confidence</span>
              <span className="text-sm font-medium text-foreground">
                {(scorecard.on_time_performance.confidence * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        {/* Lead Time Details */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Lead Time
          </h4>
          <div className="space-y-3">
            {scorecard.lead_time.average_lead_time_days !== null ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Average</span>
                  <span className="text-lg font-semibold text-foreground">
                    {scorecard.lead_time.average_lead_time_days.toFixed(1)} days
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Minimum</span>
                  <span className="text-sm font-medium text-foreground">
                    {scorecard.lead_time.min_lead_time_days !== null
                      ? `${scorecard.lead_time.min_lead_time_days} days`
                      : "N/A"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Maximum</span>
                  <span className="text-sm font-medium text-foreground">
                    {scorecard.lead_time.max_lead_time_days !== null
                      ? `${scorecard.lead_time.max_lead_time_days} days`
                      : "N/A"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Orders</span>
                  <span className="text-sm font-medium text-foreground">
                    {scorecard.lead_time.orders_count}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="text-sm text-muted-foreground">Confidence</span>
                  <span className="text-sm font-medium text-foreground">
                    {(scorecard.lead_time.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">No lead time data available</div>
            )}
          </div>
        </div>

        {/* Fill Rate Details */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Package className="h-4 w-4" />
            Fill Rate
          </h4>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Fill Rate</span>
              <span className="text-lg font-semibold text-foreground">
                {scorecard.fill_rate.fill_rate_percentage.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Ordered</span>
              <span className="text-sm font-medium text-foreground">
                {scorecard.fill_rate.total_ordered}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Received</span>
              <span className="text-sm font-medium text-badge-success-text">
                {scorecard.fill_rate.total_received}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Not Received</span>
              <span className="text-sm font-medium text-badge-error-text">
                {scorecard.fill_rate.total_ordered - scorecard.fill_rate.total_received}
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-sm text-muted-foreground">Confidence</span>
              <span className="text-sm font-medium text-foreground">
                {(scorecard.fill_rate.confidence * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        {/* Cost Variance Details */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Cost Variance
          </h4>
          <div className="space-y-3">
            {scorecard.cost_variance.orders_count > 0 ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Average Cost</span>
                  <span className="text-lg font-semibold text-foreground">
                    {scorecard.cost_variance.average_unit_cost !== null
                      ? `$${scorecard.cost_variance.average_unit_cost.toFixed(2)}`
                      : "N/A"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Cost Variance</span>
                  <span className="text-sm font-medium text-foreground">
                    {scorecard.cost_variance.cost_variance.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Orders</span>
                  <span className="text-sm font-medium text-foreground">
                    {scorecard.cost_variance.orders_count}
                  </span>
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">No cost data available</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

