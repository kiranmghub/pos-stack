import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  ArrowDownRight,
  BarChart2,
  Building2,
  CircleDashed,
  DollarSign,
  LogOut,
  Package2,
  Percent,
  Search,
  Store,
  TrendingUp
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  Legend
} from "recharts";
import { getMyStores, type StoreLite } from "@/features/pos/api";

/**
 * OwnerDashboard — a beautiful, data‑dense, tenant‑aware landing page for owners.
 *
 * What it shows
 * - KPI cards: Revenue Today, Orders, Avg Order Value, Active Stores
 * - Charts: Revenue last 14 days (area), Revenue by store (bar)
 * - Tables: Top Products, Low Stock Alerts, Recent Sales
 *
 * Backend expectations (adjust paths to your API):
 * - GET /api/v1/analytics/owner/summary
 * - GET /api/v1/analytics/owner/sales_trend?days=14
 * - GET /api/v1/analytics/owner/revenue_by_store?days=30
 * - GET /api/v1/analytics/owner/top_products?limit=5
 * - GET /api/v1/inventory/low_stock?limit=5
 * - GET /api/v1/orders/recent?limit=8
 *
 * Auth/tenant
 * - Reads tokens & tenant from localStorage (set by LoginPage)
 * - Renders a guard if role !== 'owner'
 */


// feature flag: decide if we should force mock data
const FORCE_MOCK =
  (import.meta.env.VITE_USE_MOCK_DASHBOARD === "true") ||
  (new URLSearchParams(window.location.search).get("mock") === "1") ||
  (localStorage.getItem("use_mock_dashboard") === "1");

// helper: return JSON if ok; otherwise use mock
async function readOrMock<T>(res: Response, mock: T | (() => T)): Promise<T> {
  if (FORCE_MOCK) return typeof mock === "function" ? (mock as any)() : mock;
  if (res.ok) return res.json();
  return typeof mock === "function" ? (mock as any)() : mock;
}


// -----------------------------
// tiny API helper
// -----------------------------
const API_BASE = import.meta.env.VITE_API_BASE || "";
type CurrencyInfo = { code?: string; symbol?: string | null; precision?: number | null };
async function api(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  const token = localStorage.getItem("access_token");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  return res;
}

function formatCurrency(n: number | string, cur: CurrencyInfo) {
  const num = typeof n === "string" ? Number(n) : n;
  const precision = Number.isFinite(cur?.precision as number) ? Number(cur.precision) : 2;
  const code = cur?.code || "USD";
  const safe = Number.isFinite(num) ? num : 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    }).format(safe);
  } catch {
    const sym = cur?.symbol || code;
    return `${sym}${safe.toFixed(precision)}`;
  }
}

function clsx(...xs: (string | false | null | undefined)[]) { return xs.filter(Boolean).join(" "); }

// -----------------------------
// types
// -----------------------------
interface Summary {
  revenue_today: number;
  orders_today: number;
  aov_today: number;
  active_stores: number;
  delta_revenue_pct?: number; // vs yesterday
}

interface TrendPoint { date: string; revenue: number; orders: number; }
interface StoreRevenue { store_code: string; store_name: string; revenue: number; orders: number; }
interface TopProduct { sku: string; name: string; revenue: number; qty: number; }
interface LowStock { store: string; sku: string; variant: string; on_hand: number; min_stock: number; }
interface RecentSale {
  id: number;
  store?: string;
  store_name?: string;
  total: number;
  created_at: string;
  cashier?: string;
  cashier_name?: string;
}

function asArray<T>(payload: any): T[] {
  if (Array.isArray(payload)) return payload;
  if (payload?.results && Array.isArray(payload.results)) return payload.results;
  if (payload?.data && Array.isArray(payload.data)) return payload.data;
  return [];
}

// -----------------------------
// main component
// -----------------------------
export default function OwnerDashboard() {
  const role = localStorage.getItem("role");
  const tenant = localStorage.getItem("tenant_code") || "";

  const [stores, setStores] = useState<StoreLite[]>([]);
  const [currency, setCurrency] = useState<CurrencyInfo>({ code: "USD", symbol: "$", precision: 2 });
  const [summary, setSummary] = useState<Summary | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [byStore, setByStore] = useState<StoreRevenue[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [lowStock, setLowStock] = useState<LowStock[]>([]);
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await getMyStores();
        if (!alive) return;
        const arr = Array.isArray(s) ? s : (s as any).results || [];
        setStores(arr);
        const first = arr[0];
        if (first) {
          setCurrency({
            code: (first as any).currency_code || "USD",
            symbol: (first as any).currency_symbol || undefined,
            precision: (first as any).currency_precision ?? 2,
          });
        }
      } catch {
        /* ignore store fetch errors; fallback to USD */
      }

      try {
        setLoading(true);
        const [s, t, b, p, l, r] = await Promise.all([
          api("/api/v1/analytics/owner/summary"),
          api("/api/v1/analytics/owner/sales_trend?days=14"),
          api("/api/v1/analytics/owner/revenue_by_store?days=30"),
          api("/api/v1/analytics/owner/top_products?limit=5"),
          api("/api/v1/inventory/low_stock?limit=5"),
          api("/api/v1/orders/recent?limit=8"),
        ]);

        if (!alive) return;

        // Gracefully handle non-200s by falling back to mock data
//         const read = async (res: Response, fallback: any) => (res.ok ? res.json() : fallback);
//
//         const summaryData = await read(s, { revenue_today: 5820.45, orders_today: 87, aov_today: 66.9, active_stores: 3, delta_revenue_pct: 8.2 });
//         const trendData = await read(t, sampleTrend());
//         const byStoreData = await read(b, sampleByStore());
//         const topData = await read(p, sampleTopProducts());
//         const lowData = await read(l, sampleLowStock());
//         const recentData = await read(r, sampleRecentSales());

        // For Live vs Mock Data
        const summaryData = await readOrMock(s, () => ({ revenue_today: 5820.45, orders_today: 87, aov_today: 66.9, active_stores: 3, delta_revenue_pct: 8.2 }));
        const trendPayload   = await readOrMock(t, () => sampleTrend());
        const byStorePayload = await readOrMock(b, () => sampleByStore());
        const topPayload     = await readOrMock(p, () => sampleTopProducts());
        const lowPayload     = await readOrMock(l, () => sampleLowStock());
        const recentPayload  = await readOrMock(r, () => sampleRecentSales());

        setSummary(summaryData);
        setTrend(asArray<TrendPoint>(trendPayload));
        setByStore(asArray<StoreRevenue>(byStorePayload));
        setTopProducts(asArray<TopProduct>(topPayload));
        setLowStock(asArray<LowStock>(lowPayload));
        setRecentSales(
          asArray<RecentSale>(recentPayload).map((sale) => ({
            ...sale,
            store_name: sale.store_name ?? sale.store ?? "—",
            cashier_name: sale.cashier_name ?? sale.cashier ?? "",
          }))
        );
        // optional: allow API to return currency metadata on summary
        const curFromSummary = (summaryData as any)?.currency || null;
        if (curFromSummary) {
          setCurrency({
            code: curFromSummary.code || "USD",
            symbol: curFromSummary.symbol || undefined,
            precision: curFromSummary.precision ?? currency.precision ?? 2,
          });
        }
        setError(null);
      } catch (e: any) {
        setError(e?.message || "Failed to load dashboard");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const revenueChangeColor = useMemo(() => {
    const d = summary?.delta_revenue_pct ?? 0;
    return d >= 0 ? "text-emerald-400" : "text-rose-400";
  }, [summary?.delta_revenue_pct]);

  if (role !== "owner") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 grid place-items-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold">Restricted</h1>
          <p className="mt-2 text-slate-400">This dashboard is for Owner role. Your role: <span className="font-medium text-slate-200">{role || "unknown"}</span></p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100">
      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/20 ring-1 ring-white/10">
              <Building2 className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm text-slate-400">Tenant</div>
              <div className="text-base font-semibold tracking-wide">{tenant || "—"}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5">
              <Search className="h-4 w-4 text-slate-400" />
              <input className="bg-transparent text-sm focus:outline-none placeholder:text-slate-500" placeholder="Search…" />
            </div>
            <button
              onClick={() => { localStorage.clear(); window.location.href = "/login"; }}
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
            >
              <LogOut className="h-4 w-4" /> Logout
            </button>
            <button
              onClick={() => {
                const next = localStorage.getItem("use_mock_dashboard") === "1" ? "0" : "1";
                localStorage.setItem("use_mock_dashboard", next);
                // Reload so the flag is re-evaluated on mount
                window.location.reload();
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
              title="Toggle mock data"
            >
              <span>Mock: {localStorage.getItem("use_mock_dashboard") === "1" ? "On" : "Off"}</span>
            </button>

          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* KPI cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KpiCard title="Revenue (Today)" value={summary ? formatCurrency(summary.revenue_today, currency) : "—"} icon={<DollarSign className="h-4 w-4" />} footer={
            <span className={clsx("inline-flex items-center gap-1 text-xs", revenueChangeColor)}>
              {((summary?.delta_revenue_pct ?? 0) >= 0) ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />} {Math.abs(summary?.delta_revenue_pct ?? 0)}%
              <span className="text-slate-400"> vs yesterday</span>
            </span>
          } />
          <KpiCard title="Orders (Today)" value={summary?.orders_today?.toString() || "—"} icon={<Package2 className="h-4 w-4" />} footer={<span className="text-xs text-slate-400">All stores</span>} />
          <KpiCard title="Avg Order Value" value={summary ? formatCurrency(summary.aov_today, currency) : "—"} icon={<Percent className="h-4 w-4" />} footer={<span className="text-xs text-slate-400">Today</span>} />
          <KpiCard title="Active Stores" value={summary?.active_stores?.toString() || "—"} icon={<Store className="h-4 w-4" />} footer={<span className="text-xs text-slate-400">Online registers</span>} />
        </div>

        {/* Charts */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="col-span-1 rounded-3xl border border-white/10 bg-white/5 p-4 lg:col-span-3">
            <Header title="Revenue — last 14 days" icon={<TrendingUp className="h-4 w-4" />} />
            <div className="mt-2 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="currentColor" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="currentColor" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="date" tick={{ fill: "#9aa4b2", fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `$${Math.round(v/1000)}k`} tick={{ fill: "#9aa4b2", fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "rgba(2,6,23,0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }}
                           labelStyle={{ color: "#cbd5e1" }}
                          formatter={(v: any, n: any) => [formatCurrency(Number(v), currency), n]} />
                  <Area type="monotone" dataKey="revenue" stroke="currentColor" fill="url(#gradRevenue)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="col-span-1 rounded-3xl border border-white/10 bg-white/5 p-4 lg:col-span-2">
            <Header title="Revenue by store — 30 days" icon={<BarChart2 className="h-4 w-4" />} />
            <div className="mt-2 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byStore}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="store_code" tick={{ fill: "#9aa4b2", fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `$${Math.round(v/1000)}k`} tick={{ fill: "#9aa4b2", fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "rgba(2,6,23,0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }}
                           labelStyle={{ color: "#cbd5e1" }}
                          formatter={(v: any, n: any) => [formatCurrency(Number(v), currency), n]} />
                  <Legend wrapperStyle={{ color: "#cbd5e1" }} />
                  <Bar dataKey="revenue" name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Tables */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <Header title="Top products" icon={<Package2 className="h-4 w-4" />} />
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-slate-300">
                  <tr>
                    <th className="pb-2">Product</th>
                    <th className="pb-2">SKU</th>
                    <th className="pb-2 text-right">Qty</th>
                    <th className="pb-2 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {topProducts.map((p, i) => (
                    <tr key={p.sku + i} className="hover:bg-white/5">
                      <td className="py-2 pr-3">{p.name}</td>
                      <td className="py-2 pr-3 text-slate-400">{p.sku}</td>
                      <td className="py-2 pr-3 text-right">{p.qty}</td>
                      <td className="py-2 text-right">{formatCurrency(p.revenue, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="lg:col-span-2">
            <Header title="Low stock alerts" icon={<CircleDashed className="h-4 w-4" />} />
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-slate-300">
                  <tr>
                    <th className="pb-2">Store</th>
                    <th className="pb-2">Variant</th>
                    <th className="pb-2 text-right">On hand</th>
                    <th className="pb-2 text-right">Min</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {lowStock.map((r, i) => (
                    <tr key={r.sku + r.store + i} className="hover:bg-white/5">
                      <td className="py-2 pr-3">{r.store}</td>
                      <td className="py-2 pr-3 text-slate-300">{r.variant} <span className="text-slate-500">({r.sku})</span></td>
                      <td className="py-2 pr-3 text-right">{r.on_hand}</td>
                      <td className="py-2 text-right">{r.min_stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Recent Sales */}
        <Card className="mt-6">
          <Header title="Recent sales" icon={<Package2 className="h-4 w-4" />} />
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-300">
                <tr>
                  <th className="pb-2">Sale #</th>
                  <th className="pb-2">Store</th>
                  <th className="pb-2">Cashier</th>
                  <th className="pb-2">Time</th>
                  <th className="pb-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {recentSales.map((s) => (
                  <tr key={s.id} className="hover:bg-white/5">
                    <td className="py-2 pr-3">#{s.id}</td>
                    <td className="py-2 pr-3">{s.store_name || s.store || "—"}</td>
                    <td className="py-2 pr-3 text-slate-400">{s.cashier_name || s.cashier || "—"}</td>
                    <td className="py-2 pr-3">{new Date(s.created_at).toLocaleString()}</td>
                    <td className="py-2 text-right">{formatCurrency(s.total, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Loading / error overlay */}
        {loading && (
          <div className="fixed inset-0 z-20 grid place-items-center bg-slate-950/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-sm text-slate-200">
              Loading dashboard…
            </motion.div>
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-rose-200">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

// -----------------------------
// small presentational helpers
// -----------------------------
function Header({ title, icon }: { title: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10">
        {icon}
      </div>
      <h3 className="text-sm font-semibold tracking-wide text-slate-200">{title}</h3>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("rounded-3xl border border-white/10 bg-white/5 p-4", className)}>
      {children}
    </div>
  );
}

function KpiCard({ title, value, icon, footer }: { title: string; value: string; icon?: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-slate-400">{title}</div>
          <div className="mt-1 text-2xl font-semibold text-white">{value}</div>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10">
          {icon}
        </div>
      </div>
      {footer && <div className="mt-2">{footer}</div>}
    </div>
  );
}

// -----------------------------
// fallback sample data (used when API isn't ready)
// -----------------------------
function sampleTrend(): TrendPoint[] {
  const out: TrendPoint[] = [];
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const revenue = 4000 + Math.random() * 6000;
    out.push({ date: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), revenue, orders: Math.round(revenue / 60) });
  }
  return out;
}

function sampleByStore(): StoreRevenue[] {
  return [
    { store_code: "CHI-01", store_name: "Chicago Loop", revenue: 48210, orders: 712 },
    { store_code: "DAL-02", store_name: "Dallas Uptown", revenue: 39820, orders: 605 },
    { store_code: "AUS-01", store_name: "Austin SoCo", revenue: 36580, orders: 542 },
  ];
}

function sampleTopProducts(): TopProduct[] {
  return [
    { sku: "PAINT-GL-RED", name: "Acrylic Paint (Red) — Gallon", revenue: 5820, qty: 96 },
    { sku: "BRUSH-SET-5", name: "Pro Brush Set (5pc)", revenue: 4310, qty: 153 },
    { sku: "ROLLER-PRO", name: "9\" Roller Pro", revenue: 3980, qty: 127 },
    { sku: "TAPE-2IN", name: "Painter's Tape 2\"", revenue: 3520, qty: 210 },
    { sku: "THINNER-1L", name: "Thinner 1L", revenue: 2960, qty: 88 },
  ];
}

function sampleLowStock(): LowStock[] {
  return [
    { store: "Chicago Loop", sku: "PAINT-GL-RED", variant: "Acrylic Red Gallon", on_hand: 6, min_stock: 12 },
    { store: "Dallas Uptown", sku: "BRUSH-SET-5", variant: "Brush Set 5pc", on_hand: 8, min_stock: 15 },
    { store: "Austin SoCo", sku: "ROLLER-PRO", variant: "9\" Roller Pro", on_hand: 4, min_stock: 10 },
  ];
}

function sampleRecentSales(): RecentSale[] {
  const now = new Date();
  return Array.from({ length: 8 }).map((_, i) => {
    const store = i % 2 ? "Dallas Uptown" : "Chicago Loop";
    const cashier = i % 2 ? "alex" : "jordan";
    return {
      id: 1000 + i,
      store,
      store_name: store,
      total: 30 + Math.random() * 120,
      created_at: new Date(now.getTime() - i * 3600_000).toISOString(),
      cashier,
      cashier_name: cashier,
    };
  });
}
