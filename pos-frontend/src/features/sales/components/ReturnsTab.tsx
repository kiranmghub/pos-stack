// pos-frontend/src/features/sales/components/ReturnsTab.tsx
import * as React from "react";

export function ReturnsTab(props: {
  returns: any[];
  loadingReturns: boolean;
  expandedReturnId: number | null;
  onToggleExpand: (id: number) => void;
  expandedReturn: any | null;
  loadingExpanded: boolean;
  safeMoney: (v: any) => string;
  onDeleteReturnItem: (returnItemId: number) => Promise<void> | void;
  onVoidDraftReturn: (returnId: number) => Promise<void> | void;
  onDeleteDraftReturn: (returnId: number) => Promise<void> | void;
}) {
  const { returns, loadingReturns, expandedReturnId, onToggleExpand, expandedReturn, loadingExpanded, safeMoney, onDeleteReturnItem, onVoidDraftReturn, onDeleteDraftReturn } = props;
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<number | null>(null);

  return (
    <div className="space-y-4">
      {loadingReturns && <div className="text-sm text-muted-foreground">Loading returns…</div>}
      {!loadingReturns && returns.length === 0 && (
        <div className="text-sm text-muted-foreground">No returns for this sale yet.</div>
      )}
      {!loadingReturns && returns.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="grid grid-cols-[auto_auto_1fr_auto] gap-3 bg-muted px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <div>#</div><div>Date</div><div>Status / Reason</div>
            <div className="justify-self-end">Refund</div>
          </div>
          <div className="divide-y divide-border">
            {returns.map((r: any) => (
              // <div key={r.id} className="border-b border-border">
              <div key={r.id}>
                <div className="w-full grid grid-cols-[auto_auto_1fr_auto] items-center gap-3 px-3 py-2 text-sm hover:bg-white/5">
                  <button
                    className="col-span-3 grid grid-cols-[auto_auto_1fr] items-center gap-3 text-left"
                    onClick={() => onToggleExpand(r.id)}
                    aria-expanded={expandedReturnId === r.id}
                  >
                    <div className="text-foreground">{r.return_no || r.id}</div>
                    <div className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
                    {/* <div className="truncate text-muted-foreground">
                      <span className={`mr-2 inline-flex items-center rounded px-1.5 py-0.5 text-xs ${r.status === "finalized" ? "bg-emerald-600/20 text-emerald-300" : "bg-muted/40 text-muted-foreground"}`}>
                        {r.status}
                      </span>
                      <span className="text-muted-foreground">{r.reason_code || "—"}</span>
                    </div> */}
                    <div className="truncate text-muted-foreground flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${
                        r.status === "finalized"
                          ? "bg-emerald-600/20 text-emerald-300"
                          : r.status === "draft"
                          ? "bg-blue-600/20 text-blue-200"
                          : "bg-muted/40 text-muted-foreground"
                      }`}
                    >
                      {r.status}
                    </span>
                    {r.reason_code && (
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground">
                        {r.reason_code}
                      </span>
                    )}
                    {!r.reason_code && <span className="text-[11px] text-muted-foreground">No header reason</span>}
                  </div>

                  </button>
                  <div className="justify-self-end flex items-center gap-2">
                    <div className="text-foreground">{safeMoney(r.refund_total || 0)}</div>
                    {(r?.status?.toLowerCase?.() === "draft") && (
                      <>
                        {confirmDeleteId === r.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              className="rounded-md bg-red-700 hover:bg-red-600 px-2 py-0.5 text-[11px] font-medium text-white"
                              onClick={async (e) => { e.stopPropagation?.(); await onDeleteDraftReturn(r.id); setConfirmDeleteId(null); }}
                            >
                              Delete
                            </button>
                            <button
                              className="rounded-md px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-white/5"
                              onClick={(e) => { e.stopPropagation?.(); setConfirmDeleteId(null); }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            title="Delete draft return"
                            className="rounded-md p-1.5 text-red-300 hover:bg-red-900/40"
                            onClick={(e) => { e.stopPropagation?.(); setConfirmDeleteId(r.id); }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              <path d="M8 6V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {expandedReturnId === r.id && (
                  <div className="px-3 pb-3">
                    {loadingExpanded && <div className="text-sm text-muted-foreground">Loading return details…</div>}
                    {!loadingExpanded && expandedReturn && (
                      <>
                        {/* Actions (visible only for draft) */}
                        {expandedReturn.status === "draft" && (
                          <div className="mb-2 flex items-center justify-end">
                            <button
                              className="rounded-md bg-red-700 hover:bg-red-600 px-2.5 py-1 text-xs font-medium text-white"
                              onClick={() => onVoidDraftReturn(expandedReturn.id)}
                            >
                              Void draft
                            </button>
                          </div>
                        )}

                        {/* Sticky-ish refund summary banner */}
                        <div className="mb-2 rounded-lg bg-muted/80 border border-border px-3 py-2 text-xs flex items-center justify-between">
                          <div className="text-muted-foreground">
                            Return {expandedReturn.return_no || `#${expandedReturn.id}`}
                          </div>
                          <div className="text-muted-foreground">
                            Refunded:&nbsp;
                            <span className="text-white font-semibold">
                              {safeMoney(expandedReturn.refund_total || 0)}
                            </span>
                          </div>
                        </div>


                        {/* Two-column layout for Items + Refunds */}
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="rounded-xl border border-border overflow-hidden">
                            <div className="px-3 py-2 bg-muted text-xs font-medium uppercase tracking-wide text-muted-foreground">Items</div>
                            <div className="divide-y divide-border">
                              {(expandedReturn.items && expandedReturn.items.length > 0) ? (
                                expandedReturn.items.map((it: any) => (
                                  <div key={it.id} className="px-3 py-2 text-sm">
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="min-w-0 flex items-start gap-2">
                                      <div className="min-w-0 flex items-start gap-2">
                                        {/* Avatar */}
                                        <div className="mt-0.5 h-8 w-8 rounded-full bg-muted flex items-center justify-center text-[11px] font-medium text-muted-foreground">
                                          {((it.product_name || it.variant_name || it.sku || "?") as string)
                                            .trim()
                                            .charAt(0)
                                            .toUpperCase()}
                                        </div>
                                        {/* Text */}
                                        <div className="min-w-0">
                                          <div className="truncate text-foreground">
                                            {it.product_name || `Line #${it.sale_line}`}
                                          </div>
                                          <div className="truncate text-xs text-muted-foreground">
                                            {(it.variant_name || "").trim() || "—"}{it.sku ? ` • SKU: ${it.sku}` : ""}
                                          </div>
                                          <div className="mt-1 text-xs text-muted-foreground">
                                            Reason: <span className="text-foreground">{it.reason_code || "—"}</span>
                                            {it.notes ? <span className="text-muted-foreground"> • {it.notes}</span> : null}
                                          </div>
                                          {/* Original mini-table (which you already added) remains as-is underneath */}
                                          <div className="mt-2 text-[11px] text-muted-foreground">
                                            <div className="grid grid-cols-5 gap-2 text-center">
                                              <div>Unit</div>
                                              <div>Subt.</div>
                                              <div>Disc.</div>
                                              <div>Tax</div>
                                              <div>Total</div>
                                            </div>
                                            <div className="grid grid-cols-5 gap-2 text-center mt-1">
                                              <div className="tabular-nums text-foreground">{safeMoney(it.original_unit_price)}</div>
                                              <div className="tabular-nums text-foreground">{safeMoney(it.original_subtotal)}</div>
                                              <div className="tabular-nums text-amber-300">-{safeMoney(it.original_discount)}</div>
                                              <div className="tabular-nums text-blue-300">{safeMoney(it.original_tax)}</div>
                                              <div className="tabular-nums text-foreground">{safeMoney(it.original_total)}</div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>


                                      </div>
                                      <div className="flex items-center gap-3">
                                        <div className="text-muted-foreground text-xs">
                                          Qty: <span className="text-foreground">{it.qty_returned}</span>
                                        </div>
                                        {(expandedReturn?.status?.toLowerCase?.() === "draft") && (
                                          <button
                                            type="button"
                                            title="Delete line"
                                            aria-label="Delete return line"
                                            className="inline-flex items-center justify-center rounded-md p-1.5 text-red-300 hover:bg-red-900/40 focus:outline-none focus:ring-2 focus:ring-red-600/40"
                                            onClick={() => onDeleteReturnItem(it.id)}
                                          >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                              <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                              <path d="M8 6V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                              <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                              <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                            </svg>
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                    <div className="mt-1 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                                      <div>Return subtotal: <span className="text-foreground">{safeMoney(it.refund_subtotal || 0)}</span></div>
                                      <div>Tax: <span className="text-blue-300">{safeMoney(it.refund_tax || 0)}</span></div>
                                      <div>Total: <span className="text-foreground">{safeMoney(it.refund_total || 0)}</span></div>
                                    </div>
                                    <div className="mt-1 text-xs text-muted-foreground">
                                      Restock: <span className="text-foreground">{it.restock ? "Yes" : "No"}</span>
                                      {" • "}Condition: <span className="text-foreground">{it.condition}</span>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="px-3 py-3 text-sm text-muted-foreground text-center">
                                  {expandedReturn.status?.toLowerCase() === "draft"
                                    ? "No items added yet — once items are added, you can delete them here."
                                    : "No items on this return."}
                                </div>
                              )}
                            </div>

                          </div>

                          <div className="rounded-xl border border-border overflow-hidden">
                            <div className="px-3 py-2 bg-muted text-xs font-medium uppercase tracking-wide text-muted-foreground">Refunds</div>
                            <div className="divide-y divide-border">
                              {(expandedReturn.refunds || []).map((rf: any) => (
                                <div key={rf.id} className="px-3 py-2 text-sm grid grid-cols-[1fr_auto] gap-3">
                                  <div className="text-foreground">
                                    <span className="font-medium">{rf.method}</span>
                                    {rf.external_ref ? <span className="ml-2 text-xs text-muted-foreground">({rf.external_ref})</span> : null}
                                    <div className="text-xs text-muted-foreground">{new Date(rf.created_at).toLocaleString()}</div>
                                  </div>
                                  <div className="justify-self-end text-foreground">{safeMoney(rf.amount || 0)}</div>
                                </div>
                              ))}
                              {(expandedReturn.refunds || []).length === 0 && (
                                <div className="px-3 py-2 text-sm text-muted-foreground">No refunds recorded.</div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 rounded-xl border border-border px-3 py-2 text-xs">
                          <div className="flex items-center justify-between">
                            <div className="text-muted-foreground">Return subtotal</div>
                            <div className="tabular-nums text-foreground">
                              {safeMoney(expandedReturn.refund_subtotal_total || 0)}
                            </div>
                          </div>
                          <div className="mt-1 flex items-center justify-between">
                            <div className="text-muted-foreground">Tax</div>
                            <div className="tabular-nums text-blue-300">
                              {safeMoney(expandedReturn.refund_tax_total || 0)}
                            </div>
                          </div>
                          <div className="mt-1 flex items-center justify-between">
                            <div className="text-muted-foreground">Total refunded</div>
                            <div className="tabular-nums text-white font-semibold">
                              {safeMoney(expandedReturn.refund_total || 0)}
                            </div>
                          </div>
                        </div>

                      </>
                    )}

                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
