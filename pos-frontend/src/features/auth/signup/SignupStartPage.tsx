import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Globe2, Mail, DollarSign } from "lucide-react";
import { motion } from "framer-motion";
import { startSignup, getGeoMeta } from "./api";
import { persistSignupStart } from "./state";

const fallbackCountries = [
  { code: "US", label: "United States", currency: "USD" },
  { code: "IN", label: "India", currency: "INR" },
  { code: "SG", label: "Singapore", currency: "SGD" },
  { code: "GB", label: "United Kingdom", currency: "GBP" },
  { code: "EU", label: "Eurozone", currency: "EUR" },
];

export default function SignupStartPage() {
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("US");
  const [currency, setCurrency] = useState("USD");
  const [countries, setCountries] = useState(fallbackCountries);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSignIn, setShowSignIn] = useState(false);
  const [userEditedCountry, setUserEditedCountry] = useState(false);
  const [userEditedCurrency, setUserEditedCurrency] = useState(false);
  const navigate = useNavigate();

  const canSubmit = email.trim().length > 3;

  // Fetch geo defaults for country/currency hint
  useEffect(() => {
    getGeoMeta()
      .then((meta) => {
        if (Array.isArray(meta?.options) && meta.options.length > 0) {
          setCountries(meta.options);
        }
        if (meta?.country && !userEditedCountry) setCountry(meta.country);
        if (meta?.currency && !userEditedCurrency) setCurrency(meta.currency);
      })
      .catch(() => {
        // best-effort; keep defaults on failure
      });
  }, [userEditedCountry, userEditedCurrency]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    setError(null);
    try {
      await startSignup({ email, country_code: country, preferred_currency: currency });
      persistSignupStart({ email, country, currency });
      navigate("/signup/verify");
    } catch (err: any) {
      setError(err?.message || "Failed to start signup");
      if (err?.message?.toLowerCase?.().includes("already exists")) {
        setShowSignIn(true);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur"
      >
        <h1 className="text-3xl font-semibold mb-2">Create your account</h1>
        <p className="text-slate-300/80 mb-6">Start with your email, country, and currency. We’ll send you a verification code.</p>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-sm text-slate-200">Email</span>
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
              <Mail className="h-4 w-4 text-slate-300/80" />
              <input
                type="email"
                required
                className="w-full bg-transparent py-2 text-slate-100 placeholder:text-slate-400/60 focus:outline-none"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </label>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm text-slate-200">Country</span>
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
                <Globe2 className="h-4 w-4 text-slate-300/80" />
                <select
                  className="w-full bg-transparent py-2 text-slate-100 focus:outline-none"
                value={country}
                onChange={(e) => {
                  const next = e.target.value;
                  setCountry(next);
                  setUserEditedCountry(true);
                  const found = countries.find((c) => c.code === next);
                  if (found?.currency) {
                    setCurrency(found.currency);
                    setUserEditedCurrency(true);
                  }
                }}
              >
                  {countries.map((c) => (
                    <option key={c.code} value={c.code} className="text-slate-900">
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </label>

            <label className="block space-y-2">
              <span className="text-sm text-slate-200">Preferred currency</span>
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
                <DollarSign className="h-4 w-4 text-slate-300/80" />
                <select
                  className="w-full bg-transparent py-2 text-slate-100 focus:outline-none"
                  value={currency}
                  onChange={(e) => {
                    setCurrency(e.target.value);
                    setUserEditedCurrency(true);
                  }}
                >
                  {[...new Set(countries.map((c) => c.currency || c.code))].map((ccy) => (
                    <option key={ccy} value={ccy} className="text-slate-900">
                      {ccy}
                    </option>
                  ))}
                </select>
              </div>
            </label>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200 space-y-2">
              <div>{error}</div>
              {showSignIn && (
                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  className="inline-flex items-center rounded-lg bg-white/10 px-3 py-1 text-xs font-semibold text-white hover:bg-white/15"
                >
                  Go to Sign In
                </button>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit || loading}
            className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-center text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Sending code..." : "Send verification code"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
