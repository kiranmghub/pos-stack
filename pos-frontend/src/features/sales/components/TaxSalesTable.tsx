import * as React from "react";
import type { SaleRow } from "../api";

type Props = {
  rows: SaleRow[];
  loading: boolean;
  page: number;
  pageSize: number;
  count: number;
  lastPage: number;
  onPageChange: (n: number) => void;
  onPageSizeChange: (n: number) => void;
  onOpenSale: (row: SaleRow) => void;
};

export function TaxSalesTable({
  rows,
  loading,
  page,
  pageSize,
  count,
  lastPage,
  onPageChange,
  onPageSizeChange,
  onOpenSale,
}: Props) {
  return (
    <div className="rounded-2xl border border-info/20 bg-background/80">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-left text-[11px] uppercase tracking-[0.2em] text-info/70">
              <th className="px-4 py-2">Receipt</th>
              <th className="px-4 py-2">Store</th>
              <th className="px-4 py-2">Cashier</th>
              <th className="px-4 py-2 text-right">Tax total</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-info/60">
                  Loading impacted sales…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-info/60">
                  No sales recorded with this tax rule in the selected period.
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-info/5">
                  <td className="px-4 py-3">
                    <div className="text-sm text-white">{row.receipt_no || `Sale #${row.id}`}</div>
                    <div className="text-xs text-info/70">{new Date(row.created_at).toLocaleString()}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-white">{row.store_name || "—"}</td>
                  <td className="px-4 py-3 text-sm text-white">{row.cashier_name || "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-info">{row.tax_total}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="rounded-md bg-badge-info-bg px-3 py-1 text-xs font-semibold text-badge-info-text hover:bg-info/30"
                      onClick={() => onOpenSale(row)}
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-2 border-t border-white/5 px-4 py-3 text-xs text-info/70 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-info/40 px-2 py-1 disabled:opacity-40"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
          >
            Previous
          </button>
          <button
            type="button"
            className="rounded-md border border-info/40 px-2 py-1 disabled:opacity-40"
            onClick={() => onPageChange(Math.min(lastPage, page + 1))}
            disabled={page >= lastPage}
          >
            Next
          </button>
          <div>Page {page} of {lastPage}</div>
        </div>
        <div className="flex items-center gap-2">
          <span>Rows per page</span>
          <select
            className="rounded-md border border-info/40 bg-background px-2 py-1 text-info"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {[10, 20, 50].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <span>
            {Math.min((page - 1) * pageSize + 1, count)}–{Math.min(page * pageSize, count)} of {count}
          </span>
        </div>
      </div>
    </div>
  );
}
