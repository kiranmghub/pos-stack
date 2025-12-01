// pos-frontend/src/features/sales/components/ReturnBuilder.tsx

import * as React from "react";

function StepPill({ n, active, label }: { n: number; active: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 text-xs ${active ? "text-white" : "text-muted-foreground"}`}>
      <div className={`h-5 w-5 rounded-full grid place-items-center ${active ? "bg-blue-600" : "bg-muted"}`}>{n}</div>
      <div>{label}</div>
    </div>
  );
}
function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

export function ReturnBuilder({
  saleDetail, open, onClose, state, setState, saveSelections, finalize
}: {
  saleDetail: any;
  open: boolean;
  onClose: () => void;
  state: {
    step: 1 | 2;
    busy: boolean;
    draft: { id: number; refund_total: number } | null;
    lineQty: Record<number, number>;
    refunds: Array<{ method: "CASH" | "CARD" | "STORE_CREDIT" | "OTHER"; amount: number; external_ref?: string }>;
  };
  setState: (patch: any) => void;
  saveSelections: () => Promise<void>;
  finalize: () => Promise<void>;
}) {
  if (!open || !state.draft) return null;
  const totalSelected = Object.values(state.lineQty).reduce((a, b) => a + (Number(b) || 0), 0);

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-card border-l border-border shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-4">
            <StepPill n={1} active={state.step === 1} label="Select items" />
            <StepPill n={2} active={state.step === 2} label="Refund" />
          </div>
          <button className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-white/5" onClick={onClose}>Close</button>
        </div>

        <div className="p-5 space-y-4 overflow-auto h-full">
          {state.step === 1 && (
            <>
              <div className="text-sm text-muted-foreground">Choose items and quantities to return.</div>
              <div className="rounded-xl border border-border divide-y divide-border">
                {saleDetail.lines.map((ln: any) => (
                  <div key={ln.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-foreground truncate">{ln.product_name || "Item"}</div>
                      <div className="text-xs text-muted-foreground truncate">{ln.variant_name || ln.sku}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">Sold: <span className="text-foreground">{ln.quantity}</span></div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min={0} max={ln.quantity} value={state.lineQty[ln.id] ?? 0}
                        onChange={(e) => {
                          const val = clamp(parseInt(e.target.value || "0", 10), 0, Number(ln.quantity || 0));
                          setState({ lineQty: { ...state.lineQty, [ln.id]: val } });
                        }}
                        className="w-20 rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">Total items selected: <span className="text-foreground">{totalSelected}</span></div>
                <button
                  disabled={state.busy || totalSelected === 0}
                  onClick={saveSelections}
                  className="rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-3 py-1.5 text-sm font-medium text-white"
                >
                  Continue
                </button>
              </div>
            </>
          )}

          {state.step === 2 && (
            <>
              <div className="text-sm text-muted-foreground">Refund total: <span className="font-semibold text-white">${Number(state.draft.refund_total || 0).toFixed(2)}</span></div>
              <div className="rounded-xl border border-border p-3 space-y-2">
                {(state.refunds.length === 0 ? [{ method: "CASH", amount: Number(state.draft.refund_total || 0) }] : state.refunds).map((r, idx) => (
                  <div key={idx} className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                    <select
                      value={r.method}
                      onChange={(e) => {
                        const copy = [...state.refunds];
                        copy[idx] = { ...copy[idx], method: e.target.value as any };
                        setState({ refunds: copy });
                      }}
                      className="rounded-md border border-border bg-card text-xs text-foreground px-2 py-1"
                    >
                      <option value="CASH">Cash</option>
                      <option value="CARD">Card</option>
                      <option value="STORE_CREDIT">Store credit</option>
                      <option value="OTHER">Other</option>
                    </select>
                    <input
                      type="number" step="0.01" min={0} value={r.amount}
                      onChange={(e) => {
                        const copy = [...state.refunds];
                        copy[idx] = { ...copy[idx], amount: Number(e.target.value || 0) };
                        setState({ refunds: copy });
                      }}
                      className="w-32 rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground"
                    />
                    <button className="text-xs text-muted-foreground rounded px-2 py-1 hover:bg-white/5"
                      onClick={() => setState({ refunds: state.refunds.filter((_, i) => i !== idx) })}>Remove</button>
                  </div>
                ))}
                <button className="text-xs text-muted-foreground rounded px-2 py-1 hover:bg-white/5"
                  onClick={() => setState({ refunds: [...state.refunds, { method: "CASH", amount: 0 }] })}>
                  + Add method
                </button>
              </div>
              <div className="flex items-center justify-between">
                <button className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-white/5" onClick={() => setState({ step: 1 })}>Back</button>
                <button disabled={state.busy} onClick={finalize} className="rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3 py-1.5 text-sm font-medium text-white">
                  Finalize return
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
