// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";

import LoginPage from "@/features/auth/LoginPage";
import ProtectedRoute from "@/routes/ProtectedRoute";

import OwnerRoute from "@/features/owner/OwnerRoute";
import PosRoute from "@/features/pos/PosRoute";
import CatalogRoute from "@/features/catalog/CatalogRoute";
import AdminRoute from "@/features/admin/AdminRoute";


import "@/index.css";
import { getRole } from "@/lib/auth";

import InventoryRoute from "@/features/inventory/InventoryRoute";


// ⬇️ NEW: HomePage import
import HomePage from "@/features/home/HomePage";

/** LandingRouter sends users to the right home based on role
 *  (kept for reference; no longer used as "/" now shows HomePage) */
function LandingRouter() {
  const role = (getRole() || "").toLowerCase();
  if (role === "owner") return <Navigate to="/owner" replace />;
  if (role === "cashier") return <Navigate to="/pos" replace />;
  // fallbacks (manager, staff, etc.) can get their own pages later
  return <Navigate to="/login" replace />;
}

/** Optional: a friendly page if someone hits a protected route with wrong role */
function Restricted({ role }: { role?: string | null }) {
  return (
    <div className="min-h-screen grid place-items-center bg-slate-950 text-slate-100">
      <div className="max-w-md text-center p-6 rounded-xl border border-white/10 bg-white/5">
        <h1 className="text-2xl font-semibold mb-2">Restricted</h1>
        <p className="text-slate-300">
          You don’t have access to this page.
          {role ? <> Your role: <b>{role}</b>.</> : null}
        </p>
      </div>
    </div>
  );
}

// if you want a hard-guarded Owner route by role:
function OwnerOnly({ children }: { children: JSX.Element }) {
  const role = (getRole() || "").toLowerCase();
  if (role !== "owner") return <Restricted role={role} />;
  return children;
}

// if you want a hard-guarded Cashier route by role:
function CashierOnly({ children }: { children: JSX.Element }) {
  const role = (getRole() || "").toLowerCase();
  if (role !== "cashier") return <Restricted role={role} />;
  return children;
}

// if you want a hard-guarded Owner/Admin route by role:
function OwnerOrAdmin({ children }: { children: JSX.Element }) {
  const role = (getRole() || "").toLowerCase();
  if (role !== "owner" && role !== "admin") return <Restricted role={role} />;
  return children;
}


const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },

  // ⬇️ CHANGED: everyone lands on HomePage (inherits AppShell), still protected
  { path: "/", element: <ProtectedRoute><HomePage /></ProtectedRoute> },

  // Owner dashboard (wrapped in AppShell via OwnerRoute)
  {
    path: "/owner",
    element: (
      <ProtectedRoute>
        <OwnerOnly>
          <OwnerRoute />
        </OwnerOnly>
      </ProtectedRoute>
    ),
  },

  // Cashier POS (wrapped in AppShell via PosRoute)
  {
    path: "/pos",
    element: (
      <ProtectedRoute>
        <CashierOnly>
          <PosRoute />
        </CashierOnly>
      </ProtectedRoute>
    ),
  },

  // Catalog (wrapped in AppShell via CatalogRoute)
  {
    path: "/catalog",
    element: (
      <ProtectedRoute>
        <OwnerOnly>
          <CatalogRoute />
        </OwnerOnly>
      </ProtectedRoute>
    ),
  },

  // Inventory (wrapped in AppShell via InventoryRoute)
    {
      path: "/inventory",
      element: (
        <ProtectedRoute>
          {/* adjust role gate as you prefer */}
          <OwnerOnly>
            <InventoryRoute />
          </OwnerOnly>
        </ProtectedRoute>
      ),
    },

  // Admin Panel
    {
      path: "/admin",
      element: (
        <ProtectedRoute>
          <OwnerOrAdmin>
            <AdminRoute />
          </OwnerOrAdmin>
        </ProtectedRoute>
      ),
    },



  // Catch-all → send unknown routes to Home
  { path: "*", element: <Navigate to="/" replace /> },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);

