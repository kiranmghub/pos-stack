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

export function DiscountSalesTable({
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
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-2">Receipt</th>
              <th className="px-3 py-2">Store</th>
              <th className="px-3 py-2">Cashier</th>
              <th className="px-3 py-2 text-right">Discount</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900">
            {loading && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-zinc-400">
                  Loading sales…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-zinc-500">
                  No sales match this discount.
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-white/5">
                  <td className="px-3 py-3">
                    <div className="text-sm text-zinc-100">{row.receipt_no || `Sale #${row.id}`}</div>
                    <div className="text-xs text-zinc-500">{new Date(row.created_at).toLocaleString()}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-zinc-100">{row.store_name || "—"}</td>
                  <td className="px-3 py-3 text-sm text-zinc-100">{row.cashier_name || "—"}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-amber-200">{row.discount_total}</td>
                  <td className="px-3 py-3 text-right">
                    <button
                      type="button"
                      className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500"
                      onClick={() => onOpenSale(row)}
                    >
                      View sale
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-2 border-t border-zinc-800 px-3 py-2 text-sm text-zinc-400 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-zinc-700 px-2 py-1 text-xs disabled:opacity-40"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
          >
            Previous
          </button>
          <button
            type="button"
            className="rounded-md border border-zinc-700 px-2 py-1 text-xs disabled:opacity-40"
            onClick={() => onPageChange(Math.min(lastPage, page + 1))}
            disabled={page >= lastPage}
          >
            Next
          </button>
          <div className="text-xs text-zinc-500">
            Page {page} of {lastPage}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span>Rows per page</span>
          <select
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {[10, 20, 50].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <span className="text-zinc-500">
            {Math.min((page - 1) * pageSize + 1, count)}–
            {Math.min(page * pageSize, count)} of {count}
          </span>
        </div>
      </div>
    </div>
  );
}
