// pos-frontend/src/components/AppShell.tsx
import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { Home, LogOut, Store, Moon, Sun } from "lucide-react";
import { getTenantCode, logout, getUser, refreshAccessIfNeeded, authHeaders } from "@/lib/auth";
import { Toaster } from "@/ui/toast"; // global toast container
import { ToastBridgeProvider } from "@/lib/notify";
import { useTheme } from "@/lib/theme";


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
  const displayName = user?.username || user?.email || "User";
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-surface-panel shadow">
        <div className="h-12 px-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link
              to="/home"
              className="inline-flex items-center gap-2 rounded-lg bg-secondary px-2 py-1 text-secondary-foreground transition-colors hover:bg-secondary/80"
            >
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline">Home</span>
            </Link>
          </div>

          {/* Center: Tenant → Store (store shown by each page) */}
          <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
            <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5">
              <Store className="h-4 w-4 text-muted-foreground" />
              <span className="uppercase tracking-wider font-semibold text-foreground">{tenantCode || "—"}</span>
              <span className="text-muted-foreground">→</span>
              <span id="appshell-store-name" className="font-medium truncate text-foreground max-w-[240px]">
                {/* pages can update this span's textContent if they manage store selection */}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{displayName}</span>
            <button
              onClick={toggleTheme}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted"
            >
              {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              {isDark ? "Light" : "Dark"}
            </button>
            <button
              onClick={logout}
              className="inline-flex items-center gap-1 rounded-lg bg-destructive px-2 py-1 text-destructive-foreground transition-colors hover:bg-destructive/90"
            >
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </div>
        </div>
      </header>

      {/* Page body */}
      <main className="bg-background min-h-[calc(100vh-3rem)]">
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
    <div className="border-b border-border px-4 py-4 flex items-center justify-between">
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {subtitle ? <div className="text-sm text-muted-foreground">{subtitle}</div> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
