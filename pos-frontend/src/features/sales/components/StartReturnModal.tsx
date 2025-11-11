import * as React from "react";
import { useNotify } from "@/lib/notify"; // same toast hook style you use in Catalogs :contentReference[oaicite:0]{index=0}

type Props = {
  open: boolean;
  onClose: () => void;
  sale: {
    id: number;
    receipt_no?: string;
    store_name?: string;
    cashier_name?: string;
    created_at?: string;
    total?: number | string;
  } | null;
  onSubmit: (payload: { reason_code: string; notes?: string }) => Promise<void>;
};

const REASONS = [
  { value: "DEFECTIVE", label: "Defective / Damaged" },
  { value: "WRONG_ITEM", label: "Wrong item" },
  { value: "CHANGED_MIND", label: "Customer changed mind" },
  { value: "OTHER", label: "Other" },
];

export default function StartReturnModal({ open, onClose, sale, onSubmit }: Props) {
  const { error } = useNotify(); // use the same success/error toasts pattern :contentReference[oaicite:1]{index=1}
  const [reason, setReason] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [touched, setTouched] = React.useState({ reason: false, notes: false });

  React.useEffect(() => {
    if (open) {
      setReason("");
      setNotes("");
      setSubmitting(false);
      setTouched({ reason: false, notes: false });
    }
  }, [open]);

  if (!open || !sale) return null;

  const notesTooLong = notes.trim().length > 250;
  const reasonMissing = !reason;

  async function handleSubmit() {
    // client validation
    if (reasonMissing || notesTooLong) {
      setTouched({ reason: true, notes: true });
      if (reasonMissing) error("Please select a reason.");
      if (notesTooLong) error("Notes must be 250 characters or fewer.");
      return;
    }
    try {
      setSubmitting(true);
      await onSubmit({ reason_code: reason, notes: notes.trim() || undefined });
      // success toast handled by the caller (SalesPage)
    } catch (e: any) {
      const msg = e?.message || e?.detail || "Could not start the return.";
      error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="border-b border-zinc-800 px-5 py-3">
          <div className="text-base font-semibold text-zinc-100">Start return</div>
          <div className="mt-1 text-xs text-zinc-400">
            Sale <span className="text-zinc-200">{sale.receipt_no || `#${sale.id}`}</span>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {/* Sale summary */}
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-zinc-800 p-3 text-sm">
            <div><span className="text-zinc-400">Store:</span> {sale.store_name || "—"}</div>
            <div><span className="text-zinc-400">Cashier:</span> {sale.cashier_name || "—"}</div>
            <div><span className="text-zinc-400">Date:</span> {sale.created_at ? new Date(sale.created_at).toLocaleString() : "—"}</div>
            <div><span className="text-zinc-400">Total:</span> {String(sale.total ?? "—")}</div>
          </div>

          {/* (Optional) Policy notice */}
          <div className="rounded-lg border border-amber-600/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Returns are subject to your store policy and return window.
          </div>

          {/* Form */}
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-300">Reason<span className="text-red-400">*</span></span>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, reason: true }))}
                className={`w-full rounded-md border bg-zinc-900 px-2 py-2 text-sm text-zinc-100 ${
                  touched.reason && reasonMissing ? "border-red-600" : "border-zinc-700"
                }`}
              >
                <option value="">Select a reason…</option>
                {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              {touched.reason && reasonMissing && (
                <div className="mt-1 text-xs text-red-400">Reason is required.</div>
              )}
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-zinc-300">Notes (optional)</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, notes: true }))}
                rows={4}
                placeholder="Add any context for the return (max 250 chars)…"
                className={`w-full resize-y rounded-md border bg-zinc-900 px-2 py-2 text-sm text-zinc-100 ${
                  touched.notes && notesTooLong ? "border-red-600" : "border-zinc-700"
                }`}
              />
              <div className="mt-1 flex items-center justify-between text-xs">
                <span className={notesTooLong ? "text-red-400" : "text-zinc-500"}>
                  {notes.trim().length}/250
                </span>
                {notesTooLong && <span className="text-red-400">Too long</span>}
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-zinc-800 px-5 py-3">
          <button
            className="rounded-md px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/5"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "Starting…" : "Start return"}
          </button>
        </div>
      </div>
    </div>
  );
}
