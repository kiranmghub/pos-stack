import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, CreditCard, CheckCircle2, Ticket } from "lucide-react";
import { motion } from "framer-motion";
import { createTrialSubscription, listPlans } from "./api";
import { getSignupStart, getTenantId, clearSignupState } from "./state";

type PlanPrice = {
  id: number;
  plan_code: string;
  plan_name: string;
  description: string;
  currency: string;
  amount: number;
  billing_period: string;
  country_code: string;
};

export default function SignupPlanPage() {
  const { country, currency } = getSignupStart();
  const tenantId = getTenantId();
  const navigate = useNavigate();

  const [plans, setPlans] = useState<PlanPrice[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string>("");
  const [couponCode, setCouponCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) {
      navigate("/signup/start", { replace: true });
      return;
    }
    listPlans({ country, currency })
      .then((res) => {
        setPlans(res || []);
        if (res && res.length > 0) setSelectedPlan(res[0].plan_code);
      })
      .catch((err) => setError(err?.message || "Failed to load plans"));
  }, [country, currency, tenantId, navigate]);

  const currencySymbol = useMemo(() => {
    if (currency === "INR") return "₹";
    if (currency === "EUR") return "€";
    return "$";
  }, [currency]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId || !selectedPlan) return;
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await createTrialSubscription({
        tenant_id: tenantId,
        plan_code: selectedPlan,
        country,
        currency,
        coupon_code: couponCode || undefined,
      });
      setSuccessMsg("Trial activated. Redirecting...");
      clearSignupState();
      navigate("/signup/success");
    } catch (err: any) {
      setError(err?.message || "Failed to create subscription");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-3xl rounded-3xl border border-border bg-card p-8 shadow-2xl backdrop-blur"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-semibold">Choose your plan</h1>
            <p className="text-muted-foreground">Start with a trial—no payment required. Prices shown in {currency}.</p>
          </div>
          <Sparkles className="h-8 w-8 text-indigo-300" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            {plans.map((p) => {
              const active = selectedPlan === p.plan_code;
              return (
                <button
                  type="button"
                  key={`${p.plan_code}-${p.currency}-${p.billing_period}`}
                  onClick={() => setSelectedPlan(p.plan_code)}
                  className={`rounded-2xl border px-4 py-4 text-left transition ${
                    active
                      ? "border-indigo-400 bg-indigo-500/10 shadow shadow-indigo-500/30"
                      : "border-border bg-card hover:border-indigo-400/60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-semibold">{p.plan_name}</h3>
                      <p className="text-sm text-muted-foreground">{p.description}</p>
                    </div>
                    {active && <CheckCircle2 className="h-6 w-6 text-indigo-300" />}
                  </div>
                  <div className="mt-3 text-2xl font-bold text-foreground">
                    {currencySymbol}
                    {p.amount} <span className="text-sm font-normal text-muted-foreground">/ {p.billing_period}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_1fr]">
            <label className="block space-y-2">
              <span className="text-sm text-muted-foreground">Coupon (optional)</span>
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-black/30 px-3 py-2">
                <Ticket className="h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  className="w-full bg-transparent py-2 text-foreground placeholder:text-muted-foreground/60 focus:outline-none uppercase"
                  placeholder="WELCOME10"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                />
              </div>
            </label>
            <div className="rounded-2xl border border-border bg-black/30 px-3 py-3 text-sm text-muted-foreground flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Trial starts immediately; renewal happens after the trial ends.
            </div>
          </div>

          {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}
          {successMsg && <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{successMsg}</p>}

          <button
            type="submit"
            disabled={loading || !selectedPlan}
            className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-center text-sm font-semibold text-foreground shadow-lg shadow-indigo-600/30 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Activating trial..." : "Start trial"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
