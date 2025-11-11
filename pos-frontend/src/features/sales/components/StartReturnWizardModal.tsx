import * as React from "react";
import { useNotify } from "@/lib/notify";
import { putReturnItems, finalizeReturn } from "../api";
import { useMoney } from "../useMoney";

type RefundLine = { method: "CASH" | "CARD" | "STORE_CREDIT" | "OTHER"; amount: number; external_ref?: string };

function StepPill({ n, active, label }: { n: number; active: boolean; label: string }) {
    return (
        <div className={`flex items-center gap-2 text-xs ${active ? "text-white" : "text-zinc-400"}`}>
            <div className={`h-5 w-5 rounded-full grid place-items-center ${active ? "bg-blue-600" : "bg-zinc-700"}`}>{n}</div>
            <div>{label}</div>
        </div>
    );
}
function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

export default function StartReturnWizardModal({
    open, onClose, saleDetail, draft, onFinalized,
}: {
    open: boolean;
    onClose: () => void;
    saleDetail: any; // current SaleDetail
    draft: { id: number; refund_total: number } | null; // created in StartReturnModal step
    onFinalized: () => Promise<void> | void;            // refresh detail/returns after finalize
}) {
    const { error, success } = useNotify();
    const { safeMoney } = useMoney();

    const [step, setStep] = React.useState<1 | 2>(1); // 1 = Items, 2 = Refund
    const [busy, setBusy] = React.useState(false);
    const [lineQty, setLineQty] = React.useState<Record<number, number>>({});
    const [lineReason, setLineReason] = React.useState<Record<number, string>>({});
    const [lineNotes, setLineNotes] = React.useState<Record<number, string>>({});
    const [refunds, setRefunds] = React.useState<RefundLine[]>([]);
    const [refundTotal, setRefundTotal] = React.useState<number>(Number(draft?.refund_total || 0));
    const [activeLineId, setActiveLineId] = React.useState<number | null>(null);

    // Reset when opened with new draft
    React.useEffect(() => {
        if (open && draft && saleDetail) {
            const seed: Record<number, number> = {};
            (saleDetail.lines || []).forEach((ln: any) => { seed[ln.id] = 0; });
            setLineQty(seed);
            setLineReason({});
            setLineNotes({});
            setRefunds([]);
            setRefundTotal(Number(draft.refund_total || 0));
            setStep(1);
            setBusy(false);
            setActiveLineId(null);
        }
    }, [open, draft, saleDetail]);

    if (!open || !draft || !saleDetail) return null;
    const totalSelected = Object.values(lineQty).reduce((a, b) => a + (Number(b) || 0), 0);

    async function handleSaveItems() {
        if (totalSelected === 0) {
            error("Select at least one item to continue.");
            return;
        }
        // Inline validation: any line with qty>0 must have a reason; notes <= 250
        const linesNeedingReason = (saleDetail.lines || []).filter((ln: any) => (Number(lineQty[ln.id] || 0) > 0) && !(lineReason[ln.id]?.trim()));
        if (linesNeedingReason.length > 0) {
            error("Please select a reason for each returned line.");
            // focus the first offending line
            setActiveLineId(linesNeedingReason[0].id);
            return;
        }
        const tooLong = (saleDetail.lines || []).some((ln: any) => (lineNotes[ln.id] || "").trim().length > 250);
        if (tooLong) {
            error("Notes must be 250 characters or fewer.");
            return;
        }
        setBusy(true);
        try {
            const items = (saleDetail.lines || [])
                .map((ln: any) => ({
                    sale_line: ln.id,
                    qty_returned: Number(lineQty[ln.id] || 0),
                    restock: true,
                    reason_code: (lineReason[ln.id] || "").trim(),
                    notes: (lineNotes[ln.id] || "").trim() || undefined,
                }))

                .filter(it => it.qty_returned > 0);

            const updated = await putReturnItems(draft.id, items);
            const rt = Number(updated.refund_total || 0);
            setRefundTotal(rt);
            // initialize one refund line to the full amount
            setRefunds([{ method: "CASH", amount: rt }]);
            setStep(2);
        } catch (e: any) {
            const msg = e?.message || e?.detail || "Could not save items.";
            error(msg);
        } finally {
            setBusy(false);
        }
    }

    async function handleFinalize() {
        const sum = refunds.reduce((a, r) => a + Number(r.amount || 0), 0);
        if (Number(sum.toFixed(2)) !== Number(Number(refundTotal || 0).toFixed(2))) {
            error("Refund breakdown must equal the refund total.");
            return;
        }
        setBusy(true);
        try {
            await finalizeReturn(draft.id, refunds);
            success("Return finalized.");
            await onFinalized?.();
            onClose();
        } catch (e: any) {
            const msg = e?.message || e?.detail || "Could not finalize return.";
            error(msg);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="fixed inset-0 z-[75]">
            {/* full-screen sheet */}
            <div className="absolute inset-0 bg-black/60" onClick={onClose} />
            <div className="absolute inset-0 flex flex-col bg-zinc-900">
                {/* Header */}
                <div className="border-b border-zinc-800 px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="text-base font-semibold text-zinc-100">
                            Return for {saleDetail?.receipt_no || `#${saleDetail?.id}`}
                        </div>
                        <div className="hidden md:flex items-center gap-4">
                            <StepPill n={1} active={step === 1} label="Select items" />
                            <StepPill n={2} active={step === 2} label="Refund" />
                        </div>
                    </div>
                    <button className="rounded-md px-2 py-1 text-xs text-zinc-300 hover:bg-white/5" onClick={onClose}>Close</button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-auto p-5 space-y-4">
                    {/* Sale summary */}
                    <div className="grid grid-cols-2 gap-3 rounded-lg border border-zinc-800 p-3 text-sm">
                        <div><span className="text-zinc-400">Store:</span> {saleDetail.store_name || "—"}</div>
                        <div><span className="text-zinc-400">Cashier:</span> {saleDetail.cashier_name || "—"}</div>
                        <div><span className="text-zinc-400">Date:</span> {saleDetail.created_at ? new Date(saleDetail.created_at).toLocaleString() : "—"}</div>
                        <div><span className="text-zinc-400">Total:</span> {safeMoney(saleDetail.total)}</div>
                    </div>

                    {step === 1 && (
                        <>
                            <div className="text-sm text-zinc-300">Select items to return and specify a reason for each.</div>
                            <div className="grid md:grid-cols-[2fr_1fr] gap-4">
                                {/* Left: items list */}
                                <div className="rounded-xl border border-zinc-800 divide-y divide-zinc-800">
                                    {saleDetail.lines.map((ln: any) => {
                                        const qty = Number(lineQty[ln.id] || 0);
                                        const isActive = activeLineId === ln.id || qty > 0;
                                        return (
                                            <div key={ln.id} className="px-3 py-2">
                                                <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3">
                                                    <div className="min-w-0">
                                                        <div className="text-zinc-100 truncate">{ln.product_name || "Item"}</div>
                                                        <div className="text-xs text-zinc-400 truncate">{ln.variant_name || ln.sku}</div>
                                                    </div>
                                                    <div className="text-xs text-zinc-400">Sold: <span className="text-zinc-200">{ln.quantity}</span></div>
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="number" min={0} max={ln.quantity} value={qty}
                                                            onChange={(e) => {
                                                                const val = clamp(parseInt(e.target.value || "0", 10), 0, Number(ln.quantity || 0));
                                                                setLineQty((prev) => ({ ...prev, [ln.id]: val }));
                                                                setActiveLineId(ln.id);
                                                            }}
                                                            className="w-20 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
                                                        />
                                                    </div>
                                                </div>
                                                {/* Expand reason/notes when active */}
                                                {isActive && (
                                                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                                                        <label className="text-xs block">
                                                            <span className="mb-1 block text-zinc-300">Reason<span className="text-red-400">*</span></span>
                                                            <select
                                                                value={lineReason[ln.id] || ""}
                                                                onChange={(e) => setLineReason((prev) => ({ ...prev, [ln.id]: e.target.value }))}
                                                                className={`w-full rounded-md border bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 ${(qty > 0 && !(lineReason[ln.id]?.trim())) ? "border-red-600" : "border-zinc-700"
                                                                    }`}
                                                            >
                                                                <option value="">Select a reason…</option>
                                                                <option value="DEFECTIVE">Defective / Damaged</option>
                                                                <option value="WRONG_ITEM">Wrong item</option>
                                                                <option value="CHANGED_MIND">Customer changed mind</option>
                                                                <option value="OTHER">Other</option>
                                                            </select>
                                                        </label>
                                                        <label className="text-xs block">
                                                            <span className="mb-1 block text-zinc-300">Notes (optional)</span>
                                                            <input
                                                                value={lineNotes[ln.id] || ""}
                                                                onChange={(e) => setLineNotes((prev) => ({ ...prev, [ln.id]: e.target.value }))}
                                                                maxLength={250}
                                                                placeholder="Short note…"
                                                                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                                                            />
                                                        </label>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Right: running help / policy / quick tips */}
                                <div className="space-y-3">
                                    <div className="rounded-lg border border-amber-600/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                                        Reason is required for each returned line. Notes are optional (max 250 chars).
                                    </div>
                                    <div className="rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-300">
                                        Total items selected:&nbsp;<span className="text-white font-medium">{totalSelected}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <div />
                                <button
                                    disabled={busy || totalSelected === 0}
                                    onClick={handleSaveItems}
                                    className="rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-3 py-1.5 text-sm font-medium text-white"
                                >
                                    Save & Continue
                                </button>
                            </div>
                        </>
                    )}

                    {step === 2 && (
                        <>
                            <div className="text-sm text-zinc-300">
                                Refund total:&nbsp;<span className="font-semibold text-white">{safeMoney(refundTotal)}</span>
                            </div>
                            <div className="rounded-xl border border-zinc-800 p-3 space-y-2">
                                {(refunds.length === 0 ? [{ method: "CASH", amount: refundTotal }] : refunds).map((r, idx) => (
                                    <div key={idx} className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                                        <select
                                            value={r.method}
                                            onChange={(e) => {
                                                const copy = [...refunds];
                                                copy[idx] = { ...copy[idx], method: e.target.value as any };
                                                setRefunds(copy);
                                            }}
                                            className="rounded-md border border-zinc-700 bg-zinc-900 text-xs text-zinc-100 px-2 py-1"
                                        >
                                            <option value="CASH">Cash</option>
                                            <option value="CARD">Card</option>
                                            <option value="STORE_CREDIT">Store credit</option>
                                            <option value="OTHER">Other</option>
                                        </select>
                                        <input
                                            type="number" step="0.01" min={0} value={r.amount}
                                            onChange={(e) => {
                                                const copy = [...refunds];
                                                copy[idx] = { ...copy[idx], amount: Number(e.target.value || 0) };
                                                setRefunds(copy);
                                            }}
                                            className="w-32 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
                                        />
                                        <button className="text-xs text-zinc-300 rounded px-2 py-1 hover:bg-white/5"
                                            onClick={() => setRefunds(refunds.filter((_, i) => i !== idx))}>Remove</button>
                                    </div>
                                ))}
                                <button className="text-xs text-zinc-300 rounded px-2 py-1 hover:bg-white/5"
                                    onClick={() => setRefunds([...refunds, { method: "CASH", amount: 0 }])}>
                                    + Add method
                                </button>
                            </div>

                            <div className="flex items-center justify-between">
                                <button className="rounded-md px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/5" onClick={() => setStep(1)}>Back</button>
                                <button
                                    disabled={busy}
                                    onClick={handleFinalize}
                                    className="rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3 py-1.5 text-sm font-medium text-white"
                                >
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
