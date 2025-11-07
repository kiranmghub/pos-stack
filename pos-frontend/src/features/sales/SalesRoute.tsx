// src/features/sales/SalesRoute.tsx
import React from "react";
import AppShell from "@/components/AppShell";
import { Route, Routes, Navigate } from "react-router-dom";
import SalesPage from "./SalesPage";

export default function SalesRoute() {
  return (
    <AppShell title="Catalog" contained>
      <SalesPage />
    </AppShell>
  );
}