// src/features/admin/AdminRoute.tsx
import AdminScreen from "./AdminScreen";
import React from "react";
import AppShell from "@/components/AppShell";

export default function AdminRoute() {
  return (
    <AppShell title="Admin Screen" contained>
      <AdminScreen />
    </AppShell>
  );
}
