// pos-frontend/src/features/admin/stores/StoreModal.tsx
import React, { useEffect, useState } from "react";
import type { Store } from "../adminApi";
import { StoresAPI, StoreCreatePayload, StoreUpdatePayload } from "../api/stores";
import { useNotify } from "@/lib/notify";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;      // parent refresh
  editing?: Store | null;
};

const required = (v?: string) => (v && v.trim().length ? undefined : "Required");

export default function StoreModal({ open, onClose, onSaved, editing }: Props) {
  const { success, error, info, warn } = useNotify();
  const isEdit = !!editing;

  const [form, setForm] = useState<StoreCreatePayload>({
    code: editing?.code ?? "",
    name: editing?.name ?? "",
    is_active: editing?.is_active ?? true,
    timezone: (editing as any)?.timezone ?? "",
    street: (editing as any)?.street ?? "",
    city: (editing as any)?.city ?? "",
    state: (editing as any)?.state ?? "",
    postal_code: (editing as any)?.postal_code ?? "",
    country: (editing as any)?.country ?? "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setForm({
        code: editing.code,
        name: editing.name,
        is_active: editing.is_active,
        timezone: (editing as any)?.timezone ?? "",
        street: (editing as any)?.street ?? "",
        city: (editing as any)?.city ?? "",
        state: (editing as any)?.state ?? "",
        postal_code: (editing as any)?.postal_code ?? "",
        country: (editing as any)?.country ?? "",
      });
    } else {
      setForm((f) => ({ ...f, is_active: true }));
    }
  }, [editing]);

  if (!open) return null;

  const onChange = (k: keyof StoreCreatePayload, v: any) =>
    setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    const errors: Record<string, string> = {};
    (["code", "name", "timezone", "street", "city", "state", "postal_code", "country"] as const).forEach((k) => {
      const err = required(String((form as any)[k]));
      if (err) errors[k] = err;
    });
    return errors;
  };

  const submit = async () => {
    const errors = validate();
    if (Object.keys(errors).length) {
      error("Please fill all required fields.");
      return;
    }
    setSaving(true);
    try {
      if (isEdit && editing) {
        const payload: StoreUpdatePayload = { ...form };
        const saved = await StoresAPI.update(editing.id, payload);
        success(`Store "${saved.code}" updated`);
      } else {
        const saved = await StoresAPI.create(form);
        success(`Store "${saved.code}" created`);
      }
      onSaved();
      onClose();
    } catch (e: any) {
      const msg = e?.message || "Failed to save store";
      error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
      <div className="w-[640px] rounded-xl border border-border bg-card">
        <div className="border-b border-border p-3">
          <h3 className="font-semibold">{isEdit ? "Edit Store" : "New Store"}</h3>
        </div>

        <div className="p-4 grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm">Code *</label>
            <input className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none"
              value={form.code} onChange={(e) => onChange("code", e.target.value)} placeholder="Unique code" />
          </div>
          <div>
            <label className="text-sm">Name *</label>
            <input className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none"
              value={form.name} onChange={(e) => onChange("name", e.target.value)} />
          </div>

          <div>
            <label className="text-sm">Timezone *</label>
            <input className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none"
              value={form.timezone} onChange={(e) => onChange("timezone", e.target.value)} placeholder="e.g. America/Chicago" />
          </div>
          <label className="flex items-center gap-2 mt-6">
            <input type="checkbox" checked={!!form.is_active} onChange={(e) => onChange("is_active", e.target.checked)} />
            <span className="text-sm">Active</span>
          </label>

          <div className="col-span-2">
            <label className="text-sm">Street *</label>
            <input className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none"
              value={form.street} onChange={(e) => onChange("street", e.target.value)} />
          </div>

          <div>
            <label className="text-sm">City *</label>
            <input className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none"
              value={form.city} onChange={(e) => onChange("city", e.target.value)} />
          </div>
          <div>
            <label className="text-sm">State/Province *</label>
            <input className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none"
              value={form.state} onChange={(e) => onChange("state", e.target.value)} />
          </div>
          <div>
            <label className="text-sm">Postal Code *</label>
            <input className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none"
              value={form.postal_code} onChange={(e) => onChange("postal_code", e.target.value)} />
          </div>
          <div>
            <label className="text-sm">Country *</label>
            <input className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none"
              value={form.country} onChange={(e) => onChange("country", e.target.value)} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border p-3">
          <button onClick={onClose} disabled={saving} className="px-3 py-1.5 rounded-md bg-muted hover:bg-muted text-foreground">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white">
            {saving ? "Saving…" : isEdit ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
