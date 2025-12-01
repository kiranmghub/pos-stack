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
  onOpenReturns?: (id: number) => void; // NEW
  safeMoney: (v: any) => string;
}) {
  const { rows, loading, page, pageSize, count, lastPage, onOpenDetail, onPageChange, onPageSizeChange, onOpenReturns, safeMoney } = props;

  return (
    <div className="relative overflow-visible rounded-2xl border border-border">
    <div className="grid grid-cols-[8rem_13rem_minmax(12rem,1fr)_6rem_minmax(3.5rem,auto)_minmax(5.5rem,auto)_minmax(5.5rem,auto)_minmax(5.5rem,auto)_minmax(6rem,auto)] gap-3 bg-muted px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">

      <div>#</div>
      <div>Date</div>
      <div>Store / Cashier</div>
      <div>Status</div> {/* NEW */}
      <div className="justify-self-end">Lines</div>
      <div className="justify-self-end">Subtotal</div>
      <div className="justify-self-end">Discount</div>
      <div className="justify-self-end">Tax</div>
      <div className="justify-self-end">Total</div>
    </div>


      <div className="divide-y divide-border">
        {loading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
        {!loading && rows.map(r => (
          <button key={r.id}
            // className="w-full text-left grid grid-cols-[auto_auto_1fr_auto_auto_auto_auto_auto] items-center gap-3 px-3 py-3 text-sm hover:bg-white/5"
            className="w-full text-left grid grid-cols-[8rem_13rem_minmax(12rem,1fr)_6rem_minmax(3.5rem,auto)_minmax(5.5rem,auto)_minmax(5.5rem,auto)_minmax(5.5rem,auto)_minmax(6rem,auto)] items-center gap-3 px-3 py-2.5 text-sm hover:bg-white/10 transition-colors"
            onClick={() => onOpenDetail(r.id)}>
            <div className="flex flex-col">
              {/* First line: receipt number */}
              <div className="font-medium text-foreground leading-tight">
                {r.receipt_no || r.id}
              </div>
              {/* Second line: returns indicator (always present if onOpenReturns is available) */}
              {typeof onOpenReturns === "function" && (
                <div className="mt-0.5 text-[11px] font-normal leading-tight">
                  {(r as any).total_returns > 0 ? (
                    <button
                      type="button"
                      className="text-blue-300 hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenReturns(r.id);
                      }}
                    >
                      View returns ({(r as any).total_returns})
                    </button>
                  ) : (
                    <span className="text-muted-foreground">No returns</span>
                  )}
                </div>
              )}
            </div>



            <div className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
            <div className="truncate text-muted-foreground">
              <span className="text-foreground">{r.store_name || "—"}</span>
              <span className="mx-2 text-muted-foreground">•</span>
              <span className="text-muted-foreground">{r.cashier_name || "—"}</span>
            </div>
            {/* Status chip */}
            <div className="text-center">
              <span
                className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium ${
                  r.status === "completed"
                    ? "bg-emerald-600/20 text-emerald-300"
                    : r.status === "pending"
                    ? "bg-amber-500/20 text-amber-300"
                    : r.status === "void"
                    ? "bg-red-600/30 text-red-300"
                    : "bg-muted/40 text-muted-foreground"
                }`}
              >
                {r.status}
              </span>
            </div>

            <div className="justify-self-end text-muted-foreground tabular-nums">{r.lines_count}</div>
            <div className="justify-self-end text-foreground tabular-nums">{safeMoney(r.subtotal)}</div>
            <div className="justify-self-end text-amber-300 tabular-nums">-{safeMoney(r.discount_total)}</div>
            <div className="justify-self-end text-blue-300 tabular-nums">{safeMoney(r.tax_total)}</div>
            <div className="justify-self-end text-foreground tabular-nums font-semibold">{safeMoney(r.total)}</div>
          </button>
        ))}
        {!loading && rows.length === 0 && <div className="p-6 text-sm text-muted-foreground">No sales found.</div>}
      </div>

      <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-muted/40">
        <div className="text-xs text-muted-foreground">
          {count === 0 ? "No results" : `Showing ${Math.min((page - 1) * pageSize + 1, count)}–${Math.min(page * pageSize, count)} of ${count}`}
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs text-muted-foreground">
            Rows:&nbsp;
            <select className="rounded-md border border-border bg-card text-xs text-foreground px-2 py-1"
              value={pageSize} onChange={(e) => { onPageSizeChange(Number(e.target.value)); }}>
              {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-1">
            <button className="rounded-md px-2 py-1 text-xs text-foreground hover:bg-white/5 disabled:opacity-40"
              onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}>Prev</button>
            <div className="min-w-[7rem] text-center text-xs text-muted-foreground">Page {page} of {lastPage}</div>
            <button className="rounded-md px-2 py-1 text-xs text-foreground hover:bg-white/5 disabled:opacity-40"
              onClick={() => onPageChange(Math.min(lastPage, page + 1))} disabled={page >= lastPage}>Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
