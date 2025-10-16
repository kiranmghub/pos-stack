// pos-frontend/src/features/admin/AdminPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { AdminAPI, Query, Register, TaxCategory, TaxRule, DiscountRule, Coupon } from "./adminApi";
import { DataTable } from "./components/DataTable";
import { Users, Store as StoreIcon, Settings2, Percent, BadgePercent, TicketPercent } from "lucide-react";
import { useToast } from "./components/ToastCompat";
import UsersTab from "./users/UsersTab";
import StoresTab from "./stores/StoresTab";

type TabKey = "users" | "stores" | "registers" | "taxcats" | "taxrules" | "discrules" | "coupons";

const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "users",      label: "Users",            icon: <Users className="h-4 w-4" /> },
  { key: "stores",     label: "Stores",           icon: <StoreIcon className="h-4 w-4" /> },
  { key: "registers",  label: "Registers",        icon: <Settings2 className="h-4 w-4" /> },
  { key: "taxcats",    label: "Tax Categories",   icon: <Percent className="h-4 w-4" /> },
  { key: "taxrules",   label: "Tax Rules",        icon: <Percent className="h-4 w-4" /> },
  { key: "discrules",  label: "Discount Rules",   icon: <BadgePercent className="h-4 w-4" /> },
  { key: "coupons",    label: "Coupons",          icon: <TicketPercent className="h-4 w-4" /> },
];

export default function AdminPage() {
  const [active, setActive] = useState<TabKey>("users");

  // Shared query state for non-Users/Stores tabs
  const [query, setQuery] = useState<Query>({ search: "", ordering: "" });

  // Table state for non-Users/Stores tabs
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState<number | undefined>(undefined);

  const { push } = useToast();

  // Fetch ONLY for tabs that are NOT handled by their own components
  useEffect(() => {
    if (active === "users" || active === "stores") return;

    let mounted = true;
    (async () => {
      setData([]); setTotal(undefined);
      setLoading(true);
      try {
        const q = { search: query.search || undefined, ordering: query.ordering || undefined };
        let page: any;
        if (active === "registers")      page = await AdminAPI.registers(q);
        else if (active === "taxcats")   page = await AdminAPI.taxCats(q);
        else if (active === "taxrules")  page = await AdminAPI.taxRules(q);
        else if (active === "discrules") page = await AdminAPI.discRules(q);
        else                             page = await AdminAPI.coupons(q);

        const rows = Array.isArray(page) ? page : (page.results ?? []);
        const cnt  = Array.isArray(page) ? undefined : page.count;
        if (mounted) { setData(rows); setTotal(cnt); }
      } catch (e) {
        console.error(e);
        push({ kind: "error", msg: "Failed to load data" });
        if (mounted) { setData([]); setTotal(undefined); }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [active, query, push]);

  // Columns for non-Users/Stores tabs
  const cols = useMemo(() => {
    switch (active) {
      case "registers":
        return [
          { key: "code", header: "Code" },
          { key: "store", header: "Store ID", align: "right" as const },
          {
            key: "is_active",
            header: "Active",
            render: (r: Register) => (
              <span className={`px-2 py-0.5 rounded-full text-xs ${r.is_active ? "bg-emerald-600/30 text-emerald-200" : "bg-slate-600/30 text-slate-300"}`}>
                {r.is_active ? "Yes" : "No"}
              </span>
            ),
          },
        ];
      case "taxcats":
        return [
          { key: "code", header: "Code" },
          { key: "name", header: "Name" },
          { key: "rate", header: "Rate", align: "right" as const, render: (r: TaxCategory) => `${Number(r.rate).toFixed(4)}` },
        ];
      case "taxrules":
        return [
          { key: "code", header: "Code" },
          { key: "name", header: "Name" },
          { key: "basis", header: "Basis" },
          { key: "apply_scope", header: "Scope" },
          { key: "rate", header: "Rate", align: "right" as const, render: (r: TaxRule) => r.rate ?? "-" },
          { key: "amount", header: "Amount", align: "right" as const, render: (r: TaxRule) => r.amount ?? "-" },
          { key: "priority", header: "Prio", align: "right" as const },
          {
            key: "is_active",
            header: "Active",
            render: (r: TaxRule) => (
              <span className={`px-2 py-0.5 rounded-full text-xs ${r.is_active ? "bg-emerald-600/30 text-emerald-200" : "bg-slate-600/30 text-slate-300"}`}>
                {r.is_active ? "Yes" : "No"}
              </span>
            ),
          },
        ];
      case "discrules":
        return [
          { key: "code", header: "Code" },
          { key: "name", header: "Name" },
          { key: "target", header: "Target" },
          { key: "basis", header: "Basis" },
          { key: "apply_scope", header: "Scope" },
          { key: "rate", header: "Rate", align: "right" as const, render: (r: DiscountRule) => r.rate ?? "-" },
          { key: "amount", header: "Amount", align: "right" as const, render: (r: DiscountRule) => r.amount ?? "-" },
          { key: "priority", header: "Prio", align: "right" as const },
          {
            key: "is_active",
            header: "Active",
            render: (r: DiscountRule) => (
              <span className={`px-2 py-0.5 rounded-full text-xs ${r.is_active ? "bg-emerald-600/30 text-emerald-200" : "bg-slate-600/30 text-slate-300"}`}>
                {r.is_active ? "Yes" : "No"}
              </span>
            ),
          },
        ];
      case "coupons":
        return [
          { key: "code", header: "Code" },
          { key: "name", header: "Name" },
          { key: "rule", header: "Rule", render: (c: Coupon) => `${c.rule?.name} (${c.rule?.code})` },
          { key: "remaining_uses", header: "Left", align: "right" as const, render: (c: Coupon) => c.remaining_uses ?? "∞" },
          {
            key: "is_active",
            header: "Active",
            render: (c: Coupon) => (
              <span className={`px-2 py-0.5 rounded-full text-xs ${c.is_active ? "bg-emerald-600/30 text-emerald-200" : "bg-slate-600/30 text-slate-300"}`}>
                {c.is_active ? "Yes" : "No"}
              </span>
            ),
          },
        ];
      default:
        return [];
    }
  }, [active]);

  return (
    <div className="p-4 space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-2">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm
              ${active === t.key ? "bg-slate-800 border-slate-700 text-white" : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800/50"}`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {active === "users" && <UsersTab />}
      {active === "stores" && <StoresTab />}

      {active !== "users" && active !== "stores" && (
        <DataTable
          title={tabs.find(t => t.key === active)?.label || ""}
          rows={data}
          cols={cols as any}
          loading={loading}
          total={total}
          query={query}
          onQueryChange={(q) => setQuery(prev => ({ ...prev, ...q }))}
        />
      )}
    </div>
  );
}
