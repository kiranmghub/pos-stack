// ps-frontend/src/features/sales/components/CustomersTable.tsx
import * as React from "react";
import type { CustomerSummaryRow } from "../api";

type CustomersTableProps = {
  rows: CustomerSummaryRow[];
  loading: boolean;
  page: number;
  pageSize: number;
  count: number;
  lastPage: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onSelect: (row: CustomerSummaryRow) => void;
  safeMoney: (amount: number | string) => string;
};

export const CustomersTable: React.FC<CustomersTableProps> = ({
  rows,
  loading,
  page,
  pageSize,
  count,
  lastPage,
  onPageChange,
  onPageSizeChange,
  onSelect,
  safeMoney,
}) => {
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950/60">
        <table className="min-w-full text-sm text-left">
          <thead className="bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Contact</th>
              <th className="px-3 py-2 text-right">Total spend</th>
              <th className="px-3 py-2 text-right">Returns</th>
              <th className="px-3 py-2 text-right">Net spend</th>
              <th className="px-3 py-2 text-right">Visits</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-zinc-400">
                  Loading customers…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-zinc-500">
                  No customers found for this filter.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-t border-zinc-800/80 hover:bg-zinc-900/60"
                onClick={() => onSelect(row)}
              >
                <td className="px-3 py-2 align-middle">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-[11px] font-semibold text-zinc-100">
                      {(row.full_name || row.email || row.phone_number || "?")
                        .toString()
                        .trim()
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-zinc-100">
                        {row.full_name || "Unnamed customer"}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 align-middle text-xs text-zinc-400">
                  <div className="flex flex-col">
                    {row.email && <span>{row.email}</span>}
                    {row.phone_number && (
                      <span className="text-zinc-500">{row.phone_number}</span>
                    )}
                    {!row.email && !row.phone_number && <span>—</span>}
                  </div>
                </td>
                <td className="px-3 py-2 align-middle text-right tabular-nums text-zinc-100">
                  {safeMoney(row.total_spend || 0)}
                </td>
                <td className="px-3 py-2 align-middle text-right tabular-nums text-amber-200">
                  {safeMoney(row.total_returns || 0)}
                </td>
                <td className="px-3 py-2 align-middle text-right tabular-nums text-emerald-200">
                  {safeMoney(row.net_spend || 0)}
                </td>
                <td className="px-3 py-2 align-middle text-right text-zinc-100 tabular-nums">
                  {row.visits_count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
        <div>
          Page {page} of {lastPage} · {count} customers
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
          <div className="inline-flex overflow-hidden rounded-md border border-zinc-700">
            <button
              type="button"
              className="px-2 py-1 disabled:opacity-40"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page <= 1}
            >
              ‹
            </button>
            <button
              type="button"
              className="border-l border-zinc-700 px-2 py-1 disabled:opacity-40"
              onClick={() => onPageChange(Math.min(lastPage, page + 1))}
              disabled={page >= lastPage}
            >
              ›
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
