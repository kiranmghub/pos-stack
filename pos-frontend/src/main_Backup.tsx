import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";

import LoginPage from "@/features/auth/LoginPage";
import ProtectedRoute from "@/routes/ProtectedRoute";
import OwnerDashboard from "@/features/owner/OwnerDashboard";
import PosScreen from "@/features/pos/PosScreen";

import "@/index.css";
import { getRole } from "@/lib/auth";

import CatalogPage from "@/features/catalog/CatalogPage";

/** LandingRouter sends users to the right home based on role */
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

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },

  // Auto-home: decides based on role and redirects
  { path: "/", element: <ProtectedRoute><LandingRouter /></ProtectedRoute> },

  // Owner dashboard
  {
    path: "/owner",
    element: (
      <ProtectedRoute>
        <OwnerOnly>
          <OwnerDashboard />
        </OwnerOnly>
      </ProtectedRoute>
    ),
  },

  // Cashier POS
  {
    path: "/pos",
    element: (
      <ProtectedRoute>
        <CashierOnly>
          <PosScreen />
        </CashierOnly>
      </ProtectedRoute>
    ),
  },

  // CatalogPage
  {
  path: "/catalog",
  element: (
    <ProtectedRoute>
      <OwnerOnly>
        <CatalogPage />
      </OwnerOnly>
    </ProtectedRoute>
  ),
 },

  // Catch-all → send unknown routes to role-based landing (which re-routes)
  { path: "*", element: <Navigate to="/" replace /> },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
