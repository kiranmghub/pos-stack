// pos-frontend/src/features/admin/taxcats/TaxCategoryModal.tsx
import React from "react";
import { useNotify } from "@/lib/notify";
import { TaxCatsAPI, type TaxCategory, type TaxCategoryCreatePayload } from "../api/taxcats";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing?: TaxCategory | null;
};

export default function TaxCategoryModal({ open, onClose, onSaved, editing }: Props) {
  const { success, error, info, warn } = useNotify();
  const isEdit = !!editing;
  const [saving, setSaving] = React.useState(false);

  // form state
  const [code, setCode] = React.useState(editing?.code ?? "");
  const [name, setName] = React.useState(editing?.name ?? "");
  const [description, setDescription] = React.useState(editing?.description ?? "");

  // --- New: rate input (with friendly typing + fixed 4-decimals on blur)
  const initialRate = editing?.rate ?? "0.0000";
  const [rateText, setRateText] = React.useState<string>(String(initialRate));
  const [rateErr, setRateErr] = React.useState<string>("");

  React.useEffect(() => {
    if (editing) {
      setCode(editing.code);
      setName(editing.name);
      setDescription(editing.description ?? "");
      setRateText(String(editing.rate ?? "0.0000"));
      setRateErr("");
    } else if (open) {
      setCode("");
      setName("");
      setDescription("");
      setRateText("0.0000");
      setRateErr("");
    }
  }, [editing, open]);

  if (!open) return null;

  // Allow only digits + one dot; keep the raw string while typing
  const handleRateChange = (v: string) => {
    // strip invalid chars
    let cleaned = v.replace(/[^\d.]/g, "");
    // keep only first dot
    const firstDot = cleaned.indexOf(".");
    if (firstDot !== -1) {
      cleaned =
        cleaned.slice(0, firstDot + 1) +
        cleaned
          .slice(firstDot + 1)
          .replace(/\./g, "");
    }
    setRateText(cleaned);

    // Live-validate but don't hard-format yet
    if (cleaned === "" || cleaned === ".") {
      setRateErr("Rate is required.");
    } else if (isNaN(Number(cleaned))) {
      setRateErr("Rate must be a number.");
    } else {
      setRateErr("");
    }
  };

  // When leaving the field, normalize to fixed 4 decimals
  const normalizeRateOnBlur = () => {
    if (rateText === "" || rateText === ".") {
      setRateErr("Rate is required.");
      return;
    }
    const n = Number(rateText);
    if (isNaN(n)) {
      setRateErr("Rate must be a number.");
      return;
    }
    setRateText(n.toFixed(4));
    setRateErr("");
  };

  const validate = () => {
    if (!code.trim()) return "Code is required.";
    if (!name.trim()) return "Name is required.";
    if (rateText === "" || rateText === "." || isNaN(Number(rateText))) {
      return rateErr || "Rate must be a number.";
    }
    return "";
  };

  const save = async () => {
    const err = validate();
    if (err) { 
      // push({ kind: "error", msg: err });
      error(err);
      return; 
    }

    const payload: TaxCategoryCreatePayload = {
      code: code.trim(),
      name: name.trim(),
      rate: Number(rateText).toFixed(4),        // <- always send fixed 4 decimals
      description: description.trim(),
    };

    setSaving(true);
    try {
      if (isEdit && editing) {
        await TaxCatsAPI.update(editing.id, payload);
        // push({ kind: "success", msg: "Tax category updated" });
        success("Tax category updated");
      } else {
        await TaxCatsAPI.create(payload);
        // push({ kind: "success", msg: "Tax category created" });
        success("Tax category created");
      }
      onSaved();
      onClose();
    } catch (e: any) {
      // push({ kind: "error", msg: e?.message || "Failed to save tax category" });
      error(e?.message || "Failed to save tax category");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
      <div className="w-[640px] rounded-xl border border-border bg-card">
        <div className="border-b border-border p-3">
          <h3 className="font-semibold">{isEdit ? "Edit Tax Category" : "New Tax Category"}</h3>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm">Code *</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none"
                placeholder="Unique code per tenant"
              />
            </div>
            <div>
              <label className="text-sm">Name *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none"
              />
            </div>

            <div>
              <label className="text-sm">Rate *</label>
              <input
                value={rateText}
                onChange={(e) => handleRateChange(e.target.value)}
                onBlur={normalizeRateOnBlur}
                inputMode="decimal"
                placeholder="0.0000"
                className={`w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none ${rateErr ? "ring-1 ring-destructive" : ""}`}
              />
              <p className={`text-xs mt-1 ${rateErr ? "text-error" : "text-muted-foreground"}`}>
                {rateErr ? rateErr : "Use decimal format (e.g., 0.0825 for 8.25%)."}
              </p>
            </div>
          </div>

          <div>
            <label className="text-sm">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none"
              placeholder="What is this tax category used for?"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border p-3">
          <button onClick={onClose} disabled={saving} className="px-3 py-1.5 rounded-md bg-muted hover:bg-muted text-foreground">Cancel</button>
          <button onClick={save} disabled={saving} className="px-3 py-1.5 rounded-md bg-success hover:bg-success/90 text-success-foreground">
            {saving ? "Saving…" : isEdit ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
