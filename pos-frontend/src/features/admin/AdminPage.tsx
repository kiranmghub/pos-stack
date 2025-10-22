// pos-frontend/src/features/admin/AdminPage.tsx
import React, { useState } from "react";
import { Users, Store as StoreIcon, Settings2, Percent, BadgePercent, TicketPercent } from "lucide-react";

import UsersTab from "./users/UsersTab";
import StoresTab from "./stores/StoresTab";
import RegistersTab from "./registers/RegistersTab";
import TaxCategoriesTab from "./taxcats/TaxCategoriesTab";
import TaxRulesTab from "./taxrules/TaxRulesTab";
import DiscountRulesTab from "./discounts/DiscountRulesTab";
import CouponsTab from "./coupons/CouponsTab";

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

  return (
    <div className="p-4 space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-2">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm
              ${active === t.key
                ? "bg-slate-800 border-slate-700 text-white"
                : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800/50"}`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {active === "users" && <UsersTab />}
      {active === "stores" && <StoresTab />}
      {active === "registers" && <RegistersTab />}
      {active === "taxcats" && <TaxCategoriesTab />}
      {active === "taxrules" && <TaxRulesTab />}
      {active === "discrules" && <DiscountRulesTab />}
      {active === "coupons" && <CouponsTab />}
    </div>
  );
}
