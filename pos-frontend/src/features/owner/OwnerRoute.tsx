// src/features/owner/OwnerRoute.tsx
import React from "react";
import AppShell from "@/components/AppShell";
import OwnerDashboard from "./OwnerDashboard";

export default function OwnerRoute() {
  return (
    <AppShell title="Owner Dashboard" contained>
      <OwnerDashboard />
    </AppShell>
  );
}
