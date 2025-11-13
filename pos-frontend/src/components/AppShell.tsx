// pos-frontend/src/components/AppShell.tsx
import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { Home, LogOut, Store } from "lucide-react";
import { getTenantCode, logout, getUser, refreshAccessIfNeeded, authHeaders } from "@/lib/auth";
import { Toaster } from "@/ui/toast"; // global toast container
import { ToastBridgeProvider } from "@/lib/notify";


type AppShellProps = {
  children: React.ReactNode;
  /** Optional page title shown as a section header */
  title?: string;
  /** Constrain inner content to a centered max width */
  contained?: boolean;
  /** Right-side header actions (buttons, etc.) */
  actions?: React.ReactNode;
  /** Optional subtitle under the title */
  subtitle?: React.ReactNode;
};


// export default function AppShell({ children }: { children: React.ReactNode }) {
export default function AppShell({ children, title, contained, actions, subtitle }: AppShellProps) {

  useTokenKeepAlive();

  const user = getUser();
  const tenantCode = getTenantCode();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-slate-950/85 backdrop-blur border-b border-slate-800">
        <div className="h-12 px-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link to="/home" className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-2 py-1 hover:bg-slate-700">
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline">Home</span>
            </Link>
          </div>

          {/* Center: Tenant → Store (store shown by each page) */}
          <div className="hidden sm:flex items-center gap-2 text-sm text-slate-300">
            <div className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5">
              <Store className="h-4 w-4 text-slate-400" />
              <span className="uppercase tracking-wider font-semibold">{tenantCode || "—"}</span>
              <span className="text-slate-500">→</span>
              <span id="appshell-store-name" className="font-medium truncate max-w-[240px]">
                {/* pages can update this span's textContent if they manage store selection */}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-300">{user?.username || "User"}</span>
            <button
              onClick={logout}
              className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2 py-1 hover:bg-red-500"
            >
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </div>
        </div>
      </header>

      {/* Page body */}
      <main>
        <ToastBridgeProvider>
        {children}
        </ToastBridgeProvider>
      </main>
      <Toaster/>
    </div>
  );
}

/* ----- keep access token fresh on focus/interval ----- */
function useTokenKeepAlive() {
  useEffect(() => {
    const tick = () => refreshAccessIfNeeded().catch(() => {/* ignore */});
    // on mount and on focus/visibility regain
    tick();
    const onFocus = () => tick();
    const onVis = () => { if (!document.hidden) tick(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    const id = window.setInterval(tick, 14 * 60 * 1000); // ~14 minutes

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(id);
    };
  }, []);
}

// A small, shared fetch wrapper that always sends auth/tenant headers,
// and auto-refreshes access token once on 401/Invalid token responses.
export async function ensureAuthedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const withAuth = (initIn?: RequestInit): RequestInit => {
    const caller = new Headers(initIn?.headers || {});
    const auth = authHeaders();
    Object.entries(auth).forEach(([k, v]) => {
      if (!caller.has(k)) caller.set(k, String(v));
    });
    return { ...initIn, headers: caller };
  };

  let res = await fetch(input, withAuth(init));

  if (res.status === 401 || res.status === 400) {
    let body = "";
    try { body = await res.clone().text(); } catch {}
    const looksInvalid = res.status === 401 || /invalid token/i.test(body);

    if (looksInvalid) {
      try {
        await refreshAccessIfNeeded();
        res = await fetch(input, withAuth(init));
      } catch {
        // refresh failed → return original 401/400
      }
    }
  }

  return res;
}

/* ----- NEW: PageHeading for consistent section headers ----- */
export function PageHeading({
  title,
  subtitle,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="border-b border-slate-800 px-4 py-4 flex items-center justify-between">
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {subtitle ? <div className="text-sm text-slate-400">{subtitle}</div> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
