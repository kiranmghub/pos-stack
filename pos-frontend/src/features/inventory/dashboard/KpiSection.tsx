// pos-frontend/src/features/inventory/dashboard/KpiSection.tsx
import React from "react";
import { Package, Boxes, DollarSign, AlertTriangle, Truck } from "lucide-react";
import { KpiCard } from "../components";
import { InventoryOverview } from "../api/inventory";

export interface KpiSectionProps {
  data: InventoryOverview;
  onKpiClick?: (kpi: string) => void;
}

/**
 * KpiSection - Displays 5 KPI cards for inventory overview
 */
export function KpiSection({ data, onKpiClick }: KpiSectionProps) {
  const formatCurrency = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    const symbol = data.currency?.symbol || data.currency?.code || "$";
    return `${symbol}${num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {/* Total SKUs */}
      <KpiCard
        title="Total SKUs"
        value={data.summary.total_skus}
        icon={<Package className="h-5 w-5" />}
        accent="from-blue-500 to-cyan-500"
        onClick={() => onKpiClick?.("skus")}
      />

      {/* Total Quantity */}
      <KpiCard
        title="Total Quantity"
        value={data.summary.total_qty.toLocaleString()}
        icon={<Boxes className="h-5 w-5" />}
        accent="from-purple-500 to-pink-500"
        onClick={() => onKpiClick?.("quantity")}
      />

      {/* On-hand Value */}
      <KpiCard
        title="On-hand Value"
        value={formatCurrency(data.summary.total_value)}
        icon={<DollarSign className="h-5 w-5" />}
        accent="from-green-500 to-emerald-500"
        onClick={() => onKpiClick?.("value")}
      />

      {/* Low Stock Items */}
      <KpiCard
        title="Low Stock Items"
        value={data.low_stock_count}
        subtitle={`Threshold: ${data.low_stock_threshold_default}`}
        icon={<AlertTriangle className="h-5 w-5" />}
        accent="from-orange-500 to-red-500"
        onClick={() => onKpiClick?.("low-stock")}
      />

      {/* Transfers in Transit */}
      <KpiCard
        title="Transfers in Transit"
        value={data.transfers_in_transit_count}
        icon={<Truck className="h-5 w-5" />}
        accent="from-indigo-500 to-blue-500"
        onClick={() => onKpiClick?.("transfers")}
      />
    </div>
  );
}

