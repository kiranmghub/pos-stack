import * as React from "react";
import type { RefundListRow } from "../api";

type Props = {
  rows: RefundListRow[];
  loading: boolean;
  page: number;
  pageSize: number;
  count: number;
  lastPage: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onSelect: (row: RefundListRow) => void;
  onViewSale: (row: RefundListRow) => void;
  onCopyReference: (row: RefundListRow) => void;
  safeMoney: (amount: any) => string;
};

const methodColors: Record<RefundListRow["method"], string> = {
  CASH: "bg-amber-500/15 text-amber-200 border-amber-400/40",
  CARD: "bg-blue-500/15 text-blue-200 border-blue-400/40",
  STORE_CREDIT: "bg-emerald-500/15 text-emerald-200 border-emerald-400/40",
  OTHER: "bg-zinc-500/20 text-zinc-200 border-zinc-400/40",
};

export function RefundsTable({
  rows,
  loading,
  page,
  pageSize,
  count,
  lastPage,
  onPageChange,
  onPageSizeChange,
  onSelect,
  onViewSale,
  onCopyReference,
  safeMoney,
}: Props) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-2">Return</th>
              <th className="px-3 py-2">Sale</th>
              <th className="px-3 py-2">Store</th>
              <th className="px-3 py-2">Method</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2">Reference</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900">
            {loading && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-zinc-400">
                  Loading refunds…
                </td>
              </tr>
            )}

            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-zinc-500">
                  No refunds match the current filters.
                </td>
              </tr>
            )}

            {!loading &&
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-white/5">
                  <td className="px-3 py-3">
                    <div className="text-sm text-zinc-100">{row.return_no || `Return #${row.return_ref_id}`}</div>
                    <div className="text-xs text-zinc-500">{new Date(row.created_at).toLocaleString()}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-zinc-100">{row.sale_receipt_no || `Sale #${row.sale_id}`}</td>
                  <td className="px-3 py-3">
                    <div className="text-sm text-zinc-100">{row.store_name || "—"}</div>
                    <div className="text-xs text-zinc-500">{row.store_code || " "}</div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${methodColors[row.method]}`}>
                      {row.method.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-zinc-100">
                    {safeMoney(Number(row.amount || 0))}
                  </td>
                  <td className="px-3 py-3 text-xs text-zinc-400">{row.external_ref || "—"}</td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex flex-col gap-2 text-xs">
                      <button
                        type="button"
                        className="rounded-md bg-blue-600 px-3 py-1 font-medium text-white hover:bg-blue-500"
                        onClick={() => onSelect(row)}
                      >
                        View return
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-zinc-600 px-3 py-1 text-zinc-200 hover:bg-white/5"
                        onClick={() => onViewSale(row)}
                      >
                        View sale
                      </button>
                      {row.external_ref ? (
                        <button
                          type="button"
                          className="rounded-md border border-amber-500/60 px-3 py-1 text-amber-200 hover:bg-amber-500/10"
                          onClick={() => onCopyReference(row)}
                        >
                          Copy reference
                        </button>
                      ) : null}
                    </div>
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
