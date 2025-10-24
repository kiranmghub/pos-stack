import React from "react";
import AppShell from "@/components/AppShell";
import { Route, Routes, Navigate } from "react-router-dom";
import CatalogPage from "./CatalogPage";

export default function CatalogRoute() {
  return (
    // <Routes>
    //   <Route path="/" element={<CatalogPage />} />
    //   <Route path="*" element={<Navigate to="." replace />} />
    // </Routes>
    <AppShell title="Catalog" contained>
      <CatalogPage />
    </AppShell>
  );
}
