// pos-frontend/src/features/admin/coupons/CouponModal.tsx
import React from "react";
import { useNotify } from "@/lib/notify";
import { CouponsAPI, type Coupon, type CouponCreatePayload } from "../api/coupons";
import { DiscountRulesAPI, type DiscountRule } from "../api/discounts";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing?: Coupon | null;
};

export default function CouponModal({ open, onClose, onSaved, editing }: Props) {
  const { success, error, info, warn } = useNotify();
  const isEdit = !!editing;
  const [saving, setSaving] = React.useState(false);

  const [code, setCode] = React.useState(editing?.code ?? "");
  const [name, setName] = React.useState(editing?.name ?? "");
  const [description, setDescription] = React.useState(editing?.description ?? "");
  const [isActive, setIsActive] = React.useState(editing?.is_active ?? true);

  const [rules, setRules] = React.useState<DiscountRule[]>([]);
  const [ruleId, setRuleId] = React.useState<number>(
    (editing?.rule?.id as number) ?? (editing?.rule_id as number) ?? 0
  );

  const [minSubtotal, setMinSubtotal] = React.useState<string>(editing?.min_subtotal ?? "");
  const [maxUses, setMaxUses] = React.useState<string>(editing?.max_uses != null ? String(editing.max_uses) : "");
  const [startAt, setStartAt] = React.useState<string>(formatLocal(editing?.start_at));
  const [endAt, setEndAt] = React.useState<string>(formatLocal(editing?.end_at));

  React.useEffect(() => {
    if (!open) return;
    let mounted = true;
    (async () => {
      try {
        // List a reasonable set of active discount rules for selection, ordered by priority asc
        const page = await DiscountRulesAPI.list({ is_active: true, ordering: "priority" } as any);
        const rows = Array.isArray(page) ? page : page.results ?? [];
        if (mounted) setRules(rows);
      } catch (e: any) {
        // push({ kind: "error", msg: e?.message || "Failed to load discount rules" });
        error(e?.message || "Failed to load discount rules");
      }
    })();
    return () => { mounted = false; };
  }, [open, error]);

  React.useEffect(() => {
    if (editing && open) {
      setCode(editing.code ?? "");
      setName(editing.name ?? "");
      setDescription(editing.description ?? "");
      setIsActive(!!editing.is_active);
      setRuleId((editing.rule?.id as number) ?? (editing.rule_id as number) ?? 0);
      setMinSubtotal(editing.min_subtotal ?? "");
      setMaxUses(editing.max_uses != null ? String(editing.max_uses) : "");
      setStartAt(formatLocal(editing.start_at));
      setEndAt(formatLocal(editing.end_at));
    }
  }, [editing, open]);

  if (!open) return null;

  const validate = () => {
    const errs: string[] = [];
    if (!code.trim()) errs.push("Code is required.");
    if (!ruleId) errs.push("Discount Rule is required.");
    if (startAt && endAt && new Date(endAt) < new Date(startAt)) errs.push("End must be after Start.");
    if (errs.length) {
      // push({ kind: "error", msg: errs.join(" ") });
      error(errs.join(" "));
      return false;
    }
    return true;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload: CouponCreatePayload = {
        code: code.trim(),
        name: name.trim(),
        description: description.trim(),
        is_active: isActive,
        rule_id: ruleId,
        min_subtotal: minSubtotal || null,
        max_uses: maxUses ? Number(maxUses) : null,
        start_at: startAt || null,
        end_at: endAt || null,
      };
      if (isEdit && editing) {
        await CouponsAPI.update(editing.id, payload);
        // push({ kind: "success", msg: "Coupon updated" });
        success("Coupon updated");
      } else {
        await CouponsAPI.create(payload);
        // push({ kind: "success", msg: "Coupon created" });
        success("Coupon created");
      }
      onSaved();
      onClose();
    } catch (e: any) {
      // push({ kind: "error", msg: e?.message || "Failed to save coupon" });
      error(e?.message || "Failed to save coupon");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
      <div className="w-[760px] rounded-xl border border-slate-800 bg-slate-900">
        <div className="border-b border-slate-800 p-3">
          <h3 className="font-semibold">{isEdit ? "Edit Coupon" : "New Coupon"}</h3>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm">Code *</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full mt-1 rounded-md bg-slate-800 px-3 py-2 text-sm outline-none"
                placeholder="Unique coupon code"
              />
            </div>
            <div>
              <label className="text-sm">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full mt-1 rounded-md bg-slate-800 px-3 py-2 text-sm outline-none"
                placeholder="Display name"
              />
            </div>

            <div className="col-span-2">
              <label className="text-sm">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full mt-1 rounded-md bg-slate-800 px-3 py-2 text-sm outline-none"
                placeholder="Brief description or usage note"
              />
            </div>

            <label className="inline-flex items-center gap-2 mt-1">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              <span className="text-sm">Active</span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm">Discount Rule *</label>
              <select
                value={ruleId || 0}
                onChange={(e) => setRuleId(Number(e.target.value))}
                className="w-full mt-1 rounded-md bg-slate-800 px-3 py-2 text-sm outline-none"
              >
                <option value={0}>Select a discount rule…</option>
                {rules.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.code} — {r.name || (r.store_name ? `(${r.store_name})` : "")}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm">Min Subtotal (optional)</label>
              <input
                value={minSubtotal}
                onChange={(e) => setMinSubtotal(e.target.value)}
                inputMode="decimal"
                className="w-full mt-1 rounded-md bg-slate-800 px-3 py-2 text-sm outline-none"
                placeholder="e.g., 25.00"
              />
            </div>

            <div>
              <label className="text-sm">Max Uses (optional)</label>
              <input
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                inputMode="numeric"
                className="w-full mt-1 rounded-md bg-slate-800 px-3 py-2 text-sm outline-none"
                placeholder="e.g., 100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm">Start (optional)</label>
                <input
                  type="datetime-local"
                  value={startAt || ""}
                  onChange={(e) => setStartAt(e.target.value)}
                  className="w-full mt-1 rounded-md bg-slate-800 px-3 py-2 text-sm outline-none"
                />
              </div>
              <div>
                <label className="text-sm">End (optional)</label>
                <input
                  type="datetime-local"
                  value={endAt || ""}
                  onChange={(e) => setEndAt(e.target.value)}
                  className="w-full mt-1 rounded-md bg-slate-800 px-3 py-2 text-sm outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-800 p-3">
          <button onClick={onClose} disabled={saving} className="px-3 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-100">
            Cancel
          </button>
          <button onClick={save} disabled={saving} className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white">
            {saving ? "Saving…" : isEdit ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatLocal(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}
