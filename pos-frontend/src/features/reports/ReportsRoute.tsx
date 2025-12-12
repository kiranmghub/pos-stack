// pos-frontend/src/features/reports/ReportsRoute.tsx
import React from "react";
import AppShell from "@/components/AppShell";
import ReportsPage from "./ReportsPage";

export default function ReportsRoute() {
  return (
    <AppShell title="Reports" contained>
      <ReportsPage />
    </AppShell>
  );
}

