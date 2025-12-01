import React, { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { fetchMetricsOverview } from "./api";
import { CalendarRange, BarChart3, Activity, ShieldAlert, MailWarning } from "lucide-react";

type Metrics = {
  range: { start: string; end: string; timezone?: string };
  otp: {
    sent: number;
    failed: number;
    prev_sent: number;
    prev_failed: number;
    by_day: { date: string; sent: number; failed: number }[];
  };
  signup: {
    start: number;
    verify_ok: number;
    complete: number;
    prev_total: number;
    by_day: { date: string; start: number; verify_ok: number; complete: number }[];
  };
  subscriptions: {
    created: number;
    status_changed: number;
    status_counts: Record<string, number>;
    prev_total: number;
    by_day: { date: string; created: number; status_changed: number }[];
  };
  emails: {
    sent: number;
    failed: number;
    prev_sent: number;
    prev_failed: number;
    by_day: { date: string; sent: number; failed: number }[];
  };
};

function formatNumber(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

function StatCard({
  title,
  value,
  subtitle,
  delta,
  icon,
  accent = "from-indigo-500 to-sky-500",
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  delta?: number;
  icon: React.ReactNode;
  accent?: string;
}) {
  const deltaColor = delta === undefined ? "" : delta > 0 ? "text-emerald-300" : delta < 0 ? "text-rose-300" : "text-muted-foreground";
  const deltaSign = delta === undefined ? "" : delta > 0 ? "▲" : delta < 0 ? "▼" : "■";
  const deltaText = delta === undefined ? "" : `${deltaSign} ${Math.abs(delta).toFixed(1)}% vs prev`;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-white/[0.03] p-4">
      <div className={`pointer-events-none absolute inset-x-0 -top-20 h-32 bg-gradient-to-b ${accent} opacity-20 blur-2xl`} />
      <div className="relative flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-card ring-1 ring-border/20 text-foreground">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">{title}</div>
          <div className="text-xl font-semibold text-foreground">{typeof value === "number" ? formatNumber(value) : value}</div>
          {subtitle ? <div className="text-xs text-muted-foreground">{subtitle}</div> : null}
          {delta !== undefined ? <div className={`text-[11px] ${deltaColor}`}>{deltaText}</div> : null}
        </div>
      </div>
    </div>
  );
}

function BarSpark({
  data,
  keys,
  colors,
  legend,
  height = 96,
}: {
  data: { date: string; [key: string]: number | string }[];
  keys: string[];
  colors: Record<string, string>;
  legend?: Record<string, string>;
  height?: number;
}) {
  const maxVal = useMemo(() => {
    let max = 0;
    data.forEach((row) => {
      keys.forEach((k) => {
        const v = Number(row[k] || 0);
        if (v > max) max = v;
      });
    });
    return max || 1;
  }, [data, keys]);

  return (
    <div className="space-y-2">
      {legend ? (
        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          {keys.map((k) => (
            <div key={k} className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: colors[k] || "rgba(255,255,255,0.6)" }} />
              <span>{legend[k] || k}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex items-end gap-1 overflow-x-auto pb-1" style={{ height }}>
        {data.map((row) => (
          <div key={row.date as string} className="flex flex-col justify-end gap-0.5 min-w-[10px] flex-1">
            {keys.map((k) => {
              const val = Number(row[k] || 0);
              const h = Math.max(4, (val / maxVal) * (height - 20));
              return (
                <div
                  key={k}
                  className="rounded-md"
                  style={{ height: `${h}px`, backgroundColor: colors[k] || "rgba(255,255,255,0.3)" }}
                  title={`${row.date}: ${legend?.[k] || k} = ${val}`}
                />
              );
            })}
            <div className="text-[10px] text-muted-foreground truncate text-center">{(row.date as string).slice(5)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MetricsPage() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const hasData = useMemo(() => {
    if (!metrics) return false;
    const totals = [
      metrics.otp.sent,
      metrics.otp.failed,
      metrics.signup.start,
      metrics.signup.verify_ok,
      metrics.signup.complete,
      metrics.subscriptions.created,
      metrics.subscriptions.status_changed,
      metrics.emails.sent,
      metrics.emails.failed,
    ];
    return totals.some((n) => (n || 0) > 0);
  }, [metrics]);

  useEffect(() => {
    const today = new Date();
    const endStr = today.toISOString().slice(0, 10);
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 13);
    const startStr = startDate.toISOString().slice(0, 10);
    setStart(startStr);
    setEnd(endStr);
  }, []);

  useEffect(() => {
    if (!start || !end) return;
    setLoading(true);
    setError(null);
    fetchMetricsOverview({ start, end })
      .then((res) => setMetrics(res as Metrics))
      .catch((err) => setError(err?.message || "Failed to load metrics"))
      .finally(() => {
        setLoading(false);
        setIsFirstLoad(false);
      });
  }, [start, end]);

  return (
    <AppShell title="Analytics / Metrics">
      <div className="px-4 py-6 space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm text-muted-foreground">Observability</div>
            <div className="text-2xl font-semibold text-foreground">Signups, OTPs, Subscriptions, Emails</div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
              <CalendarRange className="h-4 w-4 text-muted-foreground" />
              <input
                type="date"
                value={start}
                max={end}
                onChange={(e) => setStart(e.target.value)}
                className="bg-transparent text-sm text-foreground focus:outline-none"
              />
              <span className="text-muted-foreground">to</span>
              <input
                type="date"
                value={end}
                min={start}
                onChange={(e) => setEnd(e.target.value)}
                className="bg-transparent text-sm text-foreground focus:outline-none"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        {loading && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-2xl border border-border bg-white/[0.03] p-4 space-y-3">
                <div className="h-5 w-24 rounded bg-muted" />
                <div className="h-6 w-16 rounded bg-muted" />
                <div className="h-4 w-32 rounded bg-card" />
              </div>
            ))}
          </div>
        )}

        {!loading && metrics && (
          <>
            <div className="text-sm text-muted-foreground">
              Range: {metrics.range.start} → {metrics.range.end}
              {metrics.range.timezone ? ` • Timezone: ${metrics.range.timezone}` : ""}
            </div>

            {!hasData && (
              <div className="mt-3 rounded-2xl border border-border bg-white/[0.03] p-4 text-muted-foreground">
                No metrics in this range. Try expanding the date range or generating new activity.
              </div>
            )}

            {hasData && (
              <>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <StatCard
                    title="OTP sends"
                    value={metrics.otp.sent}
                    subtitle={`Failures: ${metrics.otp.failed}`}
                    delta={
                      metrics.otp.prev_sent
                        ? ((metrics.otp.sent - metrics.otp.prev_sent) / metrics.otp.prev_sent) * 100
                        : undefined
                    }
                    icon={<ShieldAlert className="h-5 w-5 text-amber-200" />}
                    accent="from-amber-500 to-yellow-500"
                  />
                  <StatCard
                    title="Signup completes"
                    value={metrics.signup.complete}
                    subtitle={`Starts: ${metrics.signup.start} • Verifications: ${metrics.signup.verify_ok}`}
                    delta={
                      metrics.signup.prev_total
                        ? ((metrics.signup.complete - metrics.signup.prev_total) / metrics.signup.prev_total) * 100
                        : undefined
                    }
                    icon={<Activity className="h-5 w-5 text-emerald-200" />}
                    accent="from-emerald-500 to-teal-500"
                  />
                  <StatCard
                    title="Subscriptions created"
                    value={metrics.subscriptions.created}
                    subtitle={`Status changes: ${metrics.subscriptions.status_changed}`}
                    delta={
                      metrics.subscriptions.prev_total
                        ? ((metrics.subscriptions.created - metrics.subscriptions.prev_total) / metrics.subscriptions.prev_total) * 100
                        : undefined
                    }
                    icon={<BarChart3 className="h-5 w-5 text-sky-200" />}
                    accent="from-sky-500 to-indigo-500"
                  />
                  <StatCard
                    title="Emails"
                    value={metrics.emails.sent}
                    subtitle={`Failed: ${metrics.emails.failed}`}
                    delta={
                      metrics.emails.prev_sent
                        ? ((metrics.emails.sent - metrics.emails.prev_sent) / metrics.emails.prev_sent) * 100
                        : undefined
                    }
                    icon={<MailWarning className="h-5 w-5 text-pink-200" />}
                    accent="from-pink-500 to-rose-500"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="text-sm text-muted-foreground">OTP</div>
                        <div className="text-lg font-semibold text-foreground">Sends vs Failures</div>
                      </div>
                    </div>
                    <BarSpark
                      data={metrics.otp.by_day}
                      keys={["sent", "failed"]}
                      colors={{ sent: "rgba(56,189,248,0.9)", failed: "rgba(248,113,113,0.9)" }}
                      legend={{ sent: "Sent", failed: "Failed" }}
                    />
                  </div>

                  <div className="rounded-2xl border border-border bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="text-sm text-muted-foreground">Signup</div>
                        <div className="text-lg font-semibold text-foreground">Start → Verify → Complete</div>
                      </div>
                    </div>
                    <BarSpark
                      data={metrics.signup.by_day}
                      keys={["start", "verify_ok", "complete"]}
                      colors={{
                        start: "rgba(129,140,248,0.9)",
                        verify_ok: "rgba(74,222,128,0.9)",
                        complete: "rgba(59,130,246,0.9)",
                      }}
                      legend={{ start: "Start", verify_ok: "Verify OK", complete: "Complete" }}
                    />
                  </div>

                  <div className="rounded-2xl border border-border bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="text-sm text-muted-foreground">Subscriptions</div>
                        <div className="text-lg font-semibold text-foreground">Created & Status Changes</div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Status:{" "}
                        {Object.entries(metrics.subscriptions.status_counts || {})
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" • ") || "—"}
                      </div>
                    </div>
                    <BarSpark
                      data={metrics.subscriptions.by_day}
                      keys={["created", "status_changed"]}
                      colors={{ created: "rgba(94,234,212,0.9)", status_changed: "rgba(251,191,36,0.9)" }}
                      legend={{ created: "Created", status_changed: "Status changed" }}
                    />
                  </div>

                  <div className="rounded-2xl border border-border bg-white/[0.03] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="text-sm text-muted-foreground">Emails</div>
                        <div className="text-lg font-semibold text-foreground">Sent vs Failed</div>
                      </div>
                    </div>
                    <BarSpark
                      data={metrics.emails.by_day}
                      keys={["sent", "failed"]}
                      colors={{ sent: "rgba(147,197,253,0.9)", failed: "rgba(248,113,113,0.9)" }}
                      legend={{ sent: "Sent", failed: "Failed" }}
                    />
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
