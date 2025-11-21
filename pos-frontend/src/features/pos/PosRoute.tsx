// pos-frontend/src/features/pos/PosRoute.tsx
import React from "react";
import AppShell from "@/components/AppShell";
import PosScreen from "./PosScreen";

export default function PosRoute() {
  // If PosScreen already knows current store/tenant, you can thread those up via context or props.
  // For now, just show a title; you can enhance later.
  return (
    <AppShell title="Point of Sale" contained>
      <PosScreen />
    </AppShell>
  );
}
