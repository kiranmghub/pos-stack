// pos-frontend/src/features/sales/components/SalesTable.tsx

import * as React from "react";
import type { SaleRow } from "../api";

export function SalesTable(props: {
  rows: SaleRow[];
  loading: boolean;
  page: number; pageSize: number; count: number; lastPage: number;
  onOpenDetail: (id: number) => void;
  onPageChange: (n: number) => void;
  onPageSizeChange: (n: number) => void;
}) {
  const { rows, loading, page, pageSize, count, lastPage, onOpenDetail, onPageChange, onPageSizeChange } = props;
  return (
    <div className="relative overflow-visible rounded-2xl border border-zinc-800">
      <div className="grid grid-cols-[auto_auto_1fr_auto_auto_auto_auto_auto] gap-3 bg-zinc-800 px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-300">
        <div>#</div><div>Date</div><div>Store / Cashier</div>
        <div className="justify-self-end">Lines</div>
        <div className="justify-self-end">Subtotal</div>
        <div className="justify-self-end">Discount</div>
        <div className="justify-self-end">Tax</div>
        <div className="justify-self-end">Total</div>
      </div>

      <div className="divide-y divide-zinc-800">
        {loading && <div className="p-6 text-sm text-zinc-500">Loading…</div>}
        {!loading && rows.map(r => (
          <button key={r.id}
            className="w-full text-left grid grid-cols-[auto_auto_1fr_auto_auto_auto_auto_auto] items-center gap-3 px-3 py-3 text-sm hover:bg-white/5"
            onClick={() => onOpenDetail(r.id)}>
            <div className="font-medium text-zinc-100">{r.receipt_no || r.id}</div>
            <div className="text-zinc-400">{new Date(r.created_at).toLocaleString()}</div>
            <div className="truncate text-zinc-300">
              <span className="text-zinc-100">{r.store_name || "—"}</span>
              <span className="mx-2 text-zinc-600">•</span>
              <span className="text-zinc-400">{r.cashier_name || "—"}</span>
            </div>
            <div className="justify-self-end text-zinc-300">{r.lines_count}</div>
            <div className="justify-self-end text-zinc-200">{r.subtotal}</div>
            <div className="justify-self-end text-zinc-200">{r.discount_total}</div>
            <div className="justify-self-end text-zinc-200">{r.tax_total}</div>
            <div className="justify-self-end text-zinc-100">{r.total}</div>
          </button>
        ))}
        {!loading && rows.length === 0 && <div className="p-6 text-sm text-zinc-500">No sales found.</div>}
      </div>

      <div className="flex items-center justify-between px-3 py-2 border-t border-zinc-800 bg-zinc-900/40">
        <div className="text-xs text-zinc-400">
          {count === 0 ? "No results" : `Showing ${Math.min((page - 1) * pageSize + 1, count)}–${Math.min(page * pageSize, count)} of ${count}`}
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs text-zinc-300">
            Rows:&nbsp;
            <select className="rounded-md border border-zinc-700 bg-zinc-900 text-xs text-zinc-100 px-2 py-1"
              value={pageSize} onChange={(e) => { onPageSizeChange(Number(e.target.value)); }}>
              {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-1">
            <button className="rounded-md px-2 py-1 text-xs text-zinc-200 hover:bg-white/5 disabled:opacity-40"
              onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}>Prev</button>
            <div className="min-w-[7rem] text-center text-xs text-zinc-300">Page {page} of {lastPage}</div>
            <button className="rounded-md px-2 py-1 text-xs text-zinc-200 hover:bg-white/5 disabled:opacity-40"
              onClick={() => onPageChange(Math.min(lastPage, page + 1))} disabled={page >= lastPage}>Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
