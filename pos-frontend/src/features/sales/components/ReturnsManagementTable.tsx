import * as React from "react";
import type { ReturnListRow } from "../api";

type Props = {
  rows: ReturnListRow[];
  loading: boolean;
  page: number;
  pageSize: number;
  count: number;
  lastPage: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onSelect: (row: ReturnListRow) => void;
  onResumeDraft: (row: ReturnListRow) => void;
  onVoidDraft: (row: ReturnListRow) => void;
  onDeleteDraft: (row: ReturnListRow) => void;
  safeMoney: (amount: any) => string;
};

const statusColors: Record<ReturnListRow["status"], string> = {
  draft: "bg-amber-500/20 text-amber-200 border-amber-500/40",
  finalized: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
  void: "bg-rose-500/15 text-rose-200 border-rose-500/30",
};

export function ReturnsManagementTable({
  rows,
  loading,
  page,
  pageSize,
  count,
  lastPage,
  onPageChange,
  onPageSizeChange,
  onSelect,
  onResumeDraft,
  onVoidDraft,
  onDeleteDraft,
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
              <th className="px-3 py-2">Processed</th>
              <th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2 text-right">Refund</th>
              <th className="px-3 py-2 text-center">Items</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900">
            {loading && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-zinc-400">
                  Loading returns…
                </td>
              </tr>
            )}

            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-zinc-500">
                  No returns match the current filters.
                </td>
              </tr>
            )}

            {!loading &&
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-white/5">
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-1">
                      <div className="text-sm font-semibold text-zinc-100">{row.return_no || `Return #${row.id}`}</div>
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusColors[row.status]}`}
                        >
                          {row.status}
                        </span>
                        <span>{new Date(row.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-sm text-zinc-100">{row.sale_receipt_no || `Sale #${row.sale}`}</div>
                    <div className="text-xs text-zinc-500">{row.cashier_name || "—"}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-sm text-zinc-100">{row.store_name || "—"}</div>
                    <div className="text-xs text-zinc-500">{row.store_code || " "}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-sm text-zinc-100">{row.processed_by_name || "—"}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-sm text-zinc-200">{row.reason_summary || row.reason_code || "—"}</div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-zinc-100">
                    {safeMoney(Number(row.refund_total || 0))}
                  </td>
                  <td className="px-3 py-3 text-center tabular-nums text-zinc-200">{row.items_count ?? 0}</td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex flex-col gap-2 text-xs">
                      <button
                        type="button"
                        className="rounded-md bg-blue-600 px-3 py-1 font-medium text-white hover:bg-blue-500"
                        onClick={() => onSelect(row)}
                      >
                        View sale
                      </button>
                      {row.status === "draft" && (
                        <>
                          <button
                            type="button"
                            className="rounded-md border border-zinc-600 px-3 py-1 text-zinc-200 hover:bg-white/5"
                            onClick={() => onResumeDraft(row)}
                          >
                            Resume
                          </button>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              className="rounded-md border border-amber-500/50 px-2 py-1 text-amber-200 hover:bg-amber-500/10"
                              onClick={() => onVoidDraft(row)}
                            >
                              Void
                            </button>
                            <button
                              type="button"
                              className="rounded-md border border-rose-500/50 px-2 py-1 text-rose-200 hover:bg-rose-500/10"
                              onClick={() => onDeleteDraft(row)}
                            >
                              Delete
                            </button>
                          </div>
                        </>
                      )}
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
