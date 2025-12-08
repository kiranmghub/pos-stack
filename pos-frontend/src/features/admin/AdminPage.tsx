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
import { Users, Store as StoreIcon, Settings2, Percent, BadgePercent, TicketPercent, Settings, Sparkles } from "lucide-react";
import { SimpleTabs } from "@/components/ui/tabs";
import { PageHeading } from "@/components/AppShell";
import type { Store } from "./adminApi";
import StoreModal from "./stores/StoreModal";

type TabKey =
  | "users"
  | "stores"
  | "registers"
  | "taxcats"
  | "taxrules"
  | "discrules"
  | "coupons"
  | "settings";

const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "users",     label: "Users",            icon: <Users className="h-4 w-4" /> },
  { key: "stores",    label: "Stores",           icon: <StoreIcon className="h-4 w-4" /> },
  { key: "registers", label: "Registers",        icon: <Settings2 className="h-4 w-4" /> },
  { key: "taxcats",   label: "Tax Categories",   icon: <Percent className="h-4 w-4" /> },
  { key: "taxrules",  label: "Tax Rules",        icon: <Percent className="h-4 w-4" /> },
  { key: "discrules", label: "Discount Rules",   icon: <BadgePercent className="h-4 w-4" /> },
  { key: "coupons",   label: "Coupons",          icon: <TicketPercent className="h-4 w-4" /> },
  { key: "settings",  label: "Settings",         icon: <Settings className="h-4 w-4" /> },
];

// ---- Code-splitting (lazy load each tab) ----
const UsersTab       = lazy(() => import("./users/UsersTab"));
const StoresTab      = lazy(() => import("./stores/StoresTab"));
const RegistersTab   = lazy(() => import("./registers/RegistersTab"));
const TaxCategoriesTab = lazy(() => import("./taxcats/TaxCategoriesTab"));
const TaxRulesTab    = lazy(() => import("./taxrules/TaxRulesTab"));
const DiscountRulesTab = lazy(() => import("./discounts/DiscountRulesTab"));
const CouponsTab     = lazy(() => import("./coupons/CouponsTab"));
const SettingsTab    = lazy(() => import("./settings/SettingsTab"));

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

  // StoreModal state management (centralized for toolbar access)
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [storeModalEditing, setStoreModalEditing] = useState<Store | null>(null);
  const [forceSetupWizard, setForceSetupWizard] = useState(false);
  const [storesRefreshKey, setStoresRefreshKey] = useState(0);

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

  // Handler to open store modal (used by toolbar and StoresTab)
  const handleOpenStoreModal = (editing?: Store | null, forceWizard = false) => {
    setStoreModalEditing(editing || null);
    setForceSetupWizard(forceWizard);
    setStoreModalOpen(true);
  };

  // Handler to close store modal
  const handleCloseStoreModal = () => {
    setStoreModalOpen(false);
    setStoreModalEditing(null);
    setForceSetupWizard(false);
  };

  // Handler when store is saved (refresh stores list)
  const handleStoreSaved = () => {
    setStoresRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="min-h-[calc(100vh-3rem)] bg-background">
      <div className="bg-background">
        <PageHeading
          title="Tenant Administration"
          subtitle="Manage users, stores, registers, tax rules, and discounts"
          actions={
            <button
              onClick={() => handleOpenStoreModal(null, true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary text-sm font-medium transition-colors"
              title="Guided Setup: Create store with guided setup wizard"
            >
              <Sparkles className="h-4 w-4" />
              Guided Setup
            </button>
          }
        />
      </div>

      {/* Tabs */}
      <div className="px-4 pt-3">
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
      </div>

      {/* Content (lazy) */}
      <div className="p-4">

        <Suspense
          fallback={
            <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
              Loading…
            </div>
          }
        >
          {active === "users" && <UsersTab />}
          {active === "stores" && <StoresTab onOpenStoreModal={handleOpenStoreModal} refreshKey={storesRefreshKey} />}
          {active === "registers" && <RegistersTab />}
          {active === "taxcats" && <TaxCategoriesTab />}
          {active === "taxrules" && <TaxRulesTab />}
          {active === "discrules" && <DiscountRulesTab />}
          {active === "coupons" && <CouponsTab />}
          {active === "settings" && <SettingsTab />}
        </Suspense>
      </div>

      {/* StoreModal (centralized at AdminPage level) */}
      <StoreModal
        open={storeModalOpen}
        editing={storeModalEditing}
        forceSetupWizard={forceSetupWizard}
        onClose={handleCloseStoreModal}
        onSaved={handleStoreSaved}
      />
    </div>
  );
}
