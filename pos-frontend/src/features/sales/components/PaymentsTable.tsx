import * as React from "react";
import type { PaymentListRow } from "../api";

type Props = {
  rows: PaymentListRow[];
  loading: boolean;
  page: number;
  pageSize: number;
  count: number;
  lastPage: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onSelect: (row: PaymentListRow) => void;
  onStartRefund: (row: PaymentListRow) => void;
  onCopyReference: (row: PaymentListRow) => void;
  safeMoney: (amount: any) => string;
};

const methodColors: Record<PaymentListRow["type"], string> = {
  CASH: "bg-amber-500/15 text-amber-200 border-amber-400/40",
  CARD: "bg-blue-500/15 text-blue-200 border-blue-400/40",
  STORE_CREDIT: "bg-emerald-500/15 text-emerald-200 border-emerald-400/40",
  OTHER: "bg-muted/20 text-foreground border-border/40",
};

export function PaymentsTable({
  rows,
  loading,
  page,
  pageSize,
  count,
  lastPage,
  onPageChange,
  onPageSizeChange,
  onSelect,
  onStartRefund,
  onCopyReference,
  safeMoney,
}: Props) {
  return (
    <div className="rounded-xl border border-border bg-background/70">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2">Receipt</th>
              <th className="px-3 py-2">Store</th>
              <th className="px-3 py-2">Cashier</th>
              <th className="px-3 py-2">Method</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-right">Change</th>
              <th className="px-3 py-2">Reference</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  Loading payments…
                </td>
              </tr>
            )}

            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  No payments match the current filters.
                </td>
              </tr>
            )}

            {!loading &&
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-white/5">
                  <td className="px-3 py-3">
                    <div className="text-sm text-foreground">{row.sale_receipt_no || `Sale #${row.sale_id}`}</div>
                    <div className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-sm text-foreground">{row.store_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{row.store_code || " "}</div>
                  </td>
                  <td className="px-3 py-3 text-sm text-foreground">{row.cashier_name || "—"}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${methodColors[row.type]}`}>
                      {row.type.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-foreground">
                    {safeMoney(Number(row.amount || 0))}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-foreground">
                    {safeMoney(Number(row.change || 0))}
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">{row.txn_ref || "—"}</td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex flex-col gap-2 text-xs">
                      <button
                        type="button"
                        className="rounded-md bg-blue-600 px-3 py-1 font-medium text-white hover:bg-blue-500"
                        onClick={() => onSelect(row)}
                      >
                        View sale
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-emerald-500/60 px-3 py-1 text-emerald-200 hover:bg-emerald-500/10"
                        onClick={() => onStartRefund(row)}
                      >
                        Start refund
                      </button>
                      {row.txn_ref ? (
                        <button
                          type="button"
                          className="rounded-md border border-border px-3 py-1 text-foreground hover:bg-white/5"
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

      <div className="flex flex-col gap-2 border-t border-border px-3 py-2 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-40"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
          >
            Previous
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-40"
            onClick={() => onPageChange(Math.min(lastPage, page + 1))}
            disabled={page >= lastPage}
          >
            Next
          </button>
          <div className="text-xs text-muted-foreground">
            Page {page} of {lastPage}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span>Rows per page</span>
          <select
            className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {[10, 20, 50].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground">
            {Math.min((page - 1) * pageSize + 1, count)}–
            {Math.min(page * pageSize, count)} of {count}
          </span>
        </div>
      </div>
    </div>
  );
}
