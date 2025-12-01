import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { verifySignupOtp } from "./api";
import { getSignupStart } from "./state";

export default function SignupVerifyPage() {
  const { email } = getSignupStart();
  const [code, setCode] = useState("");
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
      await verifySignupOtp({ email, code });
      navigate("/signup/profile");
    } catch (err: any) {
      setError(err?.message || "Invalid code");
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
        className="w-full max-w-lg rounded-3xl border border-border bg-card p-8 shadow-2xl backdrop-blur"
      >
        <h1 className="text-3xl font-semibold mb-2">Verify your email</h1>
        <p className="text-muted-foreground mb-6">We sent a 6-digit code to <b>{email}</b>. Enter it to continue.</p>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-sm text-muted-foreground">OTP code</span>
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-black/30 px-3 py-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                className="w-full bg-transparent py-2 text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
          </label>

          {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="inline-flex items-center gap-1">
              <Clock className="h-4 w-4" /> Code expires in 10 minutes
            </div>
            <button
              type="button"
              className="text-indigo-300 hover:text-indigo-200"
              onClick={() => navigate("/signup/start")}
            >
              Change email
            </button>
          </div>

          <button
            type="submit"
            disabled={code.length < 4 || loading}
            className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-center text-sm font-semibold text-foreground shadow-lg shadow-indigo-600/30 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Verifying..." : "Verify and continue"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
