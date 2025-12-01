// pos-frontend/src/features/admin/discounts/DiscountRuleModal.tsx
import React from "react";
import { useNotify } from "@/lib/notify";
import { DiscountRulesAPI, type DiscountRule, type DiscountRuleCreatePayload, CatalogAPI, type ProductLite, type VariantLite } from "../api/discounts";
import { AdminAPI, type Store } from "../adminApi";
import { TaxCatsAPI, type TaxCategory as TaxCat } from "../api/taxcats";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing?: DiscountRule | null;
};

type Step = 1 | 2;

export default function DiscountRuleModal({ open, onClose, onSaved, editing }: Props) {
  const { success, error, info, warn } = useNotify();
  const isEdit = !!editing;

  const [step, setStep] = React.useState<Step>(1);
  const [saving, setSaving] = React.useState(false);

  // reference data
  const [stores, setStores] = React.useState<Store[]>([]);
  const [cats, setCats] = React.useState<TaxCat[]>([]);

  // Targeting
  const [code, setCode] = React.useState(editing?.code ?? "");
  const [name, setName] = React.useState(editing?.name ?? "");
  const [isActive, setIsActive] = React.useState(editing?.is_active ?? true);
  const [description, setDescription] = React.useState(editing?.description ?? "");

  const [scope, setScope] = React.useState<DiscountRule["scope"]>(editing?.scope ?? "GLOBAL");
  const [storeId, setStoreId] = React.useState<number | 0>((editing?.store as number) ?? 0);

  const [target, setTarget] = React.useState<DiscountRule["target"]>(editing?.target ?? "ALL");

  // Categories (with All toggle & search)
  const initCatIds = editing?.categories ? editing.categories.map(c => c.id) : [];
  const [categoryIds, setCategoryIds] = React.useState<number[]>(initCatIds);
  const [allCats, setAllCats] = React.useState<boolean>(editing ? !(editing.categories && editing.categories.length) : false);
  const [catQuery, setCatQuery] = React.useState("");
  const filteredCats = React.useMemo(() => {
    if (!catQuery.trim()) return cats;
    const q = catQuery.toLowerCase();
    return cats.filter(c => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));
  }, [cats, catQuery]);
  const allSelectedVisual = React.useMemo(() => {
    if (!cats.length) return false;
    return allCats || (categoryIds.length > 0 && categoryIds.length === cats.length);
  }, [cats, categoryIds, allCats]);

  // Products & Variants (lazy search, simple multi-select buffers)
  const [prodQuery, setProdQuery] = React.useState("");
  const [prodOptions, setProdOptions] = React.useState<ProductLite[]>([]);
  const [productIds, setProductIds] = React.useState<number[]>(editing?.products ? editing.products.map(p => p.id) : []);
  const [varQuery, setVarQuery] = React.useState("");
  const [varOptions, setVarOptions] = React.useState<VariantLite[]>([]);
  const [variantIds, setVariantIds] = React.useState<number[]>(editing?.variants ? editing.variants.map(v => v.id) : []);
  // -- simple debounce timers --
  const prodTimer = React.useRef<number | null>(null);
  const varTimer = React.useRef<number | null>(null);


  // Calculation
  const [basis, setBasis] = React.useState<DiscountRule["basis"]>(editing?.basis ?? "PCT");
  const [rateText, setRateText] = React.useState<string>(editing?.rate ?? "0.0000");
  const [amountText, setAmountText] = React.useState<string>(editing?.amount ?? "0.00");
  const [applyScope, setApplyScope] = React.useState<DiscountRule["apply_scope"]>(editing?.apply_scope ?? "LINE");
  const [stackable, setStackable] = React.useState<boolean>(editing?.stackable ?? true);
  const [priority, setPriority] = React.useState<number>(editing?.priority ?? 100);

  const formatLocalDate = (iso?: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
  };
  const [startAt, setStartAt] = React.useState<string>(formatLocalDate(editing?.start_at));
  const [endAt, setEndAt] = React.useState<string>(formatLocalDate(editing?.end_at));

  const [topErr, setTopErr] = React.useState("");
  const [rateErr, setRateErr] = React.useState("");
  const [amountErr, setAmountErr] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    let mounted = true;
    (async () => {
      try {
        const sp = await AdminAPI.stores({ is_active: true });
        const sl = Array.isArray(sp) ? sp : sp.results ?? [];
        const cp = await TaxCatsAPI.list({});
        const cl = Array.isArray(cp) ? cp : cp.results ?? [];
        if (mounted) { setStores(sl); setCats(cl); }
      } catch (e: any) {
        // push({ kind: "error", msg: e?.message || "Failed to load stores/categories" });
        error(e?.message || "Failed to load stores/categories");
      }
    })();
    return () => { mounted = false; };
  }, [open]);

  React.useEffect(() => {
    if (editing && open) {
      setStep(1);
      setTopErr(""); setRateErr(""); setAmountErr("");
      setCatQuery(""); setProdQuery(""); setVarQuery("");
      setAllCats(editing ? !(editing.categories && editing.categories.length) : false);
      setCategoryIds(editing?.categories ? editing.categories.map(c => c.id) : []);
      setProductIds(editing?.products ? editing.products.map(p => p.id) : []);
      setProdOptions(editing?.products ? editing.products.map(p => ({ id: p.id, name: p.name })) : []);
      setVariantIds(editing?.variants ? editing.variants.map(v => v.id) : []);
      setVarOptions(editing?.variants ? editing.variants.map(v => ({ id: v.id, sku: v.sku, name: (v.name || v.product_name || "") })) : []);
    }
  }, [editing, open]);

  if (!open) return null;

  // ---- Pickers helpers ----
  const toggleAllCategories = () => {
    if (allCats) {
      setAllCats(false);
      setCategoryIds([]);
    } else {
      setAllCats(true);
      // keep categoryIds empty; payload will signal "all categories" by sending []
    }
  };

  const onChangeCatBox = (id: number, checked: boolean) => {
    if (allCats) {
      // leaving "All" mode by tweaking a single box: create an explicit subset
      if (!checked) {
        setAllCats(false);
        setCategoryIds(cats.map(c => c.id).filter(x => x !== id));
      }
      // if checked in All mode: no-op (already visually checked)
    } else {
      setCategoryIds(prev => checked ? [...prev, id] : prev.filter(x => x !== id));
    }
  };

  const searchProducts = () => {
    if (prodTimer.current) window.clearTimeout(prodTimer.current);
    prodTimer.current = window.setTimeout(async () => {
      try {
        const list = await CatalogAPI.searchProducts(prodQuery.trim());
        setProdOptions(list);
      } catch (e: any) {
        // push({ kind: "error", msg: e?.message || "Failed to search products" });
        error(e?.message || "Failed to search products");
      }
    }, 350);
  };

  const searchVariants = () => {
    if (varTimer.current) window.clearTimeout(varTimer.current);
    varTimer.current = window.setTimeout(async () => {
      try {
        const list = await CatalogAPI.searchVariants(
          varQuery.trim(),
          scope === "STORE" ? (storeId || undefined) : undefined
        );
        setVarOptions(list);
      } catch (e: any) {
        // push({ kind: "error", msg: e?.message || "Failed to search variants" });
        error(e?.message || "Failed to search variants");
      }
    }, 350);
  };


  // ---- Validation & normalization ----
  const normalizeRate = () => {
    if (basis !== "PCT") return;
    if (rateText === "" || rateText === ".") { setRateErr("Rate is required."); return; }
    const n = Number(rateText.replace(/[^\d.]/g, ""));
    if (isNaN(n)) { setRateErr("Rate must be a number."); return; }
    const normalized = n > 1 ? n / 100 : n;
    setRateText(normalized.toFixed(4)); setRateErr("");
  };
  const normalizeAmount = () => {
    if (basis !== "FLAT") return;
    if (amountText === "" || amountText === ".") { setAmountErr("Amount is required."); return; }
    const n = Number(amountText.replace(/[^\d.]/g, ""));
    if (isNaN(n)) { setAmountErr("Amount must be a number."); return; }
    setAmountText(n.toFixed(2)); setAmountErr("");
  };

  const validateStep1 = () => {
    const errs: string[] = [];
    if (!code.trim()) errs.push("Code is required.");
    if (!name.trim()) errs.push("Name is required.");
    if (scope === "STORE" && !storeId) errs.push("Store is required when scope is Store.");

    if (target === "PRODUCT" && productIds.length === 0) errs.push("Products are required when target is Product.");
    if (target === "VARIANT" && variantIds.length === 0) errs.push("Variants are required when target is Variant.");

    // CATEGORY with none selected is allowed only if All toggle is on
    if (target === "CATEGORY" && !allCats && categoryIds.length === 0) {
      errs.push("Choose categories or enable All Categories.");
    }

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

  const next = () => { if (step === 1 && validateStep1()) setStep(2); };
  const back = () => setStep((s) => (s === 2 ? 1 : s));

  const save = async () => {
    if (!validateStep2()) return;
    setSaving(true);
    try {
      const payload: DiscountRuleCreatePayload = {
        code: code.trim(),
        name: name.trim(),
        is_active: isActive,
        description: description.trim(),

        scope,
        store: scope === "STORE" ? storeId : null,

        basis,
        rate: basis === "PCT" ? String(Number(rateText)) : null,
        amount: basis === "FLAT" ? String(Number(amountText)) : null,
        apply_scope: applyScope,

        target,
        stackable,
        priority: Number(priority) || 100,

        start_at: startAt || null,
        end_at: endAt || null,

        // Target payload: ALL/CATEGORY sends categories; PRODUCT/VARIANT send the others
        category_ids: target === "CATEGORY" ? (allCats ? [] : categoryIds) : [],
        product_ids: target === "PRODUCT" ? productIds : [],
        variant_ids: target === "VARIANT" ? variantIds : [],
      };

      if (isEdit && editing) {
        await DiscountRulesAPI.update(editing.id, payload);
        // push({ kind: "success", msg: "Discount rule updated" });
        success("Discount rule updated");
      } else {
        await DiscountRulesAPI.create(payload);
        // push({ kind: "success", msg: "Discount rule created" });
        success("Discount rule created");
      }
      onSaved(); onClose();
    } catch (e: any) {
      // push({ kind: "error", msg: e?.message || "Failed to save discount rule" });
      error(e?.message || "Failed to save discount rule");
    } finally {
      setSaving(false);
    }
  };

  // ---- Preview helpers ----
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

  const targetLabel = React.useMemo(() => {
    if (target === "ALL") return "All Items";
    if (target === "CATEGORY") {
      if (allCats || categoryIds.length === 0) return "All Categories";
      const names = cats.filter(c => categoryIds.includes(c.id)).map(c => `${c.name} (${c.code})`);
      const shown = names.slice(0, 3).join(", ");
      const more = names.length - 3;
      return more > 0 ? `${shown} +${more} more` : shown;
    }
    if (target === "PRODUCT") {
      if (!productIds.length) return "No products selected";
      const names = prodOptions
        .filter(p => productIds.includes(p.id))
        .map(p => p.name);
      const shown = names.slice(0, 3).join(", ");
      const more = names.length - 3;
      return more > 0 ? `${shown} +${more} more` : shown || `${productIds.length} product(s)`;
    }
    if (target === "VARIANT") {
      if (!variantIds.length) return "No variants selected";
      const names = varOptions
        .filter(v => variantIds.includes(v.id))
        .map(v => v.sku);
      const shown = names.slice(0, 3).join(", ");
      const more = names.length - 3;
      return more > 0 ? `${shown} +${more} more` : shown || `${variantIds.length} variant(s)`;
    }
    return "";
  }, [target, allCats, categoryIds, cats, productIds, variantIds, prodOptions, varOptions]);

  // Clean up timers on unmount
  React.useEffect(() => {
    return () => {
      if (prodTimer.current) window.clearTimeout(prodTimer.current);
      if (varTimer.current) window.clearTimeout(varTimer.current);
    };
  }, []);


  // ---- UI ----
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
      <div className="w-[900px] rounded-xl border border-border bg-card">
        <div className="border-b border-border p-3">
          <h3 className="font-semibold">{isEdit ? "Edit Discount Rule" : "New Discount Rule"}</h3>
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
                         className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="text-sm">Name *</label>
                  <input value={name} onChange={(e) => setName(e.target.value)}
                         className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none" />
                </div>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                  <span className="text-sm">Active</span>
                </label>

                <div>
                  <label className="text-sm">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none"
                    placeholder="What does this discount rule do?"
                  />
                </div>
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
                  <label className={`text-sm ${scope === "STORE" ? "" : "text-muted-foreground"}`}>Store {scope === "STORE" ? "*" : ""}</label>
                  <select
                    value={storeId || 0}
                    onChange={(e) => setStoreId(Number(e.target.value))}
                    disabled={scope !== "STORE"}
                    className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none disabled:opacity-50"
                  >
                    <option value={0}>Select a store…</option>
                    {stores.map(s => (<option key={s.id} value={s.id}>{s.name} ({s.code})</option>))}
                  </select>
                </div>

                <div>
                  <label className="text-sm">Target *</label>
                  <div className="mt-1 flex flex-wrap items-center gap-4">
                    {(["ALL","CATEGORY","PRODUCT","VARIANT"] as const).map(t => (
                      <label key={t} className="inline-flex items-center gap-2">
                        <input type="radio" checked={target === t} onChange={() => setTarget(t)} />
                        <span className="text-sm">{t.charAt(0) + t.slice(1).toLowerCase()}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* CATEGORY picker */}
                {target === "CATEGORY" && (
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <label className="text-sm">Categories</label>
                        <label className="inline-flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={allSelectedVisual}
                            onChange={toggleAllCategories}
                            disabled={!cats.length}
                          />
                          <span>All Categories</span>
                        </label>
                      </div>
                      <input
                        value={catQuery}
                        onChange={(e) => setCatQuery(e.target.value)}
                        placeholder="Search categories…"
                        className="rounded-md bg-muted px-2 py-1 text-xs outline-none placeholder:text-muted-foreground"
                      />
                    </div>
                    <div className="mt-1 space-y-1 max-h-32 overflow-auto border border-border rounded-md p-2">
                      {filteredCats.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No matching categories.</p>
                      ) : (
                        filteredCats.map(c => (
                          <label key={c.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={allCats || categoryIds.includes(c.id)}
                              onChange={(e) => onChangeCatBox(c.id, e.target.checked)}
                            />
                            {c.name} ({c.code})
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* PRODUCT picker */}
                {target === "PRODUCT" && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        value={prodQuery}
                        onChange={(e) => { setProdQuery(e.target.value); searchProducts(); }}
                        placeholder="Search products…"
                        className="rounded-md bg-muted px-2 py-1 text-xs outline-none placeholder:text-muted-foreground"
                      />
                      <button onClick={searchProducts} className="px-2 py-1 rounded-md bg-muted hover:bg-muted text-foreground text-xs">
                        Search
                      </button>
                    </div>
                    <div className="max-h-32 overflow-auto border border-border rounded-md p-2 space-y-1">
                      {prodOptions.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No results.</p>
                      ) : prodOptions.map(p => (
                        <label key={p.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={productIds.includes(p.id)}
                            onChange={(e) =>
                              setProductIds(prev => e.target.checked ? [...prev, p.id] : prev.filter(x => x !== p.id))
                            }
                          />
                          {p.name}{p.sku ? ` (${p.sku})` : ""}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* VARIANT picker */}
                {target === "VARIANT" && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        value={varQuery}
                        onChange={(e) => { setVarQuery(e.target.value); searchVariants(); }}
                        placeholder="Search variants by SKU…"
                        className="rounded-md bg-muted px-2 py-1 text-xs outline-none placeholder:text-muted-foreground"
                      />
                      <button onClick={searchVariants} className="px-2 py-1 rounded-md bg-muted hover:bg-muted text-foreground text-xs">
                        Search
                      </button>
                    </div>
                    <div className="max-h-32 overflow-auto border border-border rounded-md p-2 space-y-1">
                      {varOptions.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No results.</p>
                      ) : varOptions.map(v => (
                        <label key={v.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={variantIds.includes(v.id)}
                            onChange={(e) =>
                              setVariantIds(prev => e.target.checked ? [...prev, v.id] : prev.filter(x => x !== v.id))
                            }
                          />
                          {v.sku}{v.name ? ` - (${v.name})` : ""}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-2 gap-4">
              {/* Basis/Amount */}
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
                      className={`w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none ${rateErr ? "ring-1 ring-destructive" : ""}`}
                    />
                    <p className={`text-xs mt-1 ${rateErr ? "text-red-400" : "text-muted-foreground"}`}>
                      {rateErr || "Percent as fraction (e.g., 8.25% → 0.0825). You can type 8.25; we'll save 0.0825."}
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
                      className={`w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none ${amountErr ? "ring-1 ring-destructive" : ""}`}
                    />
                    <p className={`text-xs mt-1 ${amountErr ? "text-red-400" : "text-muted-foreground"}`}>
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

                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={stackable} onChange={(e) => setStackable(e.target.checked)} />
                  <span className="text-sm">Stackable</span>
                </label>

                <div>
                  <label className="text-sm">Priority</label>
                  <input
                    value={String(priority)}
                    onChange={(e) => setPriority(Number(e.target.value) || 0)}
                    inputMode="numeric"
                    className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none"
                    placeholder="100"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Lower runs earlier. Default 100.</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm">Start (optional)</label>
                    <input
                      type="datetime-local"
                      value={startAt || ""}
                      onChange={(e) => setStartAt(e.target.value)}
                      className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-sm">End (optional)</label>
                    <input
                      type="datetime-local"
                      value={endAt || ""}
                      onChange={(e) => setEndAt(e.target.value)}
                      className="w-full mt-1 rounded-md bg-muted px-3 py-2 text-sm outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Preview */}
          <div className="mt-2 rounded-md border border-border bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium">Preview:</span>{" "}
            <span>
              Applies to <span className="text-muted-foreground">{storeLabel}</span>
              {" • "}
              Target <span className="text-muted-foreground">{targetLabel}</span>
              {" • "}
              {basis === "PCT"
                ? <>Rate <span className="text-muted-foreground">{prettyPercent}</span></>
                : <>Amount <span className="text-muted-foreground">{Number(amountText || 0).toFixed(2)}</span></>
              }
              {" on "}
              <span className="text-muted-foreground">{applyScope === "LINE" ? "Line" : "Receipt"}</span>
              {" • "}
              Prio <span className="text-muted-foreground">{priority || 0}</span>
              {" • "}
              {isActive ? <span className="text-emerald-300">Active</span> : <span className="text-muted-foreground">Inactive</span>}
              {" • "}
              <span className="text-muted-foreground">{windowLabel}</span>
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border p-3">
          <div className="text-xs text-muted-foreground">
            {step === 1 ? "Step 1 of 2: Targeting" : "Step 2 of 2: Calculation"}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={saving}
                    className="px-3 py-1.5 rounded-md bg-muted hover:bg-muted text-foreground">Cancel</button>
            {step === 2 && (
              <button onClick={back}
                      className="px-3 py-1.5 rounded-md bg-muted hover:bg-muted text-foreground">Back</button>
            )}
            {step === 1 ? (
              <button onClick={next}
                      className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white">Next</button>
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
