// pos-frontend/src/features/admin/AdminRoute.tsx
import AdminPage from "./AdminPage";
import React from "react";
import AppShell from "@/components/AppShell";

import { ToastProvider } from "./components/Toast";

export default function AdminRoute() {
  return (
    <AppShell title="Admin Screen" contained>
      <ToastProvider>
        <AdminPage />
      </ToastProvider>
    </AppShell>
  );
}

