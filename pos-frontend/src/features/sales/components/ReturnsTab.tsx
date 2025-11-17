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
      {loadingReturns && <div className="text-sm text-zinc-500">Loading returns…</div>}
      {!loadingReturns && returns.length === 0 && (
        <div className="text-sm text-zinc-500">No returns for this sale yet.</div>
      )}
      {!loadingReturns && returns.length > 0 && (
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          <div className="grid grid-cols-[auto_auto_1fr_auto] gap-3 bg-zinc-800 px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-300">
            <div>#</div><div>Date</div><div>Status / Reason</div>
            <div className="justify-self-end">Refund</div>
          </div>
          <div className="divide-y divide-zinc-800">
            {returns.map((r: any) => (
              // <div key={r.id} className="border-b border-zinc-800">
              <div key={r.id}>
                <div className="w-full grid grid-cols-[auto_auto_1fr_auto] items-center gap-3 px-3 py-2 text-sm hover:bg-white/5">
                  <button
                    className="col-span-3 grid grid-cols-[auto_auto_1fr] items-center gap-3 text-left"
                    onClick={() => onToggleExpand(r.id)}
                    aria-expanded={expandedReturnId === r.id}
                  >
                    <div className="text-zinc-100">{r.return_no || r.id}</div>
                    <div className="text-zinc-400">{new Date(r.created_at).toLocaleString()}</div>
                    <div className="truncate text-zinc-300">
                      <span className={`mr-2 inline-flex items-center rounded px-1.5 py-0.5 text-xs ${r.status === "finalized" ? "bg-emerald-600/20 text-emerald-300" : "bg-zinc-700/40 text-zinc-300"}`}>
                        {r.status}
                      </span>
                      <span className="text-zinc-400">{r.reason_code || "—"}</span>
                    </div>
                  </button>
                  <div className="justify-self-end flex items-center gap-2">
                    <div className="text-zinc-100">{safeMoney(r.refund_total || 0)}</div>
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
                              className="rounded-md px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-white/5"
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
                    {loadingExpanded && <div className="text-sm text-zinc-500">Loading return details…</div>}
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

                        {/* Two-column layout for Items + Refunds */}
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="rounded-xl border border-zinc-800 overflow-hidden">
                            <div className="px-3 py-2 bg-zinc-800 text-xs font-medium uppercase tracking-wide text-zinc-300">Items</div>
                            <div className="divide-y divide-zinc-800">
                              {(expandedReturn.items && expandedReturn.items.length > 0) ? (
                                expandedReturn.items.map((it: any) => (
                                  <div key={it.id} className="px-3 py-2 text-sm">
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="truncate text-zinc-100">
                                          {it.product_name || `Line #${it.sale_line}`}
                                        </div>
                                        <div className="truncate text-xs text-zinc-400">
                                          {(it.variant_name || "").trim() || "—"}{it.sku ? ` • SKU: ${it.sku}` : ""}
                                        </div>
                                        <div className="mt-1 text-xs text-zinc-400">
                                          Reason: <span className="text-zinc-200">{it.reason_code || "—"}</span>
                                          {it.notes ? <span className="text-zinc-500"> • {it.notes}</span> : null}
                                        </div>
                                        <div className="mt-1 text-[11px] text-zinc-500">
                                          Original: Subtotal {safeMoney(it.original_subtotal)}
                                          {" • "}Discount <span className="text-amber-300">-{safeMoney(it.original_discount || 0)}</span>
                                          {" • "}Tax <span className="text-blue-300">{safeMoney(it.original_tax || 0)}</span>
                                          {" • "}Total <span className="text-zinc-200">{safeMoney(it.original_total)}</span>
                                          {" • "}Qty {it.original_quantity}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <div className="text-zinc-400 text-xs">
                                          Qty: <span className="text-zinc-200">{it.qty_returned}</span>
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
                                    <div className="mt-1 grid grid-cols-3 gap-2 text-xs text-zinc-400">
                                      <div>Return subtotal: <span className="text-zinc-200">{safeMoney(it.refund_subtotal || 0)}</span></div>
                                      <div>Tax: <span className="text-blue-300">{safeMoney(it.refund_tax || 0)}</span></div>
                                      <div>Total: <span className="text-zinc-100">{safeMoney(it.refund_total || 0)}</span></div>
                                    </div>
                                    <div className="mt-1 text-xs text-zinc-400">
                                      Restock: <span className="text-zinc-200">{it.restock ? "Yes" : "No"}</span>
                                      {" • "}Condition: <span className="text-zinc-200">{it.condition}</span>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="px-3 py-3 text-sm text-zinc-500 text-center">
                                  {expandedReturn.status?.toLowerCase() === "draft"
                                    ? "No items added yet — once items are added, you can delete them here."
                                    : "No items on this return."}
                                </div>
                              )}
                            </div>

                          </div>

                          <div className="rounded-xl border border-zinc-800 overflow-hidden">
                            <div className="px-3 py-2 bg-zinc-800 text-xs font-medium uppercase tracking-wide text-zinc-300">Refunds</div>
                            <div className="divide-y divide-zinc-800">
                              {(expandedReturn.refunds || []).map((rf: any) => (
                                <div key={rf.id} className="px-3 py-2 text-sm grid grid-cols-[1fr_auto] gap-3">
                                  <div className="text-zinc-200">
                                    <span className="font-medium">{rf.method}</span>
                                    {rf.external_ref ? <span className="ml-2 text-xs text-zinc-500">({rf.external_ref})</span> : null}
                                    <div className="text-xs text-zinc-500">{new Date(rf.created_at).toLocaleString()}</div>
                                  </div>
                                  <div className="justify-self-end text-zinc-100">{safeMoney(rf.amount || 0)}</div>
                                </div>
                              ))}
                              {(expandedReturn.refunds || []).length === 0 && (
                                <div className="px-3 py-2 text-sm text-zinc-500">No refunds recorded.</div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 rounded-xl border border-zinc-800 px-3 py-2 text-xs">
                          <div className="flex items-center justify-between">
                            <div className="text-zinc-400">Return subtotal</div>
                            <div className="tabular-nums text-zinc-100">
                              {safeMoney(expandedReturn.refund_subtotal_total || 0)}
                            </div>
                          </div>
                          <div className="mt-1 flex items-center justify-between">
                            <div className="text-zinc-400">Tax</div>
                            <div className="tabular-nums text-blue-300">
                              {safeMoney(expandedReturn.refund_tax_total || 0)}
                            </div>
                          </div>
                          <div className="mt-1 flex items-center justify-between">
                            <div className="text-zinc-400">Total refunded</div>
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
