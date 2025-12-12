// pos-frontend/src/features/documents/DocumentsRoute.tsx
import React from "react";
import AppShell from "@/components/AppShell";
import DocumentsPage from "./DocumentsPage";

export default function DocumentsRoute() {
  return (
    <AppShell title="Documents" contained>
      <DocumentsPage />
    </AppShell>
  );
}

