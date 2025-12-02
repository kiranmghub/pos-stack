import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Building2, Eye, EyeOff, Lock, Mail, Sparkles } from "lucide-react";
import { setStoredUserMeta } from "@/lib/auth";

/**
 * Beautiful tenant‑aware Login Page for your POS PWA.
 *
 * Assumptions
 * - Backend token endpoint: POST /api/v1/auth/token/
 *   Body: { username, password, tenant_code }
 *   Response: { access, refresh, tenant: {id, code}, role }
 * - On success we store tokens in localStorage and redirect to /.
 *
 * How to use
 * - Drop this component into your React app's route (e.g., /login).
 * - TailwindCSS should be enabled. No shadcn/ui required, but you can swap easily.
 * - All libraries are available in this environment per canvas rules.
 */

const API_BASE = import.meta?.env?.VITE_API_BASE || ""; // e.g., "http://127.0.0.1:8000"

function classNames(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [tenantCode, setTenantCode] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitEnabled = useMemo(() => {
    return username.trim().length > 0 && password.length > 0 && tenantCode.trim().length > 0;
  }, [username, password, tenantCode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!submitEnabled || loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/token/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, tenant_code: tenantCode })
      });

      if (!res.ok) {
        const msg = await safeMessage(res);
        throw new Error(msg || `Login failed (${res.status})`);
      }

      const data = await res.json();

    console.log("login response", data); // debug in DevTools → Network/Console

        if (!data?.access || !data?.refresh) {
          throw new Error("Token response missing");
        }

        localStorage.setItem("access_token", data.access);
        localStorage.setItem("refresh_token", data.refresh);
        localStorage.setItem("tenant_code", data?.tenant?.code || tenantCode);
        localStorage.setItem("role", data?.role || "");
        setStoredUserMeta({
          username,
          email: data?.user?.email ?? data?.email ?? null,
          display_name: data?.user?.name ?? data?.user?.full_name ?? null,
          role: data?.role ?? null,
        });

        // Redirect only after tokens are saved
        window.location.href = "/home";
    } catch (err: any) {
      setError(err?.message || "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full overflow-hidden bg-gradient-to-br from-background via-muted/30 to-muted/50 text-foreground">
      {/* Soft animated orbs */}
      <motion.div
        className="pointer-events-none fixed -top-32 -left-24 h-96 w-96 rounded-full bg-muted/30 blur-3xl"
        animate={{ x: [0, 20, -10, 0], y: [0, 10, -10, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="pointer-events-none fixed -bottom-32 -right-24 h-[28rem] w-[28rem] rounded-full bg-muted/20 blur-3xl"
        animate={{ x: [0, -15, 10, 0], y: [0, -10, 5, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative mx-auto flex min-h-screen max-w-7xl items-center justify-center px-4">
        <div className="grid w-full grid-cols-1 items-center gap-10 md:grid-cols-2">
          {/* Left: Brand blurb */}
          <div className="hidden md:block">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <div className="mb-6 inline-flex items-center gap-3 rounded-full bg-muted px-4 py-2 ring-1 ring-white/15">
                <Sparkles className="h-4 w-4" />
                <span className="text-sm text-muted-foreground">Omnichannel POS • Offline‑first • Multi‑tenant</span>
              </div>
              <h1 className="text-4xl font-semibold leading-tight text-foreground md:text-5xl">
                Welcome back
                <span className="block text-lg font-normal text-muted-foreground">Sign in to your store workspace</span>
              </h1>
              <p className="mt-6 max-w-md text-muted-foreground">
                Secure, tenant‑aware login. Use your <span className="font-medium text-foreground">username</span>,
                your tenant’s <span className="font-medium text-foreground">code</span>, and password to continue.
              </p>
            </motion.div>
          </div>

          {/* Right: Login card */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="relative mx-auto w-full max-w-md">
              <div className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-tr from-muted/20 to-muted/10 blur-xl" />
              <div className="rounded-3xl border border-border bg-card p-6 shadow-2xl backdrop-blur-xl md:p-8">
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/20 ring-1 ring-white/15">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">Sign in</h2>
                    <p className="text-sm text-muted-foreground">Enter your credentials to continue</p>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Username */}
                  <label className="block">
                    <span className="mb-1.5 block text-sm text-muted-foreground">Username</span>
                    <div className="group relative flex items-center rounded-2xl border border-border bg-black/20 px-3 focus-within:ring-2 focus-within:ring-indigo-500/60">
                      <Mail className="mr-2 h-4 w-4 shrink-0 text-muted-foreground/70" />
                      <input
                        type="text"
                        inputMode="text"
                        autoComplete="username"
                        className="h-11 w-full bg-transparent py-2.5 text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                        placeholder="jane.doe"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                      />
                    </div>
                  </label>

                  {/* Tenant code */}
                  <label className="block">
                    <span className="mb-1.5 block text-sm text-muted-foreground">Tenant code</span>
                    <div className="group relative flex items-center rounded-2xl border border-border bg-black/20 px-3 focus-within:ring-2 focus-within:ring-indigo-500/60">
                      <Building2 className="mr-2 h-4 w-4 shrink-0 text-muted-foreground/70" />
                      <input
                        type="text"
                        inputMode="text"
                        className="h-11 w-full bg-transparent py-2.5 text-foreground uppercase tracking-wide placeholder:text-muted-foreground/60 focus:outline-none"
                        placeholder="ACME"
                        value={tenantCode}
                        onChange={(e) => setTenantCode(e.target.value)}
                      />
                    </div>
                  </label>

                  {/* Password */}
                  <label className="block">
                    <span className="mb-1.5 block text-sm text-muted-foreground">Password</span>
                    <div className="group relative flex items-center rounded-2xl border border-border bg-black/20 px-3 focus-within:ring-2 focus-within:ring-indigo-500/60">
                      <Lock className="mr-2 h-4 w-4 shrink-0 text-muted-foreground/70" />
                      <input
                        type={showPw ? "text" : "password"}
                        autoComplete="current-password"
                        className="h-11 w-full bg-transparent py-2.5 text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw((s) => !s)}
                        className="ml-2 rounded-lg p-1 text-muted-foreground/70 hover:bg-muted"
                        aria-label={showPw ? "Hide password" : "Show password"}
                      >
                        {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </label>

                  {error && (
                    <div className="rounded-xl border border-error/30 bg-error/10 px-3 py-2 text-sm text-error-foreground">
                      {error}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                      <input type="checkbox" className="h-4 w-4 rounded border-border/40 bg-transparent" />
                      Remember me
                    </label>
                    <a href="#" className="text-sm text-primary hover:text-primary/80">Forgot password?</a>
                  </div>

                  <button
                    type="submit"
                    disabled={!submitEnabled || loading}
                    className={classNames(
                      "group relative mt-2 inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl px-4 py-3 text-sm font-semibold",
                      submitEnabled && !loading
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "bg-muted text-muted-foreground/70"
                    )}
                  >
                    <span className="relative z-10">{loading ? "Signing in…" : "Sign in"}</span>
                    <motion.span
                      aria-hidden
                      className="absolute inset-0 -z-0 bg-gradient-to-r from-primary/0 via-primary/20 to-accent/0"
                      initial={{ x: "-100%" }}
                      animate={{ x: loading ? ["-100%", "100%"] : "-100%" }}
                      transition={{ duration: 1.2, repeat: loading ? Infinity : 0, ease: "linear" }}
                    />
                  </button>

                  <p className="pt-2 text-center text-sm text-muted-foreground">
                    Need an account? <a href="#" className="text-primary hover:text-primary/80">Contact your tenant admin</a>
                  </p>
                </form>
              </div>

              <p className="mt-6 text-center text-xs text-muted-foreground/80">
                By continuing you agree to our <a className="underline decoration-muted-foreground/50 hover:text-muted-foreground" href="#">Terms</a> and <a className="underline decoration-muted-foreground/50 hover:text-muted-foreground" href="#">Privacy Policy</a>.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

async function safeMessage(res: Response): Promise<string | null> {
  try {
    const data = await res.json();
    return data?.detail || data?.message || null;
  } catch (_) {
    return null;
  }
}
