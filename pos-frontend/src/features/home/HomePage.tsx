// src/features/home/HomePage.tsx
import React from "react";
import { Link } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { getRole, getUser, getTenantCode } from "@/lib/auth";
import {
  ShoppingCart,
  Package,
  LayoutDashboard,
  ChevronRight,
  ShieldCheck,
  Boxes,
  Building2,
} from "lucide-react";

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
  return (
    <Link
      to={to}
      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.05] transition-colors"
    >
      <div className={`pointer-events-none absolute inset-x-0 -top-24 h-48 bg-gradient-to-b ${accent} opacity-20 blur-2xl`} />
      <div className="relative p-5 flex items-start gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-white/5 ring-1 ring-white/10">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-slate-100">{title}</h3>
            <ChevronRight className="h-4 w-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <p className="mt-1 text-sm text-slate-300/80">{desc}</p>
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


  return (
    <AppShell title="Home">
      <div className="px-4 py-6">
        {/* Greeting */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-slate-400">Welcome back</div>
            <div className="mt-0.5 text-2xl font-semibold text-slate-100">
              {name}
            </div>
            {tenantCode ? (
              <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300 ring-1 ring-white/10">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
                Tenant <span className="font-semibold text-slate-100">{tenantCode}</span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Cards grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {canSeePOS && (
            <Card
              to="/pos"
              title="Point of Sale"
              desc="Scan, charge, and print beautiful receipts with real-time stock updates."
              icon={<ShoppingCart className="h-6 w-6 text-emerald-300" />}
              accent="from-emerald-500 to-teal-500"
            />
          )}

          {canSeeCatalog && (
            <Card
              to="/catalog"
              title="Catalog"
              desc="Create and manage products, prices, tax categories, and images."
              icon={<Package className="h-6 w-6 text-indigo-300" />}
              accent="from-indigo-500 to-sky-500"
            />
          )}

          {canSeeOwnerDash && (
            <Card
              to="/owner"
              title="Owner Dashboard"
              desc="Overview, health, and controls for your stores and teams."
              icon={<LayoutDashboard className="h-6 w-6 text-violet-300" />}
              accent="from-violet-500 to-fuchsia-500"
            />
          )}

          {canSeeInventory && (
            <Card
              to="/inventory"
              title="Inventory"
              desc="Count stock, post adjustments, review ledger, and monitor low-stock items."
              icon={<Boxes className="h-6 w-6 text-amber-300" />}
              accent="from-amber-500 to-orange-500"
            />
          )}

        {canSeeTenantAdmin && (
            <Card
              to="/tenant_admin"
              title="Tenant Administration"
              desc="Manage users, stores, registers, and high-level tenant settings."
              icon={<Building2 className="h-6 w-6 text-pink-300" />}
              accent="from-pink-500 to-rose-500"
            />
        )}



        </div>

        {/* (Optional) Quick tips / footer */}
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
          Pro tip: you can switch stores on the POS screen; your stock badges
          update instantly after each sale.
        </div>
      </div>
    </AppShell>
  );
}
