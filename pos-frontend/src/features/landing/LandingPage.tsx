// pos-frontend/src/features/marketing/LandingPage.tsx
import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  TrendingUp,
  Layers,
  Receipt,
  Clock3,
  ChevronRight,
  Menu,
  X,
} from "lucide-react";

const features = [
  {
    title: "One register for every store",
    copy: "Launch tills in seconds, track every shift, and stay synced with inventory and analytics.",
    icon: Store,
  },
  {
    title: "Customers served faster",
    copy: "Barcode scanning, saved carts, and smart prompts keep lines short and service polished.",
    icon: Sparkles,
  },
  {
    title: "Owners stay in the loop",
    copy: "Real-time dashboards highlight revenue, top products, and store health without spreadsheets.",
    icon: TrendingUp,
  },
];

const proof = [
  { label: "Retailers onboarded", value: "120+" },
  { label: "Registers online", value: "430" },
  { label: "Inventory accuracy", value: "99.5%" },
];

const flows = [
  {
    icon: Receipt,
    title: "Checkout that feels familiar",
    copy: "Add items, apply discounts, split payments, and print beautiful receipts in two taps.",
  },
  {
    icon: Layers,
    title: "Inventory that updates itself",
    copy: "Each sale, return, or transfer keeps stock in sync so your team never double counts.",
  },
  {
    icon: Clock3,
    title: "Sales you can trust",
    copy: "Owner dashboards surface KPIs per store, per associate, or across the whole business.",
  },
];

const testimonials = [
  {
    quote:
      "We opened three new locations in eight weeks and POS Stack kept every register, tax, and discount consistent.",
    author: "Priya Desai",
    role: "COO, Lumen Home",
  },
  {
    quote:
      "My cashiers love how fast the return workflow is. Owners get instant context without slowing the line.",
    author: "Marcus Ortega",
    role: "Founder, Aero Supply",
  },
];

const faqs = [
  {
    q: "Does POS Stack work for multi-store businesses?",
    a: "Yes. Tenants can manage unlimited stores, registers, and teams with role-based access out of the box.",
  },
  {
    q: "Can we migrate our existing catalog and customers?",
    a: "Our onboarding team helps import products, inventory balances, and customer lists—usually within a day.",
  },
  {
    q: "Is training required?",
    a: "Most teams begin using the POS the same day. We include guided tours, knowledge base, and chat support.",
  },
];

const navLinks = [
  { href: "#features", label: "Features" },
  { href: "#story", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export default function LandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const Nav = useMemo(
    () => (
      <>
        {/* Desktop */}
        <div className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Mobile */}
        <div className="md:hidden">
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
            className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </>
    ),
    [mobileOpen]
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted text-foreground">
      {/* Mobile Menu Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-background/95 backdrop-blur-sm md:hidden">
          <div className="flex flex-col gap-6 p-6 pt-20">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="text-lg font-medium text-foreground transition hover:text-emerald-400"
              >
                {link.label}
              </a>
            ))}
            <div className="mt-6 flex flex-col gap-3">
              <Link
                to="/signup"
                className="rounded-full bg-emerald-500 px-6 py-3 text-center font-semibold text-foreground transition hover:bg-emerald-400"
                onClick={() => setMobileOpen(false)}
              >
                Create account
              </Link>
              <Link
                to="/login"
                className="rounded-full border border-border/40 px-6 py-3 text-center font-medium text-foreground transition hover:bg-muted"
                onClick={() => setMobileOpen(false)}
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Hero */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.15),_transparent_60%)] opacity-60" />
        <div className="relative mx-auto max-w-7xl px-6 py-12 sm:py-16 lg:py-20">
          <nav className="flex items-center justify-between">
            <div className="text-lg font-bold tracking-tight text-foreground">POS Stack</div>
            {Nav}
            <div className="hidden items-center gap-3 md:flex">
              <Link
                to="/login"
                className="rounded-full px-5 py-2 text-sm font-medium text-muted-foreground ring-1 ring-border/30 transition hover:bg-muted"
              >
                Sign in
              </Link>
              <Link
                to="/signup"
                className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-foreground transition hover:bg-emerald-400"
              >
                Create account
              </Link>
            </div>
          </nav>

          <div className="mt-16 grid gap-12 lg:grid-cols-[3fr_2fr] lg:items-center">
            <div className="max-w-2xl space-y-6">
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-500/30">
                <ShieldCheck className="h-4 w-4" /> Retail-ready POS + owner HQ
              </span>
              <h1 className="text-4xl font-bold leading-tight text-foreground sm:text-5xl lg:text-6xl">
                Run every register, return, and reconciliation from one cloud POS.
              </h1>
              <p className="text-lg text-muted-foreground">
                POS Stack keeps cashiers moving, owners informed, and inventory accurate—without juggling
                spreadsheets or on-prem servers.
              </p>
              <div className="flex flex-col gap-4 sm:flex-row">
                <Link
                  to="/signup"
                  className="group inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-7 py-3.5 font-semibold text-foreground shadow-lg shadow-emerald-500/30 transition-all hover:-translate-y-0.5 hover:bg-emerald-400"
                >
                  Start a free trial <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-muted px-7 py-3.5 font-medium text-foreground ring-1 ring-border/30 transition hover:bg-muted/80"
                >
                  I already use POS Stack
                </Link>
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-gradient-to-br from-white/8 to-white/2 p-8 shadow-2xl backdrop-blur-xl">
              <p className="mb-6 text-xs uppercase tracking-widest text-emerald-400">Trusted metrics</p>
              <div className="grid grid-cols-3 gap-4">
                {proof.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-xl bg-muted p-5 text-center ring-1 ring-border/20 transition hover:bg-muted"
                  >
                    <div className="text-3xl font-bold text-foreground">{item.value}</div>
                    <div className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">{item.label}</div>
                  </div>
                ))}
              </div>
              <blockquote className="mt-6 rounded-xl border-l-4 border-emerald-500/50 bg-muted/50 p-5 text-sm italic text-muted-foreground">
                <p>“POS Stack gives every associate the same playbook and lets me run the business from anywhere.”</p>
                <footer className="mt-2 text-xs uppercase tracking-widest text-muted-foreground">
                  — Retail leadership survey
                </footer>
              </blockquote>
            </div>
          </div>
        </div>
      </header>

      {/* Features */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-20">
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-emerald-400">Built for modern retail</p>
          <h2 className="mt-3 text-3xl font-bold text-foreground sm:text-4xl">
            Everything teams need, nothing they don’t.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            From high-volume boutiques to multi-store brands, POS Stack keeps staff confident and customers happy.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-border bg-muted p-8 backdrop-blur transition-all hover:border-emerald-500/30 hover:bg-muted"
            >
              <f.icon className="h-12 w-12 text-emerald-400 transition-transform group-hover:scale-110" />
              <h3 className="mt-5 text-xl font-semibold text-foreground">{f.title}</h3>
              <p className="mt-3 text-sm text-muted-foreground">{f.copy}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works + Testimonials */}
      <section id="story" className="bg-card/50 py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className="text-xs uppercase tracking-widest text-emerald-400">How it works</p>
              <h2 className="mt-3 text-3xl font-bold text-foreground sm:text-4xl">
                From sale to stock, every moment stays connected.
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                POS Stack weaves together checkout, inventory, and analytics so frontline teams don’t have to think
                about the systems behind them.
              </p>

              <div className="mt-10 space-y-5">
                {flows.map((flow) => (
                  <div
                    key={flow.title}
                    className="flex gap-5 rounded-2xl border border-border bg-muted p-6 backdrop-blur transition hover:border-emerald-500/30"
                  >
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
                      <flow.icon className="h-8 w-8" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{flow.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{flow.copy}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-gradient-to-br from-emerald-500/10 to-muted/70 p-8 shadow-2xl backdrop-blur-xl">
              <h3 className="text-xl font-semibold text-foreground">What customers say</h3>
              <div className="mt-8 space-y-8 divide-y divide-border/50">
                {testimonials.map((t, i) => (
                  <div key={i} className={i > 0 ? "pt-8" : ""}>
                    <blockquote className="text-base italic text-foreground">“{t.quote}”</blockquote>
                    <p className="mt-4 text-xs uppercase tracking-widest text-emerald-400">
                      {t.author} · {t.role}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-7xl px-6 py-20">
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-emerald-400">Simple pricing</p>
          <h2 className="mt-3 text-3xl font-bold text-foreground sm:text-4xl">Scale up without surprise fees.</h2>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {["Starter", "Growth", "Enterprise"].map((tier, i) => (
            <div
              key={tier}
              className={`rounded-2xl border p-8 transition-all ${
                i === 1
                  ? "border-emerald-500/50 bg-emerald-500/10 shadow-2xl shadow-emerald-500/20"
                  : "border-border bg-muted backdrop-blur hover:border-border/40"
              }`}
            >
              <div className="text-xs uppercase tracking-widest text-muted-foreground">{tier}</div>
              <div className="mt-4 text-4xl font-bold text-foreground">
                {i === 0 && "$69"}
                {i === 1 && "$149"}
                {i === 2 && "Let’s chat"}
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {i === 0 && "Single store, 2 registers, email support."}
                {i === 1 && "Multi-store, unlimited registers, chat support."}
                {i === 2 && "Custom workflows, white-glove onboarding, SLA."}
              </p>
              <Link
                to={i === 2 ? "/contact" : "/signup"}
                className={`mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition ${
                  i === 1
                    ? "bg-emerald-500 text-foreground hover:bg-emerald-400"
                    : "bg-muted text-foreground ring-1 ring-border/30 hover:bg-muted/80"
                }`}
              >
                {i === 2 ? "Talk to sales" : "Start now"} <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="bg-card/40 py-20">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">Questions, answered.</h2>
          <div className="mt-10 space-y-6">
            {faqs.map((item) => (
              <details
                key={item.q}
                className="group rounded-2xl border border-border bg-muted p-6 backdrop-blur transition hover:border-emerald-500/30"
              >
                <summary className="flex cursor-pointer items-center justify-between text-lg font-semibold text-foreground">
                  {item.q}
                  <ChevronRight className="h-5 w-5 text-emerald-400 transition-transform group-open:rotate-90" />
                </summary>
                <p className="mt-4 text-sm text-muted-foreground">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <footer className="border-t border-border bg-background/80 py-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col items-center justify-between gap-8 text-center sm:flex-row sm:text-left">
            <div className="max-w-xl">
              <h3 className="text-2xl font-bold text-foreground">Ready for your last POS migration?</h3>
              <p className="mt-2 text-muted-foreground">
                Spin up POS Stack, invite your team, and go live in a single afternoon.
              </p>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row">
              <Link
                to="/signup"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-6 py-3 font-semibold text-foreground transition hover:bg-emerald-400"
              >
                Create account
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-border/40 px-6 py-3 font-medium text-foreground transition hover:bg-muted"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}