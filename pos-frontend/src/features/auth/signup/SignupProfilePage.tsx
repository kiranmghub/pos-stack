import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { User, Lock, Store } from "lucide-react";
import { motion } from "framer-motion";
import { completeSignupProfile } from "./api";
import { getSignupStart, persistTenantId } from "./state";

export default function SignupProfilePage() {
  const { email } = getSignupStart();
  const [tenantName, setTenantName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!email) navigate("/signup/start", { replace: true });
  }, [email, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError(null);
    try {
      const res = await completeSignupProfile({
        email,
        tenant_name: tenantName,
        admin_first_name: firstName,
        admin_last_name: lastName,
        admin_password: password,
      });
      if (res?.tenant_id) {
        persistTenantId(res.tenant_id);
      }
      navigate("/signup/plan");
    } catch (err: any) {
      setError(err?.message || "Failed to create account");
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
        <h1 className="text-3xl font-semibold mb-2">Business profile</h1>
        <p className="text-slate-300/80 mb-6">Tell us about your business and the admin user we’re creating.</p>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-sm text-slate-200">Business / tenant name</span>
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
              <Store className="h-4 w-4 text-slate-300/80" />
              <input
                type="text"
                required
                className="w-full bg-transparent py-2 text-slate-100 placeholder:text-slate-400/60 focus:outline-none"
                placeholder="Alice Mart"
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
              />
            </div>
          </label>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm text-slate-200">First name</span>
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
                <User className="h-4 w-4 text-slate-300/80" />
                <input
                  type="text"
                  required
                  className="w-full bg-transparent py-2 text-slate-100 placeholder:text-slate-400/60 focus:outline-none"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
            </label>

            <label className="block space-y-2">
              <span className="text-sm text-slate-200">Last name</span>
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
                <User className="h-4 w-4 text-slate-300/80" />
                <input
                  type="text"
                  className="w-full bg-transparent py-2 text-slate-100 placeholder:text-slate-400/60 focus:outline-none"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </label>
          </div>

          <label className="block space-y-2">
            <span className="text-sm text-slate-200">Password</span>
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
              <Lock className="h-4 w-4 text-slate-300/80" />
              <input
                type="password"
                required
                className="w-full bg-transparent py-2 text-slate-100 placeholder:text-slate-400/60 focus:outline-none"
                placeholder="StrongPass123!"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </label>

          {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}

          <button
            type="submit"
            disabled={loading || !tenantName || !firstName || password.length < 6}
            className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-center text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Creating..." : "Continue to plans"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
