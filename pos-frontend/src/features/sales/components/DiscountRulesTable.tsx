import * as React from "react";
import type { DiscountRuleSummary } from "../api";

type Props = {
  rows: DiscountRuleSummary[];
  loading: boolean;
  onSelect: (rule: DiscountRuleSummary) => void;
};

export function DiscountRulesTable({ rows, loading, onSelect }: Props) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-2">Rule</th>
              <th className="px-3 py-2 text-right">Total discount</th>
              <th className="px-3 py-2 text-center">Sales</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900">
            {loading && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-zinc-400">
                  Loading discount summary…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-zinc-500">
                  No discounts recorded for this period.
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((row) => (
                <tr key={row.code} className="hover:bg-white/5">
                  <td className="px-3 py-3">
                    <div className="text-sm text-zinc-100">{row.name}</div>
                    <div className="text-xs text-zinc-500">{row.code}</div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-amber-200">
                    {row.total_discount_amount}
                  </td>
                  <td className="px-3 py-3 text-center tabular-nums text-zinc-100">{row.sales_count}</td>
                  <td className="px-3 py-3 text-right">
                    <button
                      type="button"
                      className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500"
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
