// pos-frontend/src/features/admin/taxrules/TaxRuleModal.tsx
import React from "react";
import { useToast } from "../components/ToastCompat";
import { TaxRulesAPI, type TaxRule } from "../api/taxrules";
import { AdminAPI, type Store } from "../adminApi";
import { TaxCatsAPI, type TaxCategory as TaxCat } from "../api/taxcats";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing?: TaxRule | null;
};

type Step = 1 | 2;

export default function TaxRuleModal({ open, onClose, onSaved, editing }: Props) {
  const { push } = useToast();
  const isEdit = !!editing;

  const [step, setStep] = React.useState<Step>(1);
  const [saving, setSaving] = React.useState(false);

  const [stores, setStores] = React.useState<Store[]>([]);
  const [cats, setCats] = React.useState<TaxCat[]>([]);

  const formatLocalDate = (iso?: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
  };

  // Targeting
  const [code, setCode] = React.useState(editing?.code ?? "");
  const [name, setName] = React.useState(editing?.name ?? "");
  const [isActive, setIsActive] = React.useState(editing?.is_active ?? true);
  const [scope, setScope] = React.useState<TaxRule["scope"]>(editing?.scope ?? "GLOBAL");
  const [storeId, setStoreId] = React.useState<number | 0>((editing?.store as number) ?? 0);

  // Categories (with search)
  const [categoryIds, setCategoryIds] = React.useState<number[]>(
    editing?.categories ? editing.categories.map((c: any) => c.id) : []
  );
  const [catQuery, setCatQuery] = React.useState(""); // NEW: search box
  const filteredCats = React.useMemo(() => {
    if (!catQuery.trim()) return cats;
    const q = catQuery.toLowerCase();
    return cats.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [cats, catQuery]);

  // Calculation
  const [basis, setBasis] = React.useState<TaxRule["basis"]>(editing?.basis ?? "PCT");
  const [rateText, setRateText] = React.useState<string>(editing?.rate ?? "0.0000");
  const [amountText, setAmountText] = React.useState<string>(editing?.amount ?? "0.00");
  const [applyScope, setApplyScope] = React.useState<TaxRule["apply_scope"]>(editing?.apply_scope ?? "LINE");
  const [priority, setPriority] = React.useState<number>(editing?.priority ?? 100);
  const [startAt, setStartAt] = React.useState<string>(formatLocalDate(editing?.start_at));
  const [endAt, setEndAt] = React.useState<string>(formatLocalDate(editing?.end_at));

  const [rateErr, setRateErr] = React.useState("");
  const [amountErr, setAmountErr] = React.useState("");
  const [topErr, setTopErr] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    let mounted = true;
    (async () => {
      try {
        const sp = await AdminAPI.stores({ is_active: true });
        const sl = Array.isArray(sp) ? sp : sp.results ?? [];
        const cp = await TaxCatsAPI.list({}); // all cats
        const cl = Array.isArray(cp) ? cp : cp.results ?? [];
        if (mounted) { setStores(sl); setCats(cl); }
      } catch (e: any) {
        push({ kind: "error", msg: e?.message || "Failed to load stores/categories" });
      }
    })();
    return () => { mounted = false; };
  }, [open, push]);

  React.useEffect(() => {
    if (editing && open) {
      setStep(1);
      setTopErr("");
      setRateErr("");
      setAmountErr("");
      setCatQuery(""); // reset search on open
    }
  }, [editing, open]);

  if (!open) return null;

  // --- Helpers ---
  const normalizeRate = () => {
    if (basis !== "PCT") return;
    if (rateText === "" || rateText === ".") { setRateErr("Rate is required."); return; }
    const n = Number(rateText.replace(/[^\d.]/g, ""));
    if (isNaN(n)) { setRateErr("Rate must be a number."); return; }
    // frontend assist: 8.25 => 0.0825; backend normalizes again
    const normalized = n > 1 ? n / 100 : n;
    setRateText(normalized.toFixed(4));
    setRateErr("");
  };

  const normalizeAmount = () => {
    if (basis !== "FLAT") return;
    if (amountText === "" || amountText === ".") { setAmountErr("Amount is required."); return; }
    const n = Number(amountText.replace(/[^\d.]/g, ""));
    if (isNaN(n)) { setAmountErr("Amount must be a number."); return; }
    setAmountText(n.toFixed(2));
    setAmountErr("");
  };

  const validateStep1 = () => {
    const errs: string[] = [];
    if (!code.trim()) errs.push("Code is required.");
    if (!name.trim()) errs.push("Name is required.");
    if (scope === "STORE" && !storeId) errs.push("Store is required when scope is Store.");
    setTopErr(errs.join(" "));
    return errs.length === 0;
  };

  const validateStep2 = () => {
    const errs: string[] = [];
    if (basis === "PCT") {
      if (rateText === "" || rateText === ".") errs.push("Rate is required for percent basis.");
      else if (isNaN(Number(rateText))) errs.push("Rate must be a number.");
    } else {
      if (amountText === "" || amountText === ".") errs.push("Amount is required for flat basis.");
      else if (isNaN(Number(amountText))) errs.push("Amount must be a number.");
    }
    if (startAt && endAt && new Date(endAt) < new Date(startAt)) {
      errs.push("End time must be after start time.");
    }
    setTopErr(errs.join(" "));
    return errs.length === 0;
  };

  const next = () => {
    if (step === 1) {
      if (!validateStep1()) return;
      setStep(2);
    }
  };
  const back = () => setStep((s) => (s === 2 ? 1 : s));

  const save = async () => {
    if (!validateStep2()) return;
    setSaving(true);
    try {
      const payload: any = {
        code: code.trim(),
        name: name.trim(),
        is_active: isActive,
        scope,
        store: scope === "STORE" ? storeId : null,
        basis,
        apply_scope: applyScope,
        priority: Number(priority) || 100,
        category_ids: categoryIds,
        rate: basis === "PCT" ? String(Number(rateText)) : null,
        amount: basis === "FLAT" ? String(Number(amountText)) : null,
        start_at: startAt || null,
        end_at: endAt || null,
      };

      if (isEdit && editing) {
        await TaxRulesAPI.update(editing.id, payload);
        push({ kind: "success", msg: "Tax rule updated" });
      } else {
        await TaxRulesAPI.create(payload);
        push({ kind: "success", msg: "Tax rule created" });
      }
      onSaved();
      onClose();
    } catch (e: any) {
      push({ kind: "error", msg: e?.message || "Failed to save tax rule" });
    } finally {
      setSaving(false);
    }
  };

  // --- Derived display helpers for the preview strip ---
  const storeLabel = React.useMemo(() => {
    if (scope !== "STORE") return "All Stores";
    const s = stores.find((x) => x.id === storeId);
    return s ? `${s.name} (${s.code})` : "Select a store";
  }, [scope, stores, storeId]);

  const prettyPercent = React.useMemo(() => {
    const n = Number(rateText);
    const pct = !isNaN(n) ? (n > 1 ? n : n * 100) : 0;
    return `${pct.toFixed(2)}%`;
  }, [rateText]);

  const windowLabel = React.useMemo(() => {
    const s = startAt ? startAt.replace("T", " ").slice(0, 16) : "";
    const e = endAt ? endAt.replace("T", " ").slice(0, 16) : "";
    if (!s && !e) return "No window";
    if (s && !e) return `From ${s}`;
    if (!s && e) return `Until ${e}`;
    return `${s} → ${e}`;
  }, [startAt, endAt]);

  // --- UI ---
  const CategoriesField = (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-sm">Categories</label>
        {/* NEW: categories search */}
        <input
          value={catQuery}
          onChange={(e) => setCatQuery(e.target.value)}
          placeholder="Search categories…"
          className="rounded-md bg-slate-800 px-2 py-1 text-xs outline-none placeholder:text-slate-400"
          title="Filter categories by name or code"
        />
      </div>

      <div className="mt-1 space-y-1 max-h-32 overflow-auto border border-slate-700 rounded-md p-2">
        {filteredCats.length === 0 ? (
          <p className="text-xs text-slate-400">No matching categories.</p>
        ) : (
          filteredCats.map(c => (
            <label key={c.id} className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={categoryIds.includes(c.id)}
                onChange={(e) =>
                  setCategoryIds(prev => e.target.checked ? [...prev, c.id] : prev.filter(x => x !== c.id))
                }
              />
              {c.name} ({c.code})
            </label>
          ))
        )}
      </div>
      <p className="text-xs text-slate-400 mt-1">Leave empty to apply to all taxable items.</p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
      <div className="w-[860px] rounded-xl border border-slate-800 bg-slate-900">
        <div className="border-b border-slate-800 p-3">
          <h3 className="font-semibold">{isEdit ? "Edit Tax Rule" : "New Tax Rule"}</h3>
        </div>

        <div className="p-4 space-y-3">
          {topErr ? <div className="rounded-md border border-red-600 bg-red-900/40 text-red-100 px-3 py-2 text-sm">{topErr}</div> : null}

          {step === 1 && (
            <div className="grid grid-cols-2 gap-4">
              {/* Identity */}
              <div className="space-y-3">
                <div>
                  <label className="text-sm">Code *</label>
                  <input value={code} onChange={(e) => setCode(e.target.value)}
                         className="w-full mt-1 rounded-md bg-slate-800 px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="text-sm">Name *</label>
                  <input value={name} onChange={(e) => setName(e.target.value)}
                         className="w-full mt-1 rounded-md bg-slate-800 px-3 py-2 text-sm outline-none" />
                </div>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                  <span className="text-sm">Active</span>
                </label>
              </div>

              {/* Targeting */}
              <div className="space-y-3">
                <div>
                  <label className="text-sm">Scope *</label>
                  <div className="mt-1 flex items-center gap-4">
                    <label className="inline-flex items-center gap-2">
                      <input type="radio" checked={scope === "GLOBAL"} onChange={() => setScope("GLOBAL")} />
                      <span className="text-sm">Global</span>
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input type="radio" checked={scope === "STORE"} onChange={() => setScope("STORE")} />
                      <span className="text-sm">Store</span>
                    </label>
                  </div>
                </div>
                <div>
                  <label className={`text-sm ${scope === "STORE" ? "" : "text-slate-400"}`}>Store {scope === "STORE" ? "*" : ""}</label>
                  <select
                    value={storeId || 0}
                    onChange={(e) => setStoreId(Number(e.target.value))}
                    disabled={scope !== "STORE"}
                    className="w-full mt-1 rounded-md bg-slate-800 px-3 py-2 text-sm outline-none disabled:opacity-50"
                  >
                    <option value={0}>Select a store…</option>
                    {stores.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-400 mt-1">Required only when scope = Store.</p>
                </div>
                {CategoriesField}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-2 gap-4">
              {/* Basis */}
              <div className="space-y-3">
                <div>
                  <label className="text-sm">Basis *</label>
                  <div className="mt-1 flex items-center gap-4">
                    <label className="inline-flex items-center gap-2">
                      <input type="radio" checked={basis === "PCT"} onChange={() => setBasis("PCT")} />
                      <span className="text-sm">Percent</span>
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input type="radio" checked={basis === "FLAT"} onChange={() => setBasis("FLAT")} />
                      <span className="text-sm">Flat amount</span>
                    </label>
                  </div>
                </div>

                {basis === "PCT" ? (
                  <div>
                    <label className="text-sm">Rate *</label>
                    <input
                      value={rateText}
                      onChange={(e) => setRateText(e.target.value)}
                      onBlur={normalizeRate}
                      inputMode="decimal"
                      placeholder="0.0000"
                      className={`w-full mt-1 rounded-md bg-slate-800 px-3 py-2 text-sm outline-none ${rateErr ? "ring-1 ring-red-500" : ""}`}
                    />
                    <p className={`text-xs mt-1 ${rateErr ? "text-red-400" : "text-slate-400"}`}>
                      {rateErr || "Percent as fraction (e.g., 8.25% → 0.0825). You can type 8.25; we’ll save 0.0825."}
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="text-sm">Amount *</label>
                    <input
                      value={amountText}
                      onChange={(e) => setAmountText(e.target.value)}
                      onBlur={normalizeAmount}
                      inputMode="decimal"
                      placeholder="0.00"
                      className={`w-full mt-1 rounded-md bg-slate-800 px-3 py-2 text-sm outline-none ${amountErr ? "ring-1 ring-red-500" : ""}`}
                    />
                    <p className={`text-xs mt-1 ${amountErr ? "text-red-400" : "text-slate-400"}`}>
                      {amountErr || "Fixed currency amount (e.g., 2.00)."}
                    </p>
                  </div>
                )}
              </div>

              {/* Behavior */}
              <div className="space-y-3">
                <div>
                  <label className="text-sm">Apply Scope *</label>
                  <div className="mt-1 flex items-center gap-4">
                    <label className="inline-flex items-center gap-2">
                      <input type="radio" checked={applyScope === "LINE"} onChange={() => setApplyScope("LINE")} />
                      <span className="text-sm">Line</span>
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input type="radio" checked={applyScope === "RECEIPT"} onChange={() => setApplyScope("RECEIPT")} />
                      <span className="text-sm">Receipt</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="text-sm">Priority</label>
                  <input
                    value={String(priority)}
                    onChange={(e) => setPriority(Number(e.target.value) || 0)}
                    inputMode="numeric"
                    className="w-full mt-1 rounded-md bg-slate-800 px-3 py-2 text-sm outline-none"
                    placeholder="100"
                  />
                  <p className="text-xs text-slate-400 mt-1">Lower runs earlier. Default 100.</p>
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
          )}

          {/* === Preview strip (always visible) === */}
          <div className="mt-2 rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
            <span className="font-medium">Preview:</span>{" "}
            <span>
              Applies to <span className="text-slate-200">{storeLabel}</span>
              {" • "}
              {basis === "PCT" ? (
                <>Rate <span className="text-slate-200">{prettyPercent}</span></>
              ) : (
                <>Amount <span className="text-slate-200">{Number(amountText || 0).toFixed(2)}</span></>
              )}
              {" on "}
              <span className="text-slate-200">{applyScope === "LINE" ? "Line" : "Receipt"}</span>
              {" • "}
              Prio <span className="text-slate-200">{priority || 0}</span>
              {" • "}
              {isActive ? <span className="text-emerald-300">Active</span> : <span className="text-slate-400">Inactive</span>}
              {" • "}
              <span className="text-slate-200">{windowLabel}</span>
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-800 p-3">
          <div className="text-xs text-slate-400">
            {step === 1 ? "Step 1 of 2: Targeting" : "Step 2 of 2: Calculation"}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={saving}
                    className="px-3 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-100">
              Cancel
            </button>
            {step === 2 && (
              <button onClick={back}
                      className="px-3 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-100">
                Back
              </button>
            )}
            {step === 1 ? (
              <button onClick={next}
                      className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white">
                Next
              </button>
            ) : (
              <button onClick={save} disabled={saving}
                      className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white">
                {saving ? "Saving…" : isEdit ? "Save" : "Create"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
