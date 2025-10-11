// src/features/admin/AdminRoute.tsx
import AdminPage from "./AdminPage";
import React from "react";
import AppShell from "@/components/AppShell";

export default function AdminRoute() {
  return (
    <AppShell title="Admin Screen" contained>
      <AdminPage/>
    </AppShell>
  );
}
