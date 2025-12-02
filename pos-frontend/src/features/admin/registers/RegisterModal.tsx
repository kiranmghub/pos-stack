// src/features/admin/registers/RegisterModal.tsx
import React from "react";
import type { Store } from "../adminApi";
import { RegistersAPI, type Register, type RegisterCreatePayload } from "../api/registers";
import { useNotify } from "@/lib/notify";
import { AdminAPI } from "../adminApi";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing?: Register | null;
};

export default function RegisterModal({ open, onClose, onSaved, editing }: Props) {
  const { success, error, info, warn } = useNotify();
  const isEdit = !!editing;

  const [stores, setStores] = React.useState<Store[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState<RegisterCreatePayload>({
    store: editing?.store ?? 0,
    name: editing?.name ?? "",
    code: editing?.code ?? "",
    hardware_profile: editing?.hardware_profile ?? {},
    is_active: editing?.is_active ?? true,
  });

  const [hpText, setHpText] = React.useState(
    JSON.stringify(form.hardware_profile || {}, null, 2)
  );
  const [pin, setPin] = React.useState(""); // for set/reset pin on edit

  React.useEffect(() => {
    if (!open) return;
    let mounted = true;
    (async () => {
      try {
        const page = await AdminAPI.stores({ is_active: true });
        const list = Array.isArray(page) ? page : (page.results ?? []);
        if (mounted) setStores(list);
      } catch (e: any) {
        // push({ kind: "error", msg: e?.message || "Failed to load stores" });
        error(e?.message || "Failed to load stores");
      }
    })();
    return () => { mounted = false; };
  }, [open]);

  React.useEffect(() => {
    if (editing) {
      setForm({
        store: editing.store,
        name: editing.name,
        code: editing.code,
        hardware_profile: editing.hardware_profile || {},
        is_active: editing.is_active,
      });
      setHpText(JSON.stringify(editing.hardware_profile || {}, null, 2));
    } else {
      setForm((f) => ({ ...f, is_active: true }));
      setHpText(JSON.stringify({}, null, 2));
      setPin("");
    }
  }, [editing]);

  if (!open) return null;

  const onChange = (k: keyof RegisterCreatePayload, v: any) =>
    setForm((f) => ({ ...f, [k]: v }));

  const parseHardwareProfile = (): boolean => {
    try {
      const obj = hpText.trim() ? JSON.parse(hpText) : {};
      setForm((f) => ({ ...f, hardware_profile: obj }));
      return true;
    } catch {
      // push({ kind: "error", msg: "Hardware Profile must be valid JSON." });
      error("Hardware Profile must be valid JSON.");
      return false;
    }
  };

  const handleSave = async () => {
    if (!parseHardwareProfile()) return;
    if (!form.store) { 
      // push({ kind: "error", msg: "Store is required." }); return; }
      error("Store is required."); return; }
    if (!form.code.trim()) { 
      // push({ kind: "error", msg: "Code is required." }); return; }
      error("Code is required."); return; }

    setSaving(true);
    try {
      if (isEdit && editing) {
        const payload: any = { ...form };
        await RegistersAPI.update(editing.id, payload);
        // Optional PIN handling
        if (pin !== "") {
          await RegistersAPI.setPin(editing.id, pin); // empty string clears
        }
        // push({ kind: "success", msg: "Register updated" });
        success("Register updated");
      } else {
        await RegistersAPI.create(form);
        // push({ kind: "success", msg: "Register created" });
        success("Register created");
      }
      onSaved();
      onClose();
    } catch (e: any) {
      const msg = e?.message || "Failed to save register";
      // push({ kind: "error", msg });
      error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
      <div className="w-[640px] rounded-xl border border-border bg-card">
        <div className="border-b border-border p-3">
          <h3 className="font-semibold">{isEdit ? "Edit Register" : "New Register"}</h3>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm">Store *</label>
              <select
                value={form.store || 0}
                onChange={(e) => onChange("store", Number(e.target.value))}
                className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none"
              >
                <option value={0}>Select a store…</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm">Code *</label>
              <input
                value={form.code}
                onChange={(e) => onChange("code", e.target.value)}
                className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none"
                placeholder="Unique code per store"
              />
            </div>

            <div>
              <label className="text-sm">Name</label>
              <input
                value={form.name || ""}
                onChange={(e) => onChange("name", e.target.value)}
                className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none"
                placeholder="Give a name to your register"
              />
            </div>

            <label className="flex items-center gap-2 mt-6">
              <input
                type="checkbox"
                checked={!!form.is_active}
                onChange={(e) => onChange("is_active", e.target.checked)}
              />
              <span className="text-sm">Active</span>
            </label>
          </div>

          <div>
            <label className="text-sm">Hardware Profile (JSON)</label>
            <textarea
              value={hpText}
              onChange={(e) => setHpText(e.target.value)}
              rows={6}
              className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none font-mono"
              placeholder='{"printer":"star-mc", "drawer":"epson"}'
            />
            <p className="text-xs text-muted-foreground mt-1">Examples: printer, cash drawer, scanner IDs, etc.</p>
          </div>

          {isEdit && (
            <div className="rounded-md border border-border p-3">
              <div className="text-sm font-medium">Set / Reset PIN</div>
              <p className="text-xs text-muted-foreground mt-1">
                Enter a numeric PIN to set (6+ digits). Leave blank to clear the PIN.
              </p>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-full mt-2 rounded-md bg-muted px-3 py-2 text-sm outline-none"
                placeholder="New PIN (or leave blank to clear)"
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border p-3">
          <button onClick={onClose} disabled={saving} className="px-3 py-1.5 rounded-md bg-muted hover:bg-muted text-foreground">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 rounded-md bg-success hover:bg-success/90 text-success-foreground">
            {saving ? "Saving…" : isEdit ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
