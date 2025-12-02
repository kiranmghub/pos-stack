import * as React from "react";
import type { DiscountRuleSummary } from "../api";

type Props = {
  rows: DiscountRuleSummary[];
  loading: boolean;
  onSelect: (rule: DiscountRuleSummary) => void;
};

export function DiscountRulesTable({ rows, loading, onSelect }: Props) {
  return (
    <div className="rounded-xl border border-border bg-background/70">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2">Rule</th>
              <th className="px-3 py-2 text-right">Total discount</th>
              <th className="px-3 py-2 text-center">Sales</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                  Loading discount summary…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                  No discounts recorded for this period.
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((row) => (
                <tr key={row.code} className="hover:bg-white/5">
                  <td className="px-3 py-3">
                    <div className="text-sm text-foreground">{row.name}</div>
                    <div className="text-xs text-muted-foreground">{row.code}</div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-warning">
                    {row.total_discount_amount}
                  </td>
                  <td className="px-3 py-3 text-center tabular-nums text-foreground">{row.sales_count}</td>
                  <td className="px-3 py-3 text-right">
                    <button
                      type="button"
                      className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                      onClick={() => onSelect(row)}
                    >
                      View sales
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
