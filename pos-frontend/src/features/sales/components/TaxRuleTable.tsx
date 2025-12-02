import * as React from "react";
import type { TaxRuleSummary } from "../api";

type Props = {
  rows: TaxRuleSummary[];
  loading: boolean;
  onSelect: (rule: TaxRuleSummary) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
};

export function TaxRuleTable({ rows, loading, onSelect, searchQuery, setSearchQuery }: Props) {
  const filtered = React.useMemo(() => {
    if (!searchQuery.trim()) return rows;
    return rows.filter((r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.code.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [rows, searchQuery]);

  return (
    <div className="rounded-2xl border border-info/20 bg-background/70">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
        <div className="text-sm uppercase tracking-[0.3em] text-info/70">Tax rules</div>
        <input
          className="rounded-md border border-info/30 bg-background px-3 py-1 text-xs text-info placeholder:text-info/50"
          placeholder="Search rule or code"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-left text-[11px] uppercase tracking-wide text-info/70">
              <th className="px-4 py-2">Rule</th>
              <th className="px-4 py-2 text-right">Tax collected</th>
              <th className="px-4 py-2 text-center">Sales</th>
              <th className="px-4 py-2 text-right">Audit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading && (
              <tr>
                <td colSpan={4} className="px-4 py-4 text-center text-info/60">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-4 text-center text-info/60">
                  No tax rules match the current filters.
                </td>
              </tr>
            )}
            {!loading &&
              filtered.map((row) => (
                <tr key={row.code} className="hover:bg-info/5">
                  <td className="px-4 py-3">
                    <div className="text-sm text-white">{row.name}</div>
                    <div className="text-xs text-info/70">{row.code}</div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-info">
                    {row.tax_amount}
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums text-white">{row.sales_count}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="rounded-md bg-badge-info-bg px-3 py-1 text-xs font-semibold text-badge-info-text hover:bg-info/30"
                      onClick={() => onSelect(row)}
                    >
                      View filings
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
