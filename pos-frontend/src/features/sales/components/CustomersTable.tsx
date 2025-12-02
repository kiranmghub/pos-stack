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
  onSelectRow: (row: CustomerSummaryRow) => void;
  onViewDetails: (row: CustomerSummaryRow) => void;
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
  onSelectRow,
  onViewDetails,
  safeMoney,
}) => {
    return (
        <div className="space-y-2">
            <div className="overflow-x-auto rounded-xl border border-border bg-background/60">
                <table className="min-w-full text-sm text-left">
                    <thead className="bg-muted/80 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                            <th className="px-3 py-2">Customer</th>
                            <th className="px-3 py-2">Contact</th>
                            <th className="px-3 py-2 text-right">Total spend</th>
                            <th className="px-3 py-2 text-right">Returns</th>
                            <th className="px-3 py-2 text-right">Net spend</th>
                            <th className="px-3 py-2 text-right">Points</th>
                            <th className="px-3 py-2 text-right">Visits</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && rows.length === 0 && (
                            <tr>
                                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                                    Loading customers…
                                </td>
                            </tr>
                        )}
                        {!loading && rows.length === 0 && (
                            <tr>
                                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                                    No customers found for this filter.
                                </td>
                            </tr>
                        )}
                        {rows.map((row) => (
                            <tr
                                key={row.id}
                                className="cursor-pointer border-t border-border/80 hover:bg-muted/60"
                                onClick={() => onSelectRow(row)}
                            >
                                <td className="px-3 py-2 align-middle">
                                    <div className="flex items-center gap-2">
                                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
                                            {(row.full_name || row.email || row.phone_number || "?")
                                                .toString()
                                                .trim()
                                                .charAt(0)
                                                .toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                            <span className="font-medium text-foreground">
                                                {row.full_name || "Unnamed customer"}
                                            </span>
                                            {row.is_loyalty_member && (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-badge-success-bg px-2 py-0.5 text-[10px] font-medium text-badge-success-text">
                                                <span aria-hidden="true" className="text-[11px]">
                                                    ★
                                                </span>
                                                <span className="tracking-wide">Loyalty Member</span>
                                                </span>
                                            )}
                                            <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onViewDetails(row);
                                            }}
                                            className="text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                                            >
                                            View details
                                            </button>

                                            </div>


                                        </div>
                                    </div>
                                </td>
                                <td className="px-3 py-2 align-middle text-xs text-muted-foreground">
                                    <div className="flex flex-col">
                                        {row.email && <span>{row.email}</span>}
                                        {row.phone_number && (
                                            <span className="text-muted-foreground">{row.phone_number}</span>
                                        )}
                                        {!row.email && !row.phone_number && <span>—</span>}
                                    </div>
                                </td>
                                <td className="px-3 py-2 align-middle text-right tabular-nums text-foreground">
                                    {safeMoney(row.total_spend || 0)}
                                </td>
                                <td className="px-3 py-2 align-middle text-right tabular-nums text-warning">
                                    {Number(row.total_returns || 0) > 0
                                        ? safeMoney(row.total_returns || 0)
                                        : "—"}
                                </td>
                                <td className="px-3 py-2 align-middle text-right tabular-nums text-success">
                                    {safeMoney(row.net_spend || 0)}
                                </td>
                                <td className="px-3 py-2 align-middle text-right tabular-nums text-info">
                                    {row.loyalty_points ?? 0}
                                </td>
                                <td className="px-3 py-2 align-middle text-right text-foreground tabular-nums">
                                    {row.visits_count}
                                </td>

                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <div>
                    Page {page} of {lastPage} · {count} customers
                </div>
                <div className="flex items-center gap-2">
                    <select
                        className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
                        value={pageSize}
                        onChange={(e) => onPageSizeChange(Number(e.target.value))}
                    >
                        {[10, 20, 50, 100].map((n) => (
                            <option key={n} value={n}>
                                {n} / page
                            </option>
                        ))}
                    </select>
                    <div className="inline-flex overflow-hidden rounded-md border border-border">
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
                            className="border-l border-border px-2 py-1 disabled:opacity-40"
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
