import * as React from "react";
import { useNotify } from "@/lib/notify";
import { startReturnForSale, putReturnItems, finalizeReturn } from "../api";

type RefundLine = { method: "CASH" | "CARD" | "STORE_CREDIT" | "OTHER"; amount: number; external_ref?: string };

function StepPill({ n, active, label }: { n: number; active: boolean; label: string }) {
    return (
        <div className={`flex items-center gap-2 text-xs ${active ? "text-white" : "text-muted-foreground"}`}>
            <div className={`h-5 w-5 rounded-full grid place-items-center ${active ? "bg-blue-600" : "bg-muted"}`}>{n}</div>
            <div>{label}</div>
        </div>
    );
}
function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

export default function StartReturnWizardModal({
    open, onClose, saleDetail, draft, onFinalized, safeMoney: safeMoneyProp,
}: {
    open: boolean;
    onClose: () => void;
    saleDetail: any; // current SaleDetail
    draft: { id: number; refund_total: number } | null; // may be null at open
    onFinalized: () => Promise<void> | void;            // refresh detail/returns after finalize
    safeMoney: (v: any) => string;
}) {
    const { error, success } = useNotify();
    const safeMoney = safeMoneyProp;

    const [step, setStep] = React.useState<1 | 2>(1); // 1 = Items, 2 = Refund
    const [busy, setBusy] = React.useState(false);
    const [lineQty, setLineQty] = React.useState<Record<number, number>>({});
    const [lineReason, setLineReason] = React.useState<Record<number, string>>({});
    const [lineNotes, setLineNotes] = React.useState<Record<number, string>>({});
    const [lineRestock, setLineRestock] = React.useState<Record<number, boolean>>({});
    const [lineCondition, setLineCondition] = React.useState<Record<number, string>>({});
    const [refunds, setRefunds] = React.useState<RefundLine[]>([]);
    const [refundTotal, setRefundTotal] = React.useState<number>(Number(draft?.refund_total || 0));
    const [reviewItems, setReviewItems] = React.useState<any[]>([]);
    const [returnTotals, setReturnTotals] = React.useState<{
        subtotal: number;
        tax: number;
        total: number;
    } | null>(null);

    const [draftId, setDraftId] = React.useState<number | null>(draft?.id ?? null);
    const [activeLineId, setActiveLineId] = React.useState<number | null>(null);
    // bulk apply reason to all lines with qty > 0
    const [bulkReason, setBulkReason] = React.useState<string>("");
    // bulk restock toggle (default ON)
    const [restockAll, setRestockAll] = React.useState<boolean>(true);
    // show only lines with qty > 0 in Step 1
    const [showSelectedOnly, setShowSelectedOnly] = React.useState<boolean>(false);




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
            const restockSeed: Record<number, boolean> = {};
            const condSeed: Record<number, string> = {};
            (saleDetail.lines || []).forEach((ln: any) => {
                seed[ln.id] = 0;
                restockSeed[ln.id] = true;              // default restock ON
                condSeed[ln.id] = "RESALEABLE";         // default condition
            });
            setLineQty(seed);
            setLineReason({});
            setLineNotes({});
            setLineRestock(restockSeed);
            setLineCondition(condSeed);
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
                    restock: lineRestock[ln.id] !== false,               // default true
                    condition: lineCondition[ln.id] || "RESALEABLE",
                    reason_code: (lineReason[ln.id] || "").trim(),
                    notes: (lineNotes[ln.id] || "").trim() || undefined,
                }))

                .filter(it => it.qty_returned > 0);

            const updated = await putReturnItems(id!, items);

            const rt = Number(updated.refund_total || 0);
            setReviewItems(Array.isArray(updated.items) ? updated.items : []);
            setRefundTotal(rt);
            setReturnTotals({
                subtotal: Number(updated.refund_subtotal_total || 0),
                tax: Number(updated.refund_tax_total || 0),
                total: rt,
            });
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
            <div className="absolute inset-0 flex flex-col bg-card">
                {/* Header */}
                <div className="border-b border-border px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="text-base font-semibold text-foreground">
                            Return for {saleDetail?.receipt_no || `#${saleDetail?.id}`}
                        </div>
                        <div className="hidden md:flex items-center gap-4">
                            <StepPill n={1} active={step === 1} label="Select items" />
                            <StepPill n={2} active={step === 2} label="Refund" />
                        </div>
                    </div>
                    <button className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-white/5" onClick={onClose}>Close</button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-auto p-5 space-y-4">
                    {/* Sale summary */}
                    <div className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3 text-sm">
                        <div><span className="text-muted-foreground">Store:</span> {saleDetail.store_name || "—"}</div>
                        <div><span className="text-muted-foreground">Cashier:</span> {saleDetail.cashier_name || "—"}</div>
                        <div><span className="text-muted-foreground">Date:</span> {saleDetail.created_at ? new Date(saleDetail.created_at).toLocaleString() : "—"}</div>
                        <div><span className="text-muted-foreground">Total:</span> {safeMoney(saleDetail.total)}</div>
                    </div>

                    {step === 1 && (
                        <>
                            <div className="text-sm text-muted-foreground">Select items to return and specify a reason for each.</div>
                            <div className="grid md:grid-cols-[2fr_1fr] gap-4">
                                {/* Left: items list */}
                                <div className="rounded-xl border border-border">
                                    {/* Sticky header */}
                                    <div className="sticky top-0 z-10 grid grid-cols-[1fr_12rem_6rem] items-center gap-3 bg-muted/80 backdrop-blur border-b border-border px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                                        <div>Item</div>
                                        <div className="grid grid-cols-3 gap-2 text-center">
                                            <div>Sold</div>
                                            <div>Returned</div>
                                            <div>Remaining</div>
                                        </div>
                                        <div className="text-center">Qty</div>
                                    </div>



                                    {/* Rows */}
                                    <div className="divide-y divide-border">
                                        {saleDetail.lines.map((ln: any) => {
                                            const qty = Number(lineQty[ln.id] || 0);
                                            const isActive = activeLineId === ln.id || qty > 0;
                                            const returned = Number(ln.returned_qty || 0);
                                            const remaining = Number(
                                                ln.refundable_qty ?? Math.max(0, (ln.quantity || 0) - returned)
                                            );
                                            const maxQty = remaining;

                                            // ✅ Hide unselected lines when toggle is ON
                                            if (showSelectedOnly && qty <= 0) {
                                                return null;
                                            }

                                            return (
                                                // <div key={ln.id} className="px-3 py-2">
                                                <div
                                                    key={ln.id}
                                                    className="px-3 py-2 transition-colors hover:bg-muted/40 cursor-pointer rounded-md"
                                                >

                                                    {/* Row grid */}
                                                    <div className="grid grid-cols-[1fr_12rem_6rem] items-center gap-3">
                                                        {/* Item */}
                                                        <div className="min-w-0 flex items-center gap-2">
                                                        {/* Avatar */}
                                                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-[11px] font-medium text-muted-foreground">
                                                            {((ln.product_name || ln.variant_name || ln.sku || "?") as string)
                                                            .trim()
                                                            .charAt(0)
                                                            .toUpperCase()}
                                                        </div>
                                                        {/* Text */}
                                                        <div className="min-w-0">
                                                            <div className="text-foreground truncate">
                                                            {ln.product_name || "Item"}
                                                            </div>
                                                            <div className="text-xs text-muted-foreground truncate">
                                                            {ln.variant_name || ln.sku}
                                                            </div>
                                                        </div>
                                                        </div>


                                                        {/* Metrics */}
                                                        <div className="grid grid-cols-3 gap-2 text-[11px]">
                                                            <div className="text-center">
                                                                <div className="text-muted-foreground uppercase">Sold</div>
                                                                <div className="tabular-nums text-foreground font-medium">
                                                                    {ln.quantity}
                                                                </div>
                                                            </div>
                                                            <div className="text-center">
                                                                <div className="text-muted-foreground uppercase">Returned</div>
                                                                <div className="tabular-nums text-amber-300 font-medium">
                                                                    {returned}
                                                                </div>
                                                            </div>
                                                            <div className="text-center">
                                                                <div className="text-muted-foreground uppercase">Remaining</div>
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
                                                                <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
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
                                                                    className="w-20 text-center rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground"
                                                                />
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* NEW: original pricing strip */}
                                                    <div className="mt-1 text-[11px] text-muted-foreground">
                                                        <span className="mr-2">Original:</span>
                                                        <span className="mr-2">
                                                            Unit <span className="text-foreground">{safeMoney(ln.unit_price)}</span>
                                                        </span>
                                                        <span className="mr-2">
                                                            Subtotal <span className="text-foreground">{safeMoney(ln.line_subtotal)}</span>
                                                        </span>
                                                        <span className="mr-2">
                                                            Discount <span className="text-amber-300">-{safeMoney(ln.discount || 0)}</span>
                                                        </span>
                                                        <span className="mr-2">
                                                            Tax <span className="text-blue-300">{safeMoney(ln.tax || 0)}</span>
                                                        </span>
                                                        <span>
                                                            Total <span className="text-foreground">{safeMoney(ln.line_total)}</span>
                                                        </span>
                                                    </div>
                                                    {/* <div className="mt-2 text-[11px] text-muted-foreground">
                                                    <div className="grid grid-cols-5 gap-2 text-center">
                                                        <div className="uppercase">Unit</div>
                                                        <div className="uppercase">Subt.</div>
                                                        <div className="uppercase">Disc.</div>
                                                        <div className="uppercase">Tax</div>
                                                        <div className="uppercase">Total</div>
                                                    </div>

                                                    <div className="grid grid-cols-5 gap-2 text-center mt-1">
                                                        <div className="tabular-nums text-foreground">{safeMoney(ln.unit_price)}</div>
                                                        <div className="tabular-nums text-foreground">{safeMoney(ln.line_subtotal)}</div>
                                                        <div className="tabular-nums text-amber-300">-{safeMoney(ln.discount || 0)}</div>
                                                        <div className="tabular-nums text-blue-300">{safeMoney(ln.tax || 0)}</div>
                                                        <div className="tabular-nums text-foreground">{safeMoney(ln.line_total)}</div>
                                                    </div>
                                                    </div> */}


                                                    {/* Expand reason/notes when active */}
                                                    {isActive && (
                                                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                                                            {/* Reason */}
                                                            <label className="text-xs block">
                                                                <span className="mb-1 block text-muted-foreground">
                                                                    Reason<span className="text-red-400">*</span>
                                                                </span>
                                                                <select
                                                                    value={lineReason[ln.id] || ""}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value;
                                                                        setLineReason((prev) => ({ ...prev, [ln.id]: val }));
                                                                        setActiveLineId(ln.id);
                                                                    }}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === "Tab" && !e.shiftKey) {
                                                                            e.preventDefault();
                                                                            const n = notesRefs.current[ln.id];
                                                                            if (n) n.focus();
                                                                        }
                                                                    }}
                                                                    ref={(el) => {
                                                                        reasonRefs.current[ln.id] = el;
                                                                    }}
                                                                    className={`w-full rounded-md border bg-card px-2 py-1.5 text-sm text-foreground ${qty > 0 && !(lineReason[ln.id]?.trim()) ? "border-red-600" : "border-border"
                                                                        }`}
                                                                >
                                                                    <option value="">Select a reason…</option>
                                                                    <option value="DEFECTIVE">Defective / Damaged</option>
                                                                    <option value="WRONG_ITEM">Wrong item</option>
                                                                    <option value="CHANGED_MIND">Customer changed mind</option>
                                                                    <option value="OTHER">Other</option>
                                                                </select>
                                                            </label>

                                                            {/* Notes */}
                                                            <label className="text-xs block">
                                                                <span className="mb-1 block text-muted-foreground">
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
                                                                            const idx = lineIds.indexOf(ln.id);
                                                                            for (let i = idx + 1; i < lineIds.length; i++) {
                                                                                const nextId = lineIds[i];
                                                                                const nxt = (saleDetail.lines as any[]).find((l) => l.id === nextId);
                                                                                if (!nxt) continue;
                                                                                const returned = Number(nxt.returned_qty || 0);
                                                                                const remaining = Number(
                                                                                    nxt.refundable_qty ?? Math.max(0, (nxt.quantity || 0) - returned)
                                                                                );
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
                                                                    className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground"
                                                                />
                                                            </label>

                                                            {/* Restock */}
                                                            <label className="text-xs flex items-center gap-2">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={lineRestock[ln.id] !== false}
                                                                    onChange={(e) =>
                                                                        setLineRestock((prev) => ({ ...prev, [ln.id]: e.target.checked }))
                                                                    }
                                                                    className="h-4 w-4 rounded border-border bg-card"
                                                                />
                                                                <span className="text-muted-foreground">Restock to inventory</span>
                                                            </label>

                                                            {/* Condition */}
                                                            <label className="text-xs block">
                                                                <span className="mb-1 block text-muted-foreground">Condition</span>
                                                                <select
                                                                    value={lineCondition[ln.id] || "RESALEABLE"}
                                                                    onChange={(e) =>
                                                                        setLineCondition((prev) => ({ ...prev, [ln.id]: e.target.value }))
                                                                    }
                                                                    className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground"
                                                                >
                                                                    <option value="RESALEABLE">Resaleable</option>
                                                                    <option value="DAMAGED">Damaged</option>
                                                                    <option value="OPEN_BOX">Open box</option>
                                                                </select>
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
                                                <div className="pointer-events-none absolute right-0 top-6 z-10 hidden w-64 rounded-md border border-border bg-card p-2 text-[11px] text-muted-foreground shadow-xl group-hover:block group-focus-within:block">
                                                    <div className="font-medium text-foreground mb-1">Store policy</div>
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
                                    <div className="rounded-lg border border-border p-3">
                                        <div className="text-xs text-muted-foreground mb-1">Quick actions</div>
                                        <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                                            <select
                                                value={bulkReason}
                                                onChange={(e) => setBulkReason(e.target.value)}
                                                className="rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground"
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
                                                className="rounded-md px-2.5 py-1 text-xs font-medium text-foreground hover:bg-white/5 disabled:opacity-50"
                                            >
                                                Clear reasons
                                            </button>
                                        </div>

                                        {/* NEW: bulk restock toggle */}
                                        <div className="mt-3 flex items-center justify-between">
                                            <span className="text-xs text-muted-foreground">Restock selected items</span>
                                            <button
                                                type="button"
                                                disabled={totalSelected === 0}
                                                onClick={() => {
                                                    const next = !restockAll;
                                                    setRestockAll(next);
                                                    setLineRestock((prev) => {
                                                        const copy = { ...prev };
                                                        (saleDetail.lines || []).forEach((l: any) => {
                                                            if (Number(lineQty[l.id] || 0) > 0) {
                                                                copy[l.id] = next;
                                                            }
                                                        });
                                                        return copy;
                                                    });
                                                }}
                                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${restockAll
                                                        ? "bg-emerald-600/20 text-emerald-300 border border-emerald-600/40"
                                                        : "bg-muted text-muted-foreground border border-border"
                                                    } disabled:opacity-50`}
                                            >
                                                {restockAll ? "On" : "Off"}
                                            </button>
                                        </div>

                                        {/* NEW: show only selected toggle */}
                                        <div className="mt-2 flex items-center justify-between">
                                        <span className="text-xs text-muted-foreground">Show only selected items</span>
                                        <button
                                            type="button"
                                            disabled={totalSelected === 0}
                                            onClick={() => setShowSelectedOnly((prev) => !prev)}
                                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                            showSelectedOnly
                                                ? "bg-blue-600/30 text-blue-200 border border-blue-500/60"
                                                : "bg-muted text-muted-foreground border border-border"
                                            } disabled:opacity-50`}
                                        >
                                            {showSelectedOnly ? "On" : "Off"}
                                        </button>
                                        </div>

                                    </div>

                                    {/* Legend for colors */}
                                    <div className="rounded-lg border border-border px-3 py-2 text-[11px] text-muted-foreground space-y-1">
                                    <div className="text-xs text-muted-foreground font-medium">Legend</div>
                                    <div className="flex items-center justify-between">
                                        <span className="flex items-center gap-2">
                                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                                        Remaining / OK
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="flex items-center gap-2">
                                        <span className="h-2 w-2 rounded-full bg-amber-400" />
                                        Discount / warning
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="flex items-center gap-2">
                                        <span className="h-2 w-2 rounded-full bg-blue-400" />
                                        Tax amounts
                                        </span>
                                    </div>
                                    </div>



                                    <div className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">
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
                            <div className="flex items-center justify-between bg-muted/60 border border-border rounded-lg px-4 py-2 mb-3">
                                <div className="text-sm text-muted-foreground font-medium">
                                    Review selected items
                                </div>
                                <div className="text-sm text-muted-foreground">
                                    Total Refund: <span className="text-white font-semibold">{safeMoney(returnTotals?.total ?? 0)}</span>
                                </div>
                            </div>

                            <div className="grid md:grid-cols-[2fr_1fr] gap-4">
                                {/* Left: review selected items */}
                                <div className="rounded-xl border border-border overflow-hidden">
                                    <div className="px-3 py-2 bg-muted text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                        Items to refund
                                    </div>
                                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                                        <div>Item / Reason</div>
                                        <div className="text-center">Qty</div>
                                        <div className="text-center">Tax</div>
                                        <div className="text-center">Line total</div>
                                    </div>
                                    <div className="divide-y divide-border">
                                        {reviewItems.length === 0 && (
                                            <div className="px-3 py-3 text-sm text-muted-foreground">No items found for this draft.</div>
                                        )}
                                        {reviewItems.map((it: any) => (
                                            <div key={it.id} className="grid grid-cols-[1fr_auto_auto_auto] items-start gap-3 px-3 py-2 text-sm">
                                                <div className="min-w-0">
                                                    <div className="text-foreground truncate">{it.product_name || `Line #${it.sale_line}`}</div>
                                                    <div className="text-[12px] text-muted-foreground truncate">
                                                        {it.variant_name || it.sku}
                                                    </div>
                                                    <div className="text-[12px] text-muted-foreground">
                                                        Reason: <span className="text-muted-foreground">{it.reason_code || "—"}</span>
                                                        {it.notes ? <span className="text-muted-foreground"> • {it.notes}</span> : null}
                                                    </div>
                                                    {/* NEW: original line context */}
                                                    <div className="mt-1 text-[11px] text-muted-foreground">
                                                        Original: Subtotal {safeMoney(it.original_subtotal)}
                                                        {" • "}Discount <span className="text-amber-300">-{safeMoney(it.original_discount || 0)}</span>
                                                        {" • "}Tax <span className="text-blue-300">{safeMoney(it.original_tax || 0)}</span>
                                                        {" • "}Total <span className="text-foreground">{safeMoney(it.original_total)}</span>
                                                        {" • "}Qty {it.original_quantity}
                                                    </div>
                                                </div>

                                                {/* Return-only amounts */}
                                                <div className="text-center tabular-nums text-foreground">
                                                    {it.qty_returned}
                                                    <div className="text-[11px] text-muted-foreground">
                                                        of {it.original_quantity}
                                                    </div>
                                                </div>
                                                <div className="text-center tabular-nums text-blue-300">
                                                    {safeMoney(it.refund_tax || 0)}
                                                </div>
                                                <div className="text-center tabular-nums text-foreground font-medium">
                                                    {safeMoney(it.refund_total || 0)}
                                                </div>
                                                {/*                                                 
                                                <div className="text-center tabular-nums text-foreground">{it.qty_returned}</div>
                                                <div className="text-center tabular-nums text-blue-300">{safeMoney(it.refund_tax || 0)}</div>
                                                <div className="text-center tabular-nums text-foreground font-medium">{safeMoney(it.refund_total || 0)}</div> */}
                                            </div>
                                        ))}
                                    </div>
                                    {/* Footer totals */}
                                    {/* <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-3 py-2 border-t border-border text-sm">
                                        <div className="text-muted-foreground">Totals</div>
                                        <div />
                                        <div className="text-center tabular-nums text-blue-300">
                                            {safeMoney(reviewItems.reduce((s, it) => s + Number(it.refund_tax || 0), 0))}
                                        </div>
                                        <div className="text-center tabular-nums text-white font-semibold">
                                            {safeMoney(refundTotal)}
                                        </div>
                                    </div> */}
                                    {/* Footer totals */}
                                    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-3 py-2 border-t border-border text-sm">
                                        <div className="text-muted-foreground">Totals (this return)</div>
                                        <div />
                                        <div className="text-center tabular-nums text-blue-300">
                                            {safeMoney(returnTotals?.tax ?? 0)}  {/* from updated.refund_tax_total */}
                                        </div>
                                        <div className="text-center tabular-nums text-white font-semibold">
                                            {safeMoney(returnTotals?.total ?? 0)} {/* from updated.refund_total */}
                                        </div>
                                    </div>
                                </div>

                                {/* Right: refund method breakdown */}
                                <div className="rounded-xl border border-border overflow-hidden">
                                    <div className="px-3 py-2 bg-muted text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
                                                    className="rounded-md border border-border bg-card text-xs text-foreground px-2 py-1"
                                                >
                                                    <option value="CASH">Cash</option>
                                                    <option value="CARD">Card</option>
                                                    <option value="STORE_CREDIT">Store credit</option>
                                                    <option value="OTHER">Other</option>
                                                </select>

                                                <input
                                                    type="number" step="0.01" min={0} value={r.amount}
                                                    onChange={(e) => handleAmountChange(idx, Number(e.target.value))}
                                                    className="w-32 rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground"
                                                />

                                                <button
                                                    type="button"
                                                    onClick={() => applyRemainderToRow(idx)}
                                                    disabled={remainingToAllocate <= 0}
                                                    title={remainingToAllocate > 0 ? `Apply ${safeMoney(remainingToAllocate)} to this method` : "Nothing remaining"}
                                                    className="text-[11px] rounded px-2 py-1 text-muted-foreground hover:bg-white/5 disabled:opacity-40"
                                                >
                                                    Set remainder
                                                </button>

                                                <button
                                                    className="text-xs text-muted-foreground rounded px-2 py-1 hover:bg-white/5 disabled:opacity-40"
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
                                                className="text-xs text-muted-foreground rounded px-2 py-1 hover:bg-white/5"
                                                onClick={handleAddMethod}
                                            >
                                                + Add method
                                            </button>
                                            <button
                                                className="text-xs text-muted-foreground rounded px-2 py-1 hover:bg-white/5"
                                                onClick={splitEvenly}
                                                disabled={refunds.length < 2}
                                                title={refunds.length < 2 ? "Add another method to split" : "Split total evenly"}
                                            >
                                                Split evenly
                                            </button>
                                        </div>
                                    </div>


                                    {/* Totals check */}
                                    <div className="border-t border-border px-3 py-2 text-sm">
                                        <div className="flex items-center justify-between">
                                            <div className="text-muted-foreground">Refund total</div>
                                            <div className="font-semibold text-white">{safeMoney(refundTotal)}</div>
                                        </div>

                                        <div className="mt-1 flex items-center justify-between">
                                            <div className="text-muted-foreground">Methods sum</div>
                                            <div className={`tabular-nums ${remainingToAllocate === 0 ? "text-emerald-300" : "text-amber-300"}`}>
                                                {safeMoney(sumRefunds())}
                                            </div>
                                        </div>

                                        <div className="mt-1 flex items-center justify-between">
                                            <div className="text-muted-foreground">Remaining</div>
                                            <div className={`tabular-nums ${remainingToAllocate === 0 ? "text-emerald-300" : "text-amber-300"}`}>
                                                {safeMoney(remainingToAllocate)}
                                            </div>
                                        </div>
                                    </div>

                                </div>
                            </div>

                            <div className="flex items-center justify-between mt-4">
                                <button className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-white/5" onClick={() => setStep(1)}>
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
