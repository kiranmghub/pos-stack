// pos-frontend/src/features/admin/AdminPage.tsx
// import React, { useState } from "react";
// import { Users, Store as StoreIcon, Settings2, Percent, BadgePercent, TicketPercent } from "lucide-react";

// import UsersTab from "./users/UsersTab";
// import StoresTab from "./stores/StoresTab";
// import RegistersTab from "./registers/RegistersTab";
// import TaxCategoriesTab from "./taxcats/TaxCategoriesTab";
// import TaxRulesTab from "./taxrules/TaxRulesTab";
// import DiscountRulesTab from "./discounts/DiscountRulesTab";
// import CouponsTab from "./coupons/CouponsTab";

// type TabKey = "users" | "stores" | "registers" | "taxcats" | "taxrules" | "discrules" | "coupons";

// const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
//   { key: "users",      label: "Users",            icon: <Users className="h-4 w-4" /> },
//   { key: "stores",     label: "Stores",           icon: <StoreIcon className="h-4 w-4" /> },
//   { key: "registers",  label: "Registers",        icon: <Settings2 className="h-4 w-4" /> },
//   { key: "taxcats",    label: "Tax Categories",   icon: <Percent className="h-4 w-4" /> },
//   { key: "taxrules",   label: "Tax Rules",        icon: <Percent className="h-4 w-4" /> },
//   { key: "discrules",  label: "Discount Rules",   icon: <BadgePercent className="h-4 w-4" /> },
//   { key: "coupons",    label: "Coupons",          icon: <TicketPercent className="h-4 w-4" /> },
// ];

// export default function AdminPage() {
//   const [active, setActive] = useState<TabKey>("users");

//   return (
//     <div className="p-4 space-y-4">
//       {/* Tabs */}
//       <div className="flex items-center gap-2">
//         {tabs.map(t => (
//           <button
//             key={t.key}
//             onClick={() => setActive(t.key)}
//             className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm
//               ${active === t.key
//                 ? "bg-muted border-border text-white"
//                 : "bg-card border-border text-muted-foreground hover:bg-muted/50"}`}
//           >
//             {t.icon} {t.label}
//           </button>
//         ))}
//       </div>

//       {/* Content */}
//       {active === "users" && <UsersTab />}
//       {active === "stores" && <StoresTab />}
//       {active === "registers" && <RegistersTab />}
//       {active === "taxcats" && <TaxCategoriesTab />}
//       {active === "taxrules" && <TaxRulesTab />}
//       {active === "discrules" && <DiscountRulesTab />}
//       {active === "coupons" && <CouponsTab />}
//     </div>
//   );
// }


// pos-frontend/src/features/admin/AdminPage.tsx
import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Users, Store as StoreIcon, Settings2, Percent, BadgePercent, TicketPercent } from "lucide-react";
import { SimpleTabs } from "@/components/ui/tabs";

type TabKey =
  | "users"
  | "stores"
  | "registers"
  | "taxcats"
  | "taxrules"
  | "discrules"
  | "coupons";

const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "users",     label: "Users",            icon: <Users className="h-4 w-4" /> },
  { key: "stores",    label: "Stores",           icon: <StoreIcon className="h-4 w-4" /> },
  { key: "registers", label: "Registers",        icon: <Settings2 className="h-4 w-4" /> },
  { key: "taxcats",   label: "Tax Categories",   icon: <Percent className="h-4 w-4" /> },
  { key: "taxrules",  label: "Tax Rules",        icon: <Percent className="h-4 w-4" /> },
  { key: "discrules", label: "Discount Rules",   icon: <BadgePercent className="h-4 w-4" /> },
  { key: "coupons",   label: "Coupons",          icon: <TicketPercent className="h-4 w-4" /> },
];

// ---- Code-splitting (lazy load each tab) ----
const UsersTab       = lazy(() => import("./users/UsersTab"));
const StoresTab      = lazy(() => import("./stores/StoresTab"));
const RegistersTab   = lazy(() => import("./registers/RegistersTab"));
const TaxCategoriesTab = lazy(() => import("./taxcats/TaxCategoriesTab"));
const TaxRulesTab    = lazy(() => import("./taxrules/TaxRulesTab"));
const DiscountRulesTab = lazy(() => import("./discounts/DiscountRulesTab"));
const CouponsTab     = lazy(() => import("./coupons/CouponsTab"));

// ---- helpers for URL/localStorage persistence ----
const TAB_PARAM = "tab";
const LS_KEY = "admin.activeTab";

function isValidTab(k: string | null | undefined): k is TabKey {
  return !!k && tabs.some(t => t.key === k);
}

function readInitialTab(): TabKey {
  const url = new URL(window.location.href);
  const param = url.searchParams.get(TAB_PARAM);
  if (isValidTab(param)) return param;

  const stored = localStorage.getItem(LS_KEY);
  if (isValidTab(stored || undefined)) return stored as TabKey;

  return "users";
}

export default function AdminPage() {
  const [active, setActive] = useState<TabKey>(readInitialTab);

  // persist to URL + localStorage when active changes
  useEffect(() => {
    // localStorage
    localStorage.setItem(LS_KEY, active);
    // URL (keep other params intact)
    const url = new URL(window.location.href);
    url.searchParams.set(TAB_PARAM, active);
    // pushState (no reload / keep scroll)
    window.history.replaceState({}, "", url.toString());
  }, [active]);

  return (
    <div className="p-4 space-y-4">
      {/* Tabs */}
      <SimpleTabs
        variant="default"
        value={active}
        onValueChange={(value) => setActive(value as TabKey)}
        tabs={tabs.map(t => ({
          value: t.key,
          label: t.label,
          icon: t.icon,
        }))}
      />

      {/* Content (lazy) */}
      <Suspense
        fallback={
          <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            Loading…
          </div>
        }
      >
        {active === "users" && <UsersTab />}
        {active === "stores" && <StoresTab />}
        {active === "registers" && <RegistersTab />}
        {active === "taxcats" && <TaxCategoriesTab />}
        {active === "taxrules" && <TaxRulesTab />}
        {active === "discrules" && <DiscountRulesTab />}
        {active === "coupons" && <CouponsTab />}
      </Suspense>
    </div>
  );
}
