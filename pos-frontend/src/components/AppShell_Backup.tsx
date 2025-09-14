// src/component/AppShell.tsx
import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { Home, LogOut, Store } from "lucide-react";
import { getTenantCode, logout, getUser, refreshAccessIfNeeded, authHeaders } from "@/lib/auth";


export default function AppShell({ children }: { children: React.ReactNode }) {
  useTokenKeepAlive();

  const user = getUser();
  const tenantCode = getTenantCode();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-slate-950/85 backdrop-blur border-b border-slate-800">
        <div className="h-12 px-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link to="/" className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-2 py-1 hover:bg-slate-700">
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
      <main>{children}</main>
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
  // function to merge caller headers with our auth/tenant headers
  const withAuth = (initIn?: RequestInit): RequestInit => {
    const caller = new Headers(initIn?.headers || {});
    const auth = authHeaders(); // adds Authorization + X-Tenant-* if present
    Object.entries(auth).forEach(([k, v]) => {
      if (!caller.has(k)) caller.set(k, String(v));
    });
    return { ...initIn, headers: caller };
  };

  // 1st try with current access token
  let res = await fetch(input, withAuth(init));

  // If unauthorized, try a single refresh → retry once
  if (res.status === 401 || res.status === 400) {
    // Some backends return 400 "Invalid token" from middleware; sniff text if needed
    let body = "";
    try { body = await res.clone().text(); } catch {}
    const looksInvalid = res.status === 401 || /invalid token/i.test(body);

    if (looksInvalid) {
      try {
        await refreshAccessIfNeeded();
        res = await fetch(input, withAuth(init)); // retry with fresh access
      } catch {
        // refresh failed → return the original 401/400 response to caller
      }
    }
  }

  return res;
}
