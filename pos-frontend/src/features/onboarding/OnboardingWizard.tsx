import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Store, MonitorSmartphone, Receipt, Package2, Upload, Wand2 } from "lucide-react";
import ImportModal from "@/features/catalog/components/ImportModal";
import {
  fetchOnboardingState,
  markOnboardingStep,
  generateCode,
  fetchTenantMeta,
  createStoreQuick,
  createRegisterQuick,
  createTaxCategoryQuick,
  createTaxRuleQuick,
} from "./api";

type StepKey = "store" | "register" | "tax_category" | "tax_rule" | "catalog" | "done";

const countries = [
  { code: "US", label: "United States", cities: ["New York", "Los Angeles", "Chicago"], currency: "USD" },
  { code: "IN", label: "India", cities: ["Mumbai", "Delhi", "Bengaluru"], currency: "INR" },
  { code: "SG", label: "Singapore", cities: ["Singapore"], currency: "SGD" },
  { code: "GB", label: "United Kingdom", cities: ["London"], currency: "GBP" },
  { code: "EU", label: "Eurozone", cities: ["Berlin"], currency: "EUR" },
];

const steps: { key: StepKey; title: string; desc: string; icon: any }[] = [
  { key: "store", title: "Store", desc: "Create your first store", icon: Store },
  { key: "register", title: "Register", desc: "Add a checkout register", icon: MonitorSmartphone },
  { key: "tax_category", title: "Tax Category", desc: "Define your tax category", icon: Receipt },
  { key: "tax_rule", title: "Tax Rule", desc: "Create a tax rule", icon: Receipt },
  { key: "catalog", title: "Products", desc: "Import products", icon: Package2 },
  { key: "variants", title: "Variants", desc: "Import variants", icon: Upload },
  { key: "done", title: "Done", desc: "Finish onboarding", icon: Sparkles },
];

function AutoButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-indigo-200 hover:bg-card disabled:opacity-50"
    >
      <Wand2 className="h-4 w-4" /> Auto-generate
    </button>
  );
}

function slugifyLocal(text: string) {
  return (text || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function stripTenantPrefix(code: string) {
  return (code || "").replace(/^(tnt|str|rgt|tct|trl|prd|var)-/i, "");
}

export default function OnboardingWizard() {
  const [stepIndex, setStepIndex] = useState(0);
  const [state, setState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tenantCode, setTenantCode] = useState<string>("");

  const [autoStoreCode, setAutoStoreCode] = useState(true);
  const [autoRegisterCode, setAutoRegisterCode] = useState(true);
  const [autoTaxCatCode, setAutoTaxCatCode] = useState(true);
  const [autoTaxRuleCode, setAutoTaxRuleCode] = useState(true);
  // Store form
  const [storeForm, setStoreForm] = useState({
    name: "",
    code: "",
    country: "US",
    city: "",
    state: "",
    postal_code: "",
    street: "",
    region: "",
    phone_number: "",
    email: "",
  });
  const [storeId, setStoreId] = useState<number | null>(null);
  // Register form
  const [registerForm, setRegisterForm] = useState({ name: "", code: "", pin: "" });
  // Tax category form
  const [taxCatForm, setTaxCatForm] = useState({ name: "", code: "", rate: "" });
  const [taxCatId, setTaxCatId] = useState<number | null>(null);
  // Tax rule form
  const [taxRuleForm, setTaxRuleForm] = useState({ name: "", code: "", basis: "PCT", rate: "0.1000", amount: "" });
  // Catalog import
  const [showImport, setShowImport] = useState<{ open: boolean; scope: "products" | "variants" }>({ open: false, scope: "products" });

  useEffect(() => {
    fetchOnboardingState()
      .then((res) => {
        setState(res);
        setLoading(false);
      })
      .catch((err) => {
        setError(err?.message || "Failed to load onboarding");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    // advance step based on completion
    if (!state) return;
    const next = computeNextStep(state);
    setStepIndex(next);
  }, [state]);

  // Fetch tenant meta to default country and tenant code for better code generation
  useEffect(() => {
    fetchTenantMeta()
      .then((meta) => {
        if (meta?.country) {
          setStoreForm((f) => ({ ...f, country: meta.country }));
        }
        if (meta?.code) {
          setTenantCode(meta.code);
        }
      })
      .catch(() => {});
  }, []);

  const current = steps[stepIndex];

  function computeNextStep(s: any): number {
    if (!s?.steps) return 0;
    if (s.status === "live") return steps.length - 1;
    if (!s.steps.store_setup) return steps.findIndex((st) => st.key === "store");
    if (!s.steps.registers) return steps.findIndex((st) => st.key === "register");
    if (!s.steps.taxes) return steps.findIndex((st) => st.key === "tax_category");
    if (!s.steps.catalog) return steps.findIndex((st) => st.key === "catalog");
    if (!s.steps.variants) return steps.findIndex((st) => st.key === "variants");
    return steps.length - 1;
  }

  const prefixMap: Record<string, string> = {
    store: "STR",
    register: "RGT",
    taxcategory: "TCT",
    taxrule: "TRL",
    product: "PRD",
    variants: "VAR",
  };

  async function handleGenerate(model: string, base?: string, setter?: (code: string) => void) {
    try {
      const tenantSlugClean = slugifyLocal(stripTenantPrefix(tenantCode));
      const nameSlug = slugifyLocal(base || "");
      const prefix = prefixMap[model] || "";
      const parts = [prefix, tenantSlugClean, nameSlug || model].filter(Boolean);
      const combined = parts.join("-").replace(/--+/g, "-");
      const res = await generateCode(model, combined);
      if (setter) setter(res.code);
    } catch (e: any) {
      setError(e?.message || "Failed to generate code");
    }
  }

  async function handleStoreNext() {
    setError(null);
    setSuccess(null);
    if (!storeForm.name || !storeForm.code) {
      setError("Store name and code are required.");
      return;
    }
    try {
      const payload = { ...storeForm };
      const res = await createStoreQuick(payload);
      setStoreId(res.store_id);
      await markOnboardingStep("store_setup");
      const newState = await fetchOnboardingState();
      setState(newState);
      setSuccess("Store created.");
      setStepIndex((i) => i + 1);
    } catch (e: any) {
      setError(e?.message || "Failed to create store");
    }
  }

  async function handleRegisterNext() {
    setError(null);
    setSuccess(null);
    if (!storeId) {
      setError("Create a store first.");
      return;
    }
    if (!registerForm.code) {
      setError("Register code is required.");
      return;
    }
    try {
      await createRegisterQuick({ ...registerForm, store_id: storeId });
      await markOnboardingStep("registers");
      const newState = await fetchOnboardingState();
      setState(newState);
      setSuccess("Register created.");
      setStepIndex((i) => i + 1);
    } catch (e: any) {
      setError(e?.message || "Failed to create register");
    }
  }

  async function handleTaxCatNext() {
    setError(null);
    setSuccess(null);
    if (!taxCatForm.name || !taxCatForm.code) {
      setError("Tax category name and code are required.");
      return;
    }
    try {
      const res = await createTaxCategoryQuick({ ...taxCatForm, rate: taxCatForm.rate || "0.0" });
      setTaxCatId(res.tax_category_id);
      setSuccess("Tax category created.");
      // do not mark taxes yet; wait for rule
      setStepIndex((i) => i + 1);
    } catch (e: any) {
      setError(e?.message || "Failed to create tax category");
    }
  }

  async function handleTaxRuleNext() {
    setError(null);
    setSuccess(null);
    if (!taxRuleForm.name || !taxRuleForm.code) {
      setError("Tax rule name and code are required.");
      return;
    }
    try {
      await createTaxRuleQuick({
        name: taxRuleForm.name,
        code: taxRuleForm.code,
        basis: taxRuleForm.basis,
        rate: taxRuleForm.rate || null,
        amount: taxRuleForm.amount || null,
        apply_scope: "RECEIPT",
        tax_category_id: taxCatId,
      });
      await markOnboardingStep("taxes");
      const newState = await fetchOnboardingState();
      setState(newState);
      setSuccess("Tax rule created.");
      setStepIndex((i) => i + 1);
    } catch (e: any) {
      setError(e?.message || "Failed to create tax rule");
    }
  }

  async function handleFinish() {
    setError(null);
    setSuccess(null);
    if (!state?.steps?.store_setup || !state?.steps?.taxes || !state?.steps?.catalog || !state?.steps?.variants || !state?.steps?.registers) {
      setError("Complete prior steps first.");
      return;
    }
    try {
      await markOnboardingStep("live");
      const newState = await fetchOnboardingState();
      setState(newState);
      setSuccess("Onboarding complete!");
      setStepIndex(steps.length - 1);
      // refresh home badge
      setTimeout(() => (window.location.href = "/home"), 800);
    } catch (e: any) {
      setError(e?.message || "Failed to finish onboarding");
    }
  }

  const countryObj = countries.find((c) => c.code === storeForm.country);
  const citySuggestions = useMemo(() => countryObj?.cities || [], [countryObj]);

  // auto-generate codes when entering a step and empty
  // regenerate codes when names change and auto flags are on
  useEffect(() => {
    if (storeForm.name && autoStoreCode) {
      handleGenerate("store", storeForm.name, (code) => setStoreForm((f) => ({ ...f, code })));
    } else if (!storeForm.name && autoStoreCode) {
      setStoreForm((f) => ({ ...f, code: "" }));
    }
  }, [storeForm.name]);
  useEffect(() => {
    if (registerForm.name && autoRegisterCode) {
      handleGenerate("register", registerForm.name, (code) => setRegisterForm((f) => ({ ...f, code })));
    } else if (!registerForm.name && autoRegisterCode) {
      setRegisterForm((f) => ({ ...f, code: f.code ? f.code : "" }));
    }
  }, [registerForm.name]);
  useEffect(() => {
    if (taxCatForm.name && autoTaxCatCode) {
      handleGenerate("taxcategory", taxCatForm.name, (code) => setTaxCatForm((f) => ({ ...f, code })));
    }
  }, [taxCatForm.name]);
  useEffect(() => {
    if (taxRuleForm.name && autoTaxRuleCode) {
      handleGenerate("taxrule", taxRuleForm.name, (code) => setTaxRuleForm((f) => ({ ...f, code })));
    }
  }, [taxRuleForm.name]);
  // ensure variant modal defaults to variants
  useEffect(() => {
    if (steps[stepIndex].key === "variants") {
      setShowImport({ open: false, scope: "variants" });
    }
  }, [stepIndex]);

  if (loading) {
    return <div className="min-h-screen grid place-items-center bg-background text-foreground">Loading…</div>;
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-background/80 backdrop-blur">
      <div className="relative w-full max-w-4xl rounded-3xl border border-border bg-card p-6 shadow-2xl">
        <button
          className="absolute right-4 top-4 rounded-full p-2 text-muted-foreground hover:bg-card"
          onClick={() => (window.location.href = "/home")}
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-6 flex items-center gap-3">
          <Sparkles className="h-6 w-6 text-indigo-300" />
          <div>
            <div className="text-sm text-muted-foreground">Onboarding</div>
            <div className="text-xl font-semibold text-foreground">{current.title}</div>
            <div className="text-muted-foreground text-sm">{current.desc}</div>
          </div>
        </div>

        {error && <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}
        {success && <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{success}</div>}

        <AnimatePresence mode="wait">
          <motion.div
            key={current.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {current.key === "store" && (
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1 text-sm text-muted-foreground">
                  Store name
                  <input
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-foreground"
                    value={storeForm.name}
                    onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })}
                  />
                </label>
                <label className="space-y-1 text-sm text-muted-foreground">
                  Store code
                  <div className="flex items-center gap-2">
                    <input
                      className="w-full rounded-xl border border-border bg-card px-3 py-2 text-foreground"
                      value={storeForm.code}
                      onChange={(e) => {
                        setStoreForm({ ...storeForm, code: e.target.value });
                        setAutoStoreCode(false);
                      }}
                    />
                    <AutoButton onClick={() => handleGenerate("store", storeForm.name, (code) => setStoreForm({ ...storeForm, code }))} />
                  </div>
                </label>
                <label className="space-y-1 text-sm text-muted-foreground">
                  Country
                  <select
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-foreground"
                    value={storeForm.country}
                    onChange={(e) => setStoreForm({ ...storeForm, country: e.target.value, city: "" })}
                  >
                    {countries.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm text-muted-foreground">
                  City
                  <input
                    list="city-list"
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-foreground"
                    value={storeForm.city}
                    onChange={(e) => setStoreForm({ ...storeForm, city: e.target.value })}
                  />
                  <datalist id="city-list">
                    {citySuggestions.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </label>
                <label className="space-y-1 text-sm text-muted-foreground">
                  Street
                  <input
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-foreground"
                    value={storeForm.street}
                    onChange={(e) => setStoreForm({ ...storeForm, street: e.target.value })}
                  />
                </label>
                <label className="space-y-1 text-sm text-muted-foreground">
                  State/Province
                  <input
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-foreground"
                    value={storeForm.state}
                    onChange={(e) => setStoreForm({ ...storeForm, state: e.target.value })}
                  />
                </label>
                <label className="space-y-1 text-sm text-muted-foreground">
                  Postal code
                  <input
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-foreground"
                    value={storeForm.postal_code}
                    onChange={(e) => setStoreForm({ ...storeForm, postal_code: e.target.value })}
                  />
                </label>
                <label className="space-y-1 text-sm text-muted-foreground">
                  Phone
                  <input
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-foreground"
                    value={storeForm.phone_number}
                    onChange={(e) => setStoreForm({ ...storeForm, phone_number: e.target.value })}
                  />
                </label>
                <label className="space-y-1 text-sm text-muted-foreground">
                  Email
                  <input
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-foreground"
                    value={storeForm.email}
                    onChange={(e) => setStoreForm({ ...storeForm, email: e.target.value })}
                  />
                </label>
                <div className="md:col-span-2 flex justify-end">
                  <button
                    onClick={handleStoreNext}
                    className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-foreground shadow shadow-indigo-600/30"
                  >
                    Save & Next
                  </button>
                </div>
              </div>
            )}

            {current.key === "register" && (
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1 text-sm text-muted-foreground">
                  Register name
                  <input
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-foreground"
                    value={registerForm.name}
                    onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                  />
                </label>
                <label className="space-y-1 text-sm text-muted-foreground">
                  Register code
                    <div className="flex items-center gap-2">
                      <input
                        className="w-full rounded-xl border border-border bg-card px-3 py-2 text-foreground"
                        value={registerForm.code}
                        onChange={(e) => {
                          setRegisterForm({ ...registerForm, code: e.target.value });
                          setAutoRegisterCode(false);
                        }}
                      />
                      <AutoButton onClick={() => handleGenerate("register", registerForm.name, (code) => setRegisterForm({ ...registerForm, code }))} />
                    </div>
                  </label>
                <label className="space-y-1 text-sm text-muted-foreground">
                  PIN (optional)
                  <input
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-foreground"
                    value={registerForm.pin}
                    onChange={(e) => setRegisterForm({ ...registerForm, pin: e.target.value })}
                  />
                </label>
                <div className="md:col-span-2 flex justify-end">
                  <button
                    onClick={handleRegisterNext}
                    className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-foreground shadow shadow-indigo-600/30"
                  >
                    Save & Next
                  </button>
                </div>
              </div>
            )}

            {current.key === "tax_category" && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2 text-sm text-muted-foreground">
                  Examples: “Food Tax”, “Alcohol Tax”, “Standard VAT”. Enter a percentage (e.g., 8.25) or decimal (0.0825).
                </div>
                <label className="space-y-1 text-sm text-muted-foreground">
                  Tax category name
                  <input
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-foreground"
                    value={taxCatForm.name}
                    onChange={(e) => setTaxCatForm({ ...taxCatForm, name: e.target.value })}
                  />
                </label>
                <label className="space-y-1 text-sm text-muted-foreground">
                  Code
                  <div className="flex items-center gap-2">
                    <input
                      className="w-full rounded-xl border border-border bg-card px-3 py-2 text-foreground"
                      value={taxCatForm.code}
                      onChange={(e) => {
                        setTaxCatForm({ ...taxCatForm, code: e.target.value });
                        setAutoTaxCatCode(false);
                      }}
                    />
                    <AutoButton onClick={() => handleGenerate("taxcategory", taxCatForm.name, (code) => setTaxCatForm({ ...taxCatForm, code }))} />
                  </div>
                </label>
                <label className="space-y-1 text-sm text-muted-foreground">
                  Rate
                  <input
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-foreground"
                    value={taxCatForm.rate}
                    onChange={(e) => setTaxCatForm({ ...taxCatForm, rate: e.target.value })}
                  />
                </label>
                <div className="md:col-span-2 flex justify-end">
                  <button
                    onClick={handleTaxCatNext}
                    className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-foreground shadow shadow-indigo-600/30"
                  >
                    Save & Next
                  </button>
                </div>
              </div>
            )}

            {current.key === "tax_rule" && (
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1 text-sm text-muted-foreground">
                  Tax rule name
                  <input
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-foreground"
                    value={taxRuleForm.name}
                    onChange={(e) => setTaxRuleForm({ ...taxRuleForm, name: e.target.value })}
                  />
                </label>
                <label className="space-y-1 text-sm text-muted-foreground">
                  Code
                  <div className="flex items-center gap-2">
                    <input
                      className="w-full rounded-xl border border-border bg-card px-3 py-2 text-foreground"
                      value={taxRuleForm.code}
                      onChange={(e) => {
                        setTaxRuleForm({ ...taxRuleForm, code: e.target.value });
                        setAutoTaxRuleCode(false);
                      }}
                    />
                    <AutoButton onClick={() => handleGenerate("taxrule", taxRuleForm.name, (code) => setTaxRuleForm({ ...taxRuleForm, code }))} />
                  </div>
                </label>
                <label className="space-y-1 text-sm text-muted-foreground">
                  Basis
                  <select
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-foreground"
                    value={taxRuleForm.basis}
                    onChange={(e) => setTaxRuleForm({ ...taxRuleForm, basis: e.target.value })}
                  >
                    <option value="PCT">Percent</option>
                    <option value="FLAT">Flat</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm text-muted-foreground">
                  Rate/Amount
                  <input
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-foreground"
                    value={taxRuleForm.basis === "PCT" ? taxRuleForm.rate : taxRuleForm.amount}
                    onChange={(e) =>
                      setTaxRuleForm({
                        ...taxRuleForm,
                        rate: taxRuleForm.basis === "PCT" ? e.target.value : taxRuleForm.rate,
                        amount: taxRuleForm.basis === "FLAT" ? e.target.value : taxRuleForm.amount,
                      })
                    }
                  />
                </label>
                <div className="md:col-span-2 flex justify-end">
                  <button
                    onClick={handleTaxRuleNext}
                    className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-foreground shadow shadow-indigo-600/30"
                  >
                    Save & Next
                  </button>
                </div>
              </div>
            )}

            {current.key === "catalog" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Import products using the CSV/Excel template. Validate before importing.</p>
                <button
                  onClick={() => setShowImport({ open: true, scope: "products" })}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-foreground shadow shadow-indigo-600/30"
                >
                  <Upload className="h-4 w-4" /> Import Products
                </button>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={async () => {
                      try {
                        await markOnboardingStep("catalog");
                        const newState = await fetchOnboardingState();
                        setState(newState);
                        setStepIndex((i) => Math.min(i + 1, steps.length - 1));
                      } catch (err: any) {
                        setError(err?.message || "Failed to skip");
                      }
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground"
                  >
                    Skip for now
                  </button>
                  <button
                    onClick={() => setStepIndex((i) => i + 1)}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-foreground shadow shadow-indigo-600/30"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {current.key === "variants" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Import variants using the CSV/Excel template. Validate before importing.</p>
                <button
                  onClick={() => setShowImport({ open: true, scope: "variants" })}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-foreground shadow shadow-indigo-600/30"
                >
                  <Upload className="h-4 w-4" /> Import Variants
                </button>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={async () => {
                      try {
                        await markOnboardingStep("variants");
                        const newState = await fetchOnboardingState();
                        setState(newState);
                        setStepIndex((i) => Math.min(i + 1, steps.length - 1));
                      } catch (err: any) {
                        setError(err?.message || "Failed to skip");
                      }
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground"
                  >
                    Skip for now
                  </button>
                  <button
                    onClick={() => setStepIndex((i) => i + 1)}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-foreground shadow shadow-indigo-600/30"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {current.key === "done" && (
              <div className="space-y-4 text-muted-foreground">
                <p>Onboarding complete. You can now use POS, catalog, and admin features.</p>
                <button
                  onClick={handleFinish}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-foreground shadow shadow-emerald-600/30"
                >
                  Mark Live
                </button>
                <button
                  onClick={() => (window.location.href = "/home")}
                  className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground"
                >
                  Go to Home
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <ImportModal
        open={showImport.open}
        scopeOverride={showImport.scope}
        autoCloseOnApply
        onSuccess={async () => {
          if (showImport.scope === "products") {
            await markOnboardingStep("catalog");
            setSuccess("Products imported.");
          } else {
            await markOnboardingStep("variants");
            setSuccess("Variants imported.");
          }
          const newState = await fetchOnboardingState();
          setState(newState);
          setShowImport({ open: false, scope: "products" });
          setStepIndex((i) => Math.min(i + 1, steps.length - 1));
        }}
        onClose={async () => {
          const newState = await fetchOnboardingState();
          setState(newState);
          setShowImport({ open: false, scope: "products" });
        }}
      />
    </div>
  );
}
