// pos-frontend/src/components/AppShell.tsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Home, LogOut, Store, Moon, Sun, User, Settings, ChevronDown } from "lucide-react";
import { getTenantCode, logout, getUser, refreshAccessIfNeeded, authHeaders, apiFetchJSON } from "@/lib/auth";
import { Toaster } from "@/ui/toast"; // global toast container
import { ToastBridgeProvider } from "@/lib/notify";
import { useTheme } from "@/lib/theme";
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuHeader } from "@/components/ui/dropdown-menu";


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
// Helper function to get tenant initials
function getTenantInitials(code: string | null): string {
  if (!code) return "T";
  const parts = code.split("-");
  if (parts.length > 1) {
    return parts
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join("");
  }
  return code.substring(0, 2).toUpperCase();
}

// Helper function to get user initials
function getUserInitials(name: string, email?: string): string {
  if (name && name.includes(" ")) {
    const parts = name.split(" ");
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }
  if (name) {
    return name.substring(0, 2).toUpperCase();
  }
  if (email) {
    return email.substring(0, 2).toUpperCase();
  }
  return "U";
}

export default function AppShell({ children, title, contained, actions, subtitle }: AppShellProps) {
  useTokenKeepAlive();

  const user = getUser();
  const tenantCode = getTenantCode();
  const displayName = user?.username || user?.email || "User";
  const userEmail = user?.email || "";
  const userRole = user?.role || null;
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const [tenantLogo, setTenantLogo] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);

  // Fetch tenant info including logo_url and name from API
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Try to fetch tenant details (only works for owners/admins)
        // Silently fail if user doesn't have permission
        const data = await apiFetchJSON<{ name?: string; logo_file_url?: string; logo_url?: string }>("/api/v1/tenant_admin/tenant/");
        if (!alive) return;
        setTenantName(data.name || null);
        // Prefer logo_file_url over logo_url
        const logoUrl = data.logo_file_url || data.logo_url || null;
        setTenantLogo(logoUrl);
      } catch (err) {
        // Silently fail - fallback to initials
        // This is expected for non-owner/admin users
        if (!alive) return;
      }
    })();
    return () => {
      alive = false;
    };
  }, [tenantCode]);

  // Listen for logo upload events to refresh the logo
  useEffect(() => {
    const handleLogoUpload = () => {
      // Refresh tenant data when logo is uploaded
      (async () => {
        try {
          const data = await apiFetchJSON<{ name?: string; logo_file_url?: string; logo_url?: string }>("/api/v1/tenant_admin/tenant/");
          setTenantName(data.name || null);
          const logoUrl = data.logo_file_url || data.logo_url || null;
          setTenantLogo(logoUrl);
        } catch (err) {
          // Silently fail
        }
      })();
    };

    window.addEventListener("tenant:logo:uploaded", handleLogoUpload);
    return () => {
      window.removeEventListener("tenant:logo:uploaded", handleLogoUpload);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-surface-panel/95 backdrop-blur-sm shadow-sm">
        <div className="h-16 px-6 flex items-center justify-between gap-4">
          {/* Left: Logo and Home */}
          {/* <div className="flex items-center gap-3">
            <Link
              to="/home"
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              {tenantLogo ? (
                <img
                  src={tenantLogo}
                  alt={tenantName || tenantCode || "Tenant"}
                  className="h-10 w-10 rounded-lg object-contain border border-border/20"
                  onError={(e) => {
                    console.error("Failed to load tenant logo:", tenantLogo);
                    setTenantLogo(null);
                  }}
                />
              ) : (
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-semibold text-primary">
                    {getTenantInitials(tenantCode)}
                  </span>
                </div>
              )}
            </Link>
            <Link
              to="/home"
              className="inline-flex items-center gap-2 rounded-lg bg-secondary/50 px-3 py-1.5 text-sm text-secondary-foreground transition-colors hover:bg-secondary/80"
            >
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline font-medium">Home</span>
            </Link>
          </div> */}
          {/* Left: Logo and Home */}
{/* Left: Logo and Home */}
<div className="flex items-center gap-4">
            <Link
              to="/home"
              className="flex items-center gap-3 group"
            >
              {tenantLogo ? (
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <img
                    src={tenantLogo}
                    alt={tenantName || tenantCode || "Tenant"}
                    className="relative h-16 w-32 rounded-xl object-contain border-2 border-border/30 bg-card shadow-lg group-hover:shadow-xl group-hover:scale-105 transition-all duration-300 p-2"
                    onError={(e) => {
                      console.error("Failed to load tenant logo:", tenantLogo);
                      setTenantLogo(null);
                    }}
                  />
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="relative h-16 w-32 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center border-2 border-primary/20 shadow-lg group-hover:shadow-xl group-hover:scale-105 transition-all duration-300">
                    <span className="text-xl font-bold text-primary">
                      {getTenantInitials(tenantCode)}
                    </span>
                  </div>
                </div>
              )}
              {tenantName && (
                <div className="hidden lg:flex flex-col">
                  <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                    {tenantName}
                  </span>
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">
                    {tenantCode}
                  </span>
                </div>
              )}
            </Link>
            <Link
              to="/home"
              className="inline-flex items-center gap-2 rounded-lg bg-secondary/50 px-3 py-1.5 text-sm text-secondary-foreground transition-colors hover:bg-secondary/80"
            >
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline font-medium">Home</span>
            </Link>
          </div>

          {/* Center: Tenant → Store (store shown by each page) */}
          {/* <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground flex-1 justify-center">
            <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5">
              <Store className="h-4 w-4 text-muted-foreground" />
              <span className="uppercase tracking-wider font-semibold text-foreground">{tenantCode || "—"}</span>
              <span className="text-muted-foreground">→</span>
              <span id="appshell-store-name" className="font-medium truncate text-foreground max-w-[240px]"> */}
                {/* pages can update this span's textContent if they manage store selection */}
              {/* </span>
            </div>
          </div> */}

          {/* Right: User menu and actions */}
          <div className="flex items-center gap-3">
            <span className="hidden md:inline text-sm font-medium text-foreground">{displayName}</span>
            
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span className="hidden sm:inline">{isDark ? "Light" : "Dark"}</span>
            </button>

            {/* User Menu Dropdown */}
            <DropdownMenu
              align="right"
              trigger={
                <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 hover:bg-muted/50 transition-colors cursor-pointer">
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-xs font-semibold text-primary">
                      {getUserInitials(displayName, userEmail)}
                    </span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </div>
              }
            >
              <DropdownMenuHeader className="py-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-semibold text-primary">
                      {getUserInitials(displayName, userEmail)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-foreground truncate">{displayName}</div>
                    <div className="text-xs text-muted-foreground truncate">{userEmail}</div>
                    {userRole && (
                      <div className="mt-1">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary capitalize">
                          {userRole}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </DropdownMenuHeader>
              
              <DropdownMenuSeparator />
              
              <DropdownMenuItem onClick={() => {}}>
                <User className="h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              
              <DropdownMenuItem onClick={() => {}}>
                <Settings className="h-4 w-4" />
                <span>Preferences</span>
              </DropdownMenuItem>
              
              <DropdownMenuSeparator />
              
              <DropdownMenuItem onClick={logout} variant="destructive">
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </DropdownMenuItem>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Page body */}
      <main className="bg-background min-h-[calc(100vh-4rem)]">
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
    <div className="w-full px-4 py-4 flex items-center justify-between">
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {subtitle ? <div className="text-sm text-muted-foreground">{subtitle}</div> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
