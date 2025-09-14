// src/features/catalog/CatalogRoute.tsx
import React from "react";
import AppShell from "@/components/AppShell";
import CatalogPage from "./CatalogPage";
// If you have helpers: import { getUsername, getTenantCode } from "@/lib/auth";

export default function CatalogRoute() {
  // Example: you can pass username/tenant/store here.
  // const username = getUsername?.() || null;
  // const tenantCode = getTenantCode?.() || null;

  return (
    <AppShell
      title="Catalog"
      // username={username}
      // tenantCode={tenantCode}
      // storeName={null} // not crucial on catalog
      contained
    >
      <CatalogPage />
    </AppShell>
  );
}
