// src/features/home/HomePage.tsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { getRole, getUser, getTenantCode } from "@/lib/auth";
import { fetchOnboardingState } from "@/features/onboarding/api";
import {
  ShoppingCart,
  Package,
  LayoutDashboard,
  ChevronRight,
  ShieldCheck,
  Boxes,
  Building2,
  TrendingUp,
  Flag,
  Clock,
  FileText,
  BarChart3,
} from "lucide-react";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

function Card({
  to,
  icon,
  title,
  desc,
  accent = "from-indigo-500 to-violet-500",
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  accent?: string;
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  return (
    <Link
      to={to}
      className={cn(
        "group relative overflow-hidden rounded-2xl border transition-all",
        isDark
          ? "border-border bg-white/[0.06] hover:bg-white/[0.12]"
          : "border-border bg-card shadow-[0_20px_60px_rgba(15,23,42,0.08)] hover:shadow-[0_30px_70px_rgba(15,23,42,0.12)]"
      )}
    >
      <div
        className={cn(
          "absolute inset-x-4 top-0 h-1 rounded-full bg-gradient-to-r",
          accent,
          isDark ? "opacity-70" : "opacity-90"
        )}
      />
      <div className="relative p-5 flex items-start gap-4">
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-inner shadow-black/20 ring-1 ring-black/10 bg-gradient-to-br",
            accent
          )}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-base font-semibold text-foreground">{title}</h3>
            <ChevronRight
              className={cn(
                "h-4 w-4 transition-all duration-200",
                isDark ? "text-muted-foreground" : "text-muted-foreground",
                "opacity-0 group-hover:opacity-100 translate-x-1"
              )}
            />
          </div>
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{desc}</p>
        </div>
      </div>
    </Link>
  );
}

export default function HomePage() {
  const role = (getRole() || "").toLowerCase(); // "owner", "cashier", etc.
  const user = getUser();
  const name =
    user?.username || user?.email?.split("@")[0] || "User";

  const tenantCode = getTenantCode() || "";

  const canSeePOS = role === "owner" || role === "cashier" || role === "manager";
  const canSeeCatalog = role === "owner" || role === "manager";
  const canSeeInventory = role === "owner" || role === "manager";
  const canSeeOwnerDash = role === "owner";
  const canSeeTenantAdmin = role === "owner"; // only owners see this
  const canSeeSales = role === "owner" || role === "manager";
  const canSeeAnalytics = role === "owner";
  const canSeeDocuments = role === "owner" || role === "admin";
  const canSeeReports = role === "owner" || role === "admin";

  const [onboardingStatus, setOnboardingStatus] = useState<string | null>(null);
  useEffect(() => {
    fetchOnboardingState().then((res) => setOnboardingStatus(res?.status || null)).catch(() => {});
  }, []);

  // Live date and time state
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000); // Update every second

    return () => clearInterval(interval); // Cleanup on unmount
  }, []);

  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <AppShell title="Home">
      <div className="px-4 py-6 transition-colors min-h-[calc(100vh-3rem)] bg-background">
        {/* Greeting */}
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex-1">
            <div className="text-sm text-muted-foreground">Welcome back</div>
            <div className="mt-0.5 text-2xl font-semibold text-foreground">
              {name}
            </div>
            {tenantCode ? (
              <div
                className={cn(
                  "mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs border",
                  isDark ? "bg-muted/20 text-muted-foreground border-border/70" : "bg-muted text-muted-foreground border-border"
                )}
              >
                <ShieldCheck className="h-3.5 w-3.5 text-success" />
                Tenant <span className="font-semibold text-foreground">{tenantCode}</span>
              </div>
            ) : null}
            {onboardingStatus && onboardingStatus !== "live" ? (
              <div
                className={cn(
                  "mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs border",
                  "bg-badge-warning-bg text-badge-warning-text border-warning/30"
                )}
              >
                <Flag className="h-3.5 w-3.5" />
                Onboarding: {onboardingStatus.replace("_", " ")}
                <Link
                  to="/onboarding"
                  className={cn(
                    "underline ml-2",
                    isDark ? "text-warning hover:text-foreground" : "text-warning hover:text-warning/80"
                  )}
                >
                  Continue
                </Link>
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-3 md:items-end w-full md:w-auto">
            <div
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em]",
                isDark ? "bg-muted text-white" : "bg-muted text-muted-foreground"
              )}
            >
              <Clock className="h-3 w-3" />
              {currentTime.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
              <span className="text-muted-foreground">•</span>
              {currentTime.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div className="flex flex-wrap gap-3 justify-start md:justify-end">
              {[
                { label: "Gross Sales (Today)", value: "$18,420", change: "+8.3%" },
                { label: "Transactions (Today)", value: "612", change: "-2.1%" },
                { label: "Avg. Ticket (Today)", value: "$30.10", change: "+3.0%" },
              ].map((metric) => (
                <div
                  key={metric.label}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-sm min-w-[160px]",
                    isDark ? "border-white/15 bg-card" : "border-border bg-card shadow-sm"
                  )}
                >
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{metric.label}</div>
                  <div className="text-lg font-semibold text-foreground">{metric.value}</div>
                  <div className="text-xs font-semibold text-success">{metric.change}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Cards grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {canSeePOS && (
            <Card
              to="/pos"
              title="Point of Sale"
              desc="Scan, charge, and print beautiful receipts with real-time stock updates."
              icon={<ShoppingCart className="h-6 w-6" />}
              accent="from-emerald-500 to-teal-500"
            />
          )}

          {canSeeCatalog && (
            <Card
              to="/catalog"
              title="Catalog"
              desc="Create and manage products, prices, tax categories, and images."
              icon={<Package className="h-6 w-6" />}
              accent="from-indigo-500 to-sky-500"
            />
          )}

          {canSeeOwnerDash && (
            <Card
              to="/owner"
              title="Owner Dashboard"
              desc="Overview, health, and controls for your stores and teams."
              icon={<LayoutDashboard className="h-6 w-6" />}
              accent="from-violet-500 to-fuchsia-500"
            />
          )}

          {canSeeInventory && (
            <Card
              to="/inventory"
              title="Inventory"
              desc="Count stock, post adjustments, review ledger, and monitor low-stock items."
              icon={<Boxes className="h-6 w-6" />}
              accent="from-amber-500 to-orange-500"
            />
          )}

        {canSeeTenantAdmin && (
            <Card
              to="/tenant_admin"
              title="Tenant Administration"
              desc="Manage users, stores, registers, and high-level tenant settings."
              icon={<Building2 className="h-6 w-6" />}
              accent="from-pink-500 to-rose-500"
            />
        )}

        {canSeeSales && (
            <Card
              to="/sales"
              title="Sales"
              desc="View reports, analyze trends, and track revenue across all stores."
              icon={<TrendingUp className="h-6 w-6" />}
              accent="from-cyan-500 to-blue-500"
            />
          )}

        {canSeeAnalytics && (
            <Card
              to="/analytics/metrics"
              title="Analytics / Metrics"
              desc="Monitor signups, OTPs, subscriptions, and email health."
              icon={<LayoutDashboard className="h-6 w-6" />}
              accent="from-lime-500 to-emerald-500"
            />
          )}

        {canSeeDocuments && (
            <Card
              to="/documents"
              title="Documents"
              desc="Manage tenant documents, invoices, receipts, and file attachments."
              icon={<FileText className="h-6 w-6" />}
              accent="from-blue-500 to-indigo-500"
            />
          )}

        {canSeeReports && (
            <Card
              to="/reports"
              title="Reports"
              desc="Comprehensive business analytics and insights for sales, products, finances, customers, and more."
              icon={<BarChart3 className="h-6 w-6" />}
              accent="from-purple-500 to-pink-500"
            />
          )}

        </div>

        {/* (Optional) Quick tips / footer */}
        <div
          className={cn(
            "mt-8 rounded-2xl border p-4 text-sm",
            isDark ? "border-border bg-card text-muted-foreground" : "border-border bg-card text-muted-foreground shadow-sm"
          )}
        >
          Pro tip: you can switch stores on the POS screen; your stock badges
          update instantly after each sale.
        </div>
      </div>
    </AppShell>
  );
}
