import * as React from "react";
import { useNotify } from "@/lib/notify";
import { startReturnForSale, putReturnItems, finalizeReturn } from "../api";
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
    draft: { id: number; refund_total: number } | null; // may be null at open
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
    const [reviewItems, setReviewItems] = React.useState<any[]>([]);
    const [draftId, setDraftId] = React.useState<number | null>(draft?.id ?? null);
    const [activeLineId, setActiveLineId] = React.useState<number | null>(null);
    // bulk apply reason to all lines with qty > 0
    const [bulkReason, setBulkReason] = React.useState<string>("");



    // keep stable order of lines for auto-advance
    const lineIds = React.useMemo(() => (saleDetail?.lines || []).map((ln: any) => ln.id), [saleDetail]);
    // refs to qty inputs so we can focus/scroll the next one

    const qtyRefs = React.useRef<Record<number, HTMLInputElement | null>>({});
    const notesRefs = React.useRef<Record<number, HTMLInputElement | null>>({});
    const reasonRefs = React.useRef<Record<number, HTMLSelectElement | null>>({});

    // --- refund helpers ---
    const sumRefunds = React.useCallback(
        (arr: RefundLine[] = refunds) => arr.reduce((a, r) => a + Number(r.amount || 0), 0),
        [refunds]
    );
    const remainingToAllocate = React.useMemo(
        () => Number((Number(refundTotal || 0) - sumRefunds()).toFixed(2)),
        [refundTotal, sumRefunds]
    );

    function handleAmountChange(idx: number, nextAmount: number) {
        const copy = [...refunds];
        const clean = Math.max(0, Number(nextAmount || 0));
        copy[idx] = { ...copy[idx], amount: clean };
        // Clamp so sum never exceeds refundTotal
        const after = sumRefunds(copy);
        if (after > Number(refundTotal || 0)) {
            const over = after - Number(refundTotal || 0);
            copy[idx].amount = Number((clean - over).toFixed(2));
        }
        setRefunds(copy);
    }

    function handleAddMethod() {
        const remaining = Math.max(0, Number((Number(refundTotal || 0) - sumRefunds()).toFixed(2)));
        setRefunds([...refunds, { method: "CASH", amount: remaining }]);
    }

    function handleRemoveMethod(idx: number) {
        if (refunds.length <= 1) return; // keep at least one
        const copy = refunds.filter((_, i) => i !== idx);
        setRefunds(copy);
    }

    function splitEvenly() {
        const n = Math.max(1, refunds.length);
        const each = Math.floor((Number(refundTotal || 0) / n) * 100) / 100; // round down to cents
        const last = Number((Number(refundTotal || 0) - each * (n - 1)).toFixed(2));
        const next = refunds.map((r, i) => ({ ...r, amount: i === n - 1 ? last : each }));
        setRefunds(next);
    }

    function applyRemainderToRow(idx: number) {
        const rem = Math.max(0, remainingToAllocate);
        if (rem === 0) return;
        const copy = [...refunds];
        const current = Number(copy[idx].amount || 0);
        copy[idx] = { ...copy[idx], amount: Number((current + rem).toFixed(2)) };
        setRefunds(copy);
    }


    function autoAdvanceFrom(currentId: number) {
        const idx = lineIds.indexOf(currentId);
        if (idx < 0) return;
        for (let i = idx + 1; i < lineIds.length; i++) {
            const nextId = lineIds[i];
            const ln = (saleDetail.lines as any[]).find((l) => l.id === nextId);
            if (!ln) continue;
            const returned = Number(ln.returned_qty || 0);
            const remaining = Number(ln.refundable_qty ?? Math.max(0, (ln.quantity || 0) - returned));
            if (remaining > 0) {
                setActiveLineId(nextId);
                // Focus next qty field if present
                const el = qtyRefs.current[nextId];
                if (el) {
                    el.focus();
                    el.scrollIntoView({ block: "center" });
                }
                break;
            }
        }
    }


    // Reset when opened (with or without draft)
    React.useEffect(() => {
        if (open && saleDetail) {
            const seed: Record<number, number> = {};
            (saleDetail.lines || []).forEach((ln: any) => { seed[ln.id] = 0; });
            setLineQty(seed);
            setLineReason({});
            setLineNotes({});
            setRefunds([]);
            setRefundTotal(Number(draft?.refund_total || 0));
            setStep(1);
            setBusy(false);
            setActiveLineId(null);
            setDraftId(draft?.id ?? null);
        }
    }, [open, draft, saleDetail]);

    if (!open || !saleDetail) return null;
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
            // Create draft if needed
            let id = draftId;
            if (!id) {
                const ret = await startReturnForSale(saleDetail.id);
                id = ret.id;
                setDraftId(id);
            }
            const items = (saleDetail.lines || [])
                .map((ln: any) => ({
                    sale_line: ln.id,
                    qty_returned: Number(lineQty[ln.id] || 0),
                    restock: true,
                    reason_code: (lineReason[ln.id] || "").trim(),
                    notes: (lineNotes[ln.id] || "").trim() || undefined,
                }))

                .filter(it => it.qty_returned > 0);

            const updated = await putReturnItems(id!, items);
            const rt = Number(updated.refund_total || 0);
            setReviewItems(Array.isArray(updated.items) ? updated.items : []);
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
            if (!draftId) {
                error("Draft was not created yet.");
                return;
            }
            await finalizeReturn(draftId, refunds);
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
                                <div className="rounded-xl border border-zinc-800">
                                    {/* Sticky header */}
                                    <div className="sticky top-0 z-10 grid grid-cols-[1fr_12rem_6rem] items-center gap-3 bg-zinc-900/80 backdrop-blur border-b border-zinc-800 px-3 py-2 text-[11px] uppercase tracking-wide text-zinc-400">
                                        <div>Item</div>
                                        <div className="grid grid-cols-3 gap-2 text-center">
                                            <div>Sold</div>
                                            <div>Returned</div>
                                            <div>Remaining</div>
                                        </div>
                                        <div className="text-center">Qty</div>
                                    </div>

                                    {/* Rows */}
                                    <div className="divide-y divide-zinc-800">
                                        {saleDetail.lines.map((ln: any) => {
                                            const qty = Number(lineQty[ln.id] || 0);
                                            const isActive = activeLineId === ln.id || qty > 0;
                                            const returned = Number(ln.returned_qty || 0);
                                            const remaining = Number(
                                                ln.refundable_qty ?? Math.max(0, (ln.quantity || 0) - returned)
                                            );
                                            const maxQty = remaining;

                                            return (
                                                <div key={ln.id} className="px-3 py-2">
                                                    {/* Row grid */}
                                                    <div className="grid grid-cols-[1fr_12rem_6rem] items-center gap-3">
                                                        {/* Item */}
                                                        <div className="min-w-0">
                                                            <div className="text-zinc-100 truncate">
                                                                {ln.product_name || "Item"}
                                                            </div>
                                                            <div className="text-xs text-zinc-400 truncate">
                                                                {ln.variant_name || ln.sku}
                                                            </div>
                                                        </div>

                                                        {/* Metrics */}
                                                        <div className="grid grid-cols-3 gap-2 text-[11px]">
                                                            <div className="text-center">
                                                                <div className="text-zinc-400 uppercase">Sold</div>
                                                                <div className="tabular-nums text-zinc-200 font-medium">
                                                                    {ln.quantity}
                                                                </div>
                                                            </div>
                                                            <div className="text-center">
                                                                <div className="text-zinc-400 uppercase">Returned</div>
                                                                <div className="tabular-nums text-amber-300 font-medium">
                                                                    {returned}
                                                                </div>
                                                            </div>
                                                            <div className="text-center">
                                                                <div className="text-zinc-400 uppercase">Remaining</div>
                                                                <div
                                                                    className={`tabular-nums font-medium ${remaining === 0 ? "text-red-400" : "text-emerald-300"
                                                                        }`}
                                                                >
                                                                    {remaining}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Qty */}
                                                        <div className="flex items-center justify-center">
                                                            {maxQty === 0 ? (
                                                                <span className="rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-400">
                                                                    Fully returned
                                                                </span>
                                                            ) : (
                                                                <input
                                                                    ref={(el) => {
                                                                        qtyRefs.current[ln.id] = el;
                                                                    }}
                                                                    aria-label={`Quantity to return for ${ln.product_name || ln.sku || "item"
                                                                        }`}
                                                                    type="number"
                                                                    min={0}
                                                                    max={maxQty}
                                                                    value={qty}
                                                                    onChange={(e) => {
                                                                        const val = clamp(
                                                                            parseInt(e.target.value || "0", 10),
                                                                            0,
                                                                            maxQty
                                                                        );
                                                                        setLineQty((prev) => ({ ...prev, [ln.id]: val }));
                                                                        setActiveLineId(ln.id);
                                                                    }}
                                                                    onKeyDown={(e) => {
                                                                        // Enter or Tab (no Shift) sends focus to Reason on the same row
                                                                        if ((e.key === "Enter") || (e.key === "Tab" && !e.shiftKey)) {
                                                                            e.preventDefault();
                                                                            const sel = reasonRefs.current[ln.id];
                                                                            if (sel) sel.focus();
                                                                        }
                                                                    }}
                                                                    className="w-20 text-center rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
                                                                />
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Expand reason/notes when active */}
                                                    {isActive && (
                                                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                                                            <label className="text-xs block">
                                                                <span className="mb-1 block text-zinc-300">
                                                                    Reason<span className="text-red-400">*</span>
                                                                </span>
                                                                <select
                                                                    value={lineReason[ln.id] || ""}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value;
                                                                        setLineReason((prev) => ({ ...prev, [ln.id]: val }));
                                                                        // no auto-advance; stay on this row
                                                                        setActiveLineId(ln.id);
                                                                    }}
                                                                    onKeyDown={(e) => {
                                                                        // Tab (no Shift) moves focus to Notes on the same row
                                                                        if (e.key === "Tab" && !e.shiftKey) {
                                                                            e.preventDefault();
                                                                            const n = notesRefs.current[ln.id];
                                                                            if (n) n.focus();
                                                                        }
                                                                    }}
                                                                    ref={(el) => { reasonRefs.current[ln.id] = el; }}
                                                                    className={`w-full rounded-md border bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 ${qty > 0 && !(lineReason[ln.id]?.trim())
                                                                        ? "border-red-600"
                                                                        : "border-zinc-700"
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
                                                                <span className="mb-1 block text-zinc-300">
                                                                    Notes (optional)
                                                                </span>
                                                                <input
                                                                    ref={(el) => { notesRefs.current[ln.id] = el; }}
                                                                    value={lineNotes[ln.id] || ""}
                                                                    onChange={(e) =>
                                                                        setLineNotes((prev) => ({
                                                                            ...prev,
                                                                            [ln.id]: e.target.value,
                                                                        }))
                                                                    }
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === "Enter") {
                                                                            e.preventDefault();
                                                                            // go to the next refundable line's Qty
                                                                            const idx = lineIds.indexOf(ln.id);
                                                                            for (let i = idx + 1; i < lineIds.length; i++) {
                                                                                const nextId = lineIds[i];
                                                                                const nxt = (saleDetail.lines as any[]).find((l) => l.id === nextId);
                                                                                if (!nxt) continue;
                                                                                const returned = Number(nxt.returned_qty || 0);
                                                                                const remaining = Number(nxt.refundable_qty ?? Math.max(0, (nxt.quantity || 0) - returned));
                                                                                if (remaining > 0) {
                                                                                    setActiveLineId(nextId);
                                                                                    const el = qtyRefs.current[nextId];
                                                                                    if (el) {
                                                                                        el.focus();
                                                                                        el.scrollIntoView({ block: "center" });
                                                                                    }
                                                                                    break;
                                                                                }
                                                                            }
                                                                        }
                                                                    }}
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
                                </div>

                                {/* Right: help / policy / quick actions */}
                                <div className="space-y-3">
                                    {/* Policy note with (i) hover/focus info */}
                                    <div className="rounded-lg border border-amber-600/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 relative">
                                        <div className="flex items-start gap-2">
                                            <span>
                                                Reason is required for each returned line. Notes are optional (max 250 chars).
                                            </span>
                                            <div
                                                className="relative ml-auto inline-block group"
                                                tabIndex={0}
                                                aria-label="Return policy info"
                                            >
                                                <button
                                                    type="button"
                                                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-600/20 text-amber-200"
                                                    aria-haspopup="dialog"
                                                    aria-expanded="false"
                                                >
                                                    i
                                                </button>
                                                <div className="pointer-events-none absolute right-0 top-6 z-10 hidden w-64 rounded-md border border-zinc-800 bg-zinc-900 p-2 text-[11px] text-zinc-300 shadow-xl group-hover:block group-focus-within:block">
                                                    <div className="font-medium text-zinc-100 mb-1">Store policy</div>
                                                    <ul className="list-disc pl-4 space-y-1">
                                                        <li>Returns within 30 days (configurable).</li>
                                                        <li>Receipt required; reasons captured per item.</li>
                                                        <li>Items with zero remaining are fully returned.</li>
                                                        <li>Restock may be required for resaleable goods.</li>
                                                    </ul>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Quick action: copy reason / clear reasons */}
                                    <div className="rounded-lg border border-zinc-800 p-3">
                                        <div className="text-xs text-zinc-400 mb-1">Quick actions</div>
                                        <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                                            <select
                                                value={bulkReason}
                                                onChange={(e) => setBulkReason(e.target.value)}
                                                className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                                            >
                                                <option value="">Select a reason…</option>
                                                <option value="DEFECTIVE">Defective / Damaged</option>
                                                <option value="WRONG_ITEM">Wrong item</option>
                                                <option value="CHANGED_MIND">Customer changed mind</option>
                                                <option value="OTHER">Other</option>
                                            </select>
                                            <button
                                                type="button"
                                                disabled={!bulkReason || totalSelected === 0}
                                                onClick={() => {
                                                    if (!bulkReason) return;
                                                    setLineReason((prev) => {
                                                        const next = { ...prev };
                                                        (saleDetail.lines || []).forEach((l: any) => {
                                                            if (Number(lineQty[l.id] || 0) > 0) next[l.id] = bulkReason;
                                                        });
                                                        return next;
                                                    });
                                                }}
                                                className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                                            >
                                                Copy reason to selected
                                            </button>
                                            <button
                                                type="button"
                                                disabled={totalSelected === 0}
                                                onClick={() =>
                                                    setLineReason((prev) => {
                                                        const next = { ...prev };
                                                        (saleDetail.lines || []).forEach((l: any) => {
                                                            if (Number(lineQty[l.id] || 0) > 0) next[l.id] = "";
                                                        });
                                                        return next;
                                                    })
                                                }
                                                className="rounded-md px-2.5 py-1 text-xs font-medium text-zinc-200 hover:bg-white/5 disabled:opacity-50"
                                            >
                                                Clear reasons
                                            </button>
                                        </div>
                                    </div>

                                    <div className="rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-300">
                                        Total items selected:&nbsp;
                                        <span className="text-white font-medium">{totalSelected}</span>
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
                            <div className="grid md:grid-cols-[2fr_1fr] gap-4">
                                {/* Left: review selected items */}
                                <div className="rounded-xl border border-zinc-800 overflow-hidden">
                                    <div className="px-3 py-2 bg-zinc-800 text-xs font-medium uppercase tracking-wide text-zinc-300">
                                        Items to refund
                                    </div>
                                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 py-2 text-[11px] uppercase tracking-wide text-zinc-400 border-b border-zinc-800">
                                        <div>Item / Reason</div>
                                        <div className="text-center">Qty</div>
                                        <div className="text-center">Tax</div>
                                        <div className="text-center">Line total</div>
                                    </div>
                                    <div className="divide-y divide-zinc-800">
                                        {reviewItems.length === 0 && (
                                            <div className="px-3 py-3 text-sm text-zinc-500">No items found for this draft.</div>
                                        )}
                                        {reviewItems.map((it: any) => (
                                            <div key={it.id} className="grid grid-cols-[1fr_auto_auto_auto] items-start gap-3 px-3 py-2 text-sm">
                                                <div className="min-w-0">
                                                    <div className="text-zinc-100 truncate">{it.product_name || `Line #${it.sale_line}`}</div>
                                                    <div className="text-[12px] text-zinc-400 truncate">
                                                        {it.variant_name || it.sku}
                                                    </div>
                                                    <div className="text-[12px] text-zinc-500">
                                                        Reason: <span className="text-zinc-300">{it.reason_code || "—"}</span>
                                                        {it.notes ? <span className="text-zinc-500"> • {it.notes}</span> : null}
                                                    </div>
                                                </div>
                                                <div className="text-center tabular-nums text-zinc-200">{it.qty_returned}</div>
                                                <div className="text-center tabular-nums text-blue-300">{safeMoney(it.refund_tax || 0)}</div>
                                                <div className="text-center tabular-nums text-zinc-100 font-medium">{safeMoney(it.refund_total || 0)}</div>
                                            </div>
                                        ))}
                                    </div>
                                    {/* Footer totals */}
                                    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-3 py-2 border-t border-zinc-800 text-sm">
                                        <div className="text-zinc-400">Totals</div>
                                        <div />
                                        <div className="text-center tabular-nums text-blue-300">
                                            {safeMoney(reviewItems.reduce((s, it) => s + Number(it.refund_tax || 0), 0))}
                                        </div>
                                        <div className="text-center tabular-nums text-white font-semibold">
                                            {safeMoney(refundTotal)}
                                        </div>
                                    </div>
                                </div>

                                {/* Right: refund method breakdown */}
                                <div className="rounded-xl border border-zinc-800 overflow-hidden">
                                    <div className="px-3 py-2 bg-zinc-800 text-xs font-medium uppercase tracking-wide text-zinc-300">
                                        Refund breakdown
                                    </div>
                                    <div className="p-3 space-y-2">
                                        {refunds.map((r, idx) => (
                                            <div key={idx} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2">
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
                                                    onChange={(e) => handleAmountChange(idx, Number(e.target.value))}
                                                    className="w-32 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
                                                />

                                                <button
                                                    type="button"
                                                    onClick={() => applyRemainderToRow(idx)}
                                                    disabled={remainingToAllocate <= 0}
                                                    title={remainingToAllocate > 0 ? `Apply ${safeMoney(remainingToAllocate)} to this method` : "Nothing remaining"}
                                                    className="text-[11px] rounded px-2 py-1 text-zinc-300 hover:bg-white/5 disabled:opacity-40"
                                                >
                                                    Set remainder
                                                </button>

                                                <button
                                                    className="text-xs text-zinc-300 rounded px-2 py-1 hover:bg-white/5 disabled:opacity-40"
                                                    onClick={() => handleRemoveMethod(idx)}
                                                    disabled={refunds.length <= 1}
                                                    title={refunds.length <= 1 ? "At least one method is required" : "Remove method"}
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        ))}

                                        <div className="flex items-center gap-2">
                                            <button
                                                className="text-xs text-zinc-300 rounded px-2 py-1 hover:bg-white/5"
                                                onClick={handleAddMethod}
                                            >
                                                + Add method
                                            </button>
                                            <button
                                                className="text-xs text-zinc-300 rounded px-2 py-1 hover:bg-white/5"
                                                onClick={splitEvenly}
                                                disabled={refunds.length < 2}
                                                title={refunds.length < 2 ? "Add another method to split" : "Split total evenly"}
                                            >
                                                Split evenly
                                            </button>
                                        </div>
                                    </div>


                                    {/* Totals check */}
                                    <div className="border-t border-zinc-800 px-3 py-2 text-sm">
                                        <div className="flex items-center justify-between">
                                            <div className="text-zinc-300">Refund total</div>
                                            <div className="font-semibold text-white">{safeMoney(refundTotal)}</div>
                                        </div>

                                        <div className="mt-1 flex items-center justify-between">
                                            <div className="text-zinc-400">Methods sum</div>
                                            <div className={`tabular-nums ${remainingToAllocate === 0 ? "text-emerald-300" : "text-amber-300"}`}>
                                                {safeMoney(sumRefunds())}
                                            </div>
                                        </div>

                                        <div className="mt-1 flex items-center justify-between">
                                            <div className="text-zinc-400">Remaining</div>
                                            <div className={`tabular-nums ${remainingToAllocate === 0 ? "text-emerald-300" : "text-amber-300"}`}>
                                                {safeMoney(remainingToAllocate)}
                                            </div>
                                        </div>
                                    </div>

                                </div>
                            </div>

                            <div className="flex items-center justify-between mt-4">
                                <button className="rounded-md px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/5" onClick={() => setStep(1)}>
                                    Back
                                </button>
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
