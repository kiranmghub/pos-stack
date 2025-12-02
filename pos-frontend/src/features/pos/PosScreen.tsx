// pos-frontend/src/features/pos/PosScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ShoppingCart, Search, Minus, Plus, Trash2,
  CreditCard, Wallet, PauseCircle, XCircle, LogOut, ScanLine, Store, X
} from "lucide-react";
import { logout } from "@/lib/auth";
import {
  getMyStores,
  searchProducts,
  lookupBarcode,
  checkout,
  validateCoupon,
  type StoreLite,
  type VariantLite,
  // NEW: server-side quote API (make sure this exists in ./api.ts)
  quoteTotals,
  type QuoteOut,
  getActiveDiscountRules,
  type DiscountRule,
  type CurrencyInfo,
} from "./api";

import type { PosCustomer } from "./api";



// ---------- tiny utils ----------
const CART_KEY = "pos_cart_v2";
const STORE_KEY = "pos_active_store";
const LOW_STOCK_THRESHOLD = 5;

function toMoney(n: number | string) {
  const x = typeof n === "string" ? parseFloat(n) : n;
  return (isNaN(x) ? 0 : x).toFixed(2);
}
function toInt(v: unknown, fallback = 0) {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}
function toNum(s: any, fallback = 0) {
  const n = parseFloat(String(s ?? ""));
  return Number.isFinite(n) ? n : fallback;
}

function formatCurrency(value: number | string, currency: CurrencyInfo) {
  const num = typeof value === "string" ? parseFloat(value) : value;
  const precision = Number.isFinite(currency?.precision as number)
    ? Number(currency.precision)
    : 2;
  const code = currency?.code || "USD";
  const symbol = currency?.symbol ?? null;
  const safe = Number.isFinite(num) ? num : 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    }).format(safe);
  } catch {
    const prefix = symbol ? symbol : `${code} `;
    return `${prefix}${safe.toFixed(precision)}`;
  }
}

// ---------- types ----------
type CartLine = { variant: VariantLite; qty: number; line_discount?: number };

type ReceiptInfo = {
  sale_id: number;
  receipt_number?: string;
  receipt_qr_png?: string; // data URL from backend
  total?: string;
};

export default function PosScreen() {
  const [stores, setStores] = useState<StoreLite[]>([]);
  const [storeId, setStoreId] = useState<number | null>(() => {
    const s = localStorage.getItem(STORE_KEY);
    return s ? Number(s) : null;
  });
  const [currency, setCurrency] = useState<CurrencyInfo>({ code: "USD", symbol: "$", precision: 2 });

  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<VariantLite[]>([]);
  const [cart, setCart] = useState<CartLine[]>(() => {
    try {
      const raw = localStorage.getItem(CART_KEY);
      return raw ? (JSON.parse(raw) as CartLine[]) : [];
    } catch { return []; }
  });

  // pick the best image the backend gave us
  const imgFor = (v: VariantLite): string =>
    (v as any).image_url || (v as any).representative_image_url || "";

  const [barcode, setBarcode] = useState("");
  const [coupon, setCoupon] = useState<string>("");        // coupon code
  const [couponOk, setCouponOk] = useState<boolean | null>(null); // null = untouched
  const [couponMsg, setCouponMsg] = useState<string | null>(null);
  type AppliedCoupon = { code: string; name?: string };
  const [appliedCoupons, setAppliedCoupons] = useState<AppliedCoupon[]>([]);
  // discount rules: auto rules from backend + coupon rules for applied coupons
  const [autoDiscRules, setAutoDiscRules] = useState<DiscountRule[]>([]);
  const [couponDiscRules, setCouponDiscRules] = useState<DiscountRule[]>([]);
  const [couponRuleByCode, setCouponRuleByCode] = useState<Record<string, DiscountRule>>({});
  const money = (value: number | string) => formatCurrency(value, currency);



  const [paying, setPaying] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // legacy small summary (kept)
  const [receipt, setReceipt] = useState<ReceiptInfo | null>(null);
  // track which cart lines are expanded (by variant id)
  const [expandedLines, setExpandedLines] = useState<Record<number, boolean>>({});

  // --- Customer selection for POS checkout ---
  const [customer, setCustomer] = useState<PosCustomer | null>(null);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);


  const LineToggle: React.FC<{ open: boolean; onClick: () => void }> = ({ open, onClick }) => (
    <button
      onClick={onClick}
      className="text-xs rounded px-2 py-1 bg-muted hover:bg-muted text-foreground"
      title={open ? "Hide details" : "Show details"}
    >
      {open ? "Hide details" : "Details"}
    </button>
  );

  // total items in cart (sum of quantities)
  const cartCount = useMemo(() => cart.reduce((s, l) => s + l.qty, 0), [cart]);
  // In the furture if we want the cart badge to show distic items count instead of total qty:
  // const cartCount = useMemo(() => cart.length, [cart]);

  // modals
  const [showCash, setShowCash] = useState(false);
  const [showCard, setShowCard] = useState(false);

  // authoritative receipt after successful checkout
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<any | null>(null);
  const [lastQR, setLastQR] = useState<string | null>(null);

  const barcodeRef = useRef<HTMLInputElement>(null);

  // cart list container + highlight tracking
  const cartListRef = useRef<HTMLDivElement>(null);
  const [lastAddedId, setLastAddedId] = useState<number | null>(null);
  const [flashToken, setFlashToken] = useState<number>(0);
  // measure sticky totals (footer) so items don't hide beneath it
  const cartTotalsRef = useRef<HTMLDivElement>(null);
  const [footerH, setFooterH] = useState(0);



  // print helpers
  function printHtml(html: string) {
    const w = window.open("", "_blank", "width=420,height=700");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 200);
  }

  function buildReceiptHtml(r: any, qr?: string | null) {
    const m = (val: any) => money(val);
    const lines = (r?.lines || []).map(
      (l: any) => `
        <tr>
          <td style="padding:4px 0">${l.name} (${l.sku || "-"})</td>
          <td style="text-align:right;padding:4px 0">${l.qty}</td>
          <td style="text-align:right;padding:4px 0">${m(l.unit_price)}</td>
          <td style="text-align:right;padding:4px 0">${m(l.line_subtotal ?? l.line_total ?? l.line_net)}</td>
        </tr>`
    ).join("");

    const taxLines = (r?.totals?.tax_by_rule || [])
      .map((t: any) =>
        `<tr><td>${t.name}</td><td style="text-align:right">${m(t.amount)}</td></tr>`
      ).join("");

    return `<!doctype html>
<html><head><meta charset="utf-8"/><title>Receipt ${r?.receipt_no || ""}</title>
<style>
body{font:14px/1.3 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Inter,Arial,sans-serif;margin:16px;color:#000}
h1,h2,h3{margin:0}.muted{color:#444}
table{width:100%;border-collapse:collapse;margin-top:10px}
.totals td{padding:4px 0}.bar{border-top:1px dashed #999;margin:10px 0}.center{text-align:center}
img{display:block;margin:8px auto}
</style></head>
<body>
  <div class="center">
    <h2>${r?.tenant?.name || ""}</h2>
    <div class="muted">${r?.store?.code || ""} — ${r?.store?.name || ""}</div>
    <div class="muted">Receipt #${r?.receipt_no || ""}</div>
    <div class="muted">${new Date(r?.created_at || Date.now()).toLocaleString()}</div>
    ${r?.customer
        ? `<div class="muted">Customer: ${r.customer.name
        || r.customer.email
        || r.customer.phone
        || ("#" + r.customer.id)
        }</div>`
        : ""
      }
  </div>

  <div class="bar"></div>
  <table>
    <thead><tr><th style="text-align:left">Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Total</th></tr></thead>
    <tbody>${lines}</tbody>
  </table>
  <div class="bar"></div>
  <table class="totals">
    <tr><td>Subtotal</td><td style="text-align:right">${m(r?.totals?.subtotal || "0.00")}</td></tr>
    ${taxLines}
    ${r?.totals?.discount ? `<tr><td>Total Discounts</td><td style="text-align:right">${m(-r.totals.discount)}</td></tr>` : ""}
    <tr><td>Total Taxes</td><td style="text-align:right">${m(r?.totals?.tax || "0.00")}</td></tr>
    ${r?.totals?.fees ? `<tr><td>Fees</td><td style="text-align:right">${m(r.totals.fees)}</td></tr>` : ""}
    <tr><td><strong>Grand Total</strong></td><td style="text-align:right"><strong>${m(r?.totals?.grand_total || "0.00")}</strong></td></tr>
  </table>
  <div class="bar"></div>
  <div>Cashier: ${r?.cashier?.username || "-"}</div>
  ${r?.payment ? `<div>Payment: ${r.payment.type}${r.payment.received ? ` (received ${m(r.payment.received)})` : ""}${r.payment.change ? `, change ${m(r.payment.change)}` : ""}</div>` : ""}
  ${qr ? `<img width="160" height="160" src="${qr}" alt="QR" />` : ""}
  <div class="center muted">Thank you for your business!</div>
  <script>window.onafterprint=()=>window.close&&window.close();</script>
</body></html>`;
  }

  // trigger for refetching products after checkout
  const [refreshTick, setRefreshTick] = useState(0);

  // keep footer height so the list can pad its bottom accordingly
  useEffect(() => {
    const el = cartTotalsRef.current;
    if (!el) return;

    const update = () => setFooterH(el.offsetHeight || 0);
    update();

    // observe size changes (safer than window resize only)
    const RO = (window as any).ResizeObserver;
    if (RO) {
      const ro = new RO(update);
      ro.observe(el);
      return () => ro.disconnect();
    } else {
      // fallback
      const onResize = () => update();
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }
  }, []);

  // fetch stores once
  useEffect(() => {
    (async () => {
      try {
        const list = await getMyStores();
        const safe = Array.isArray(list) ? list : (list as any).results || [];
        // setStores(safe);
        // if (!storeId && safe.length > 0) {
        //   const first = safe[0];
        //   setStoreId(first.id);
        //   localStorage.setItem(STORE_KEY, String(first.id));
        // }
        setStores(safe);
        const current = safe.find(s => s.id === storeId) || safe[0];
        if (current) {
          setCurrency({
            code: current.currency_code || "USD",
            symbol: current.currency_symbol || undefined,
            precision: current.currency_precision ?? 2,
          });
        }
        if (safe.length > 0) {
          if (!storeId) {
            const first = safe[0];
            setStoreId(first.id);
            localStorage.setItem(STORE_KEY, String(first.id));
          } else if (!safe.some(s => s.id === storeId)) {
            // previously selected store is no longer accessible
            const first = safe[0];
            setStoreId(first.id);
            localStorage.setItem(STORE_KEY, String(first.id));
          }
        } else {
          // no stores accessible for this user
          setStoreId(null);
          localStorage.removeItem(STORE_KEY);
        }

      } catch (e: any) {
        setMsg(e.message || "Failed to load stores");
        setStores([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // load products whenever store or query changes
  useEffect(() => {
    if (!storeId) return;
    (async () => {
      try {
        const { products: list, currency: cur } = await searchProducts({ store_id: storeId, query });
        setProducts(list);
        if (cur) {
          setCurrency({
            code: cur.code || "USD",
            symbol: cur.symbol || undefined,
            precision: cur.precision ?? currency.precision ?? 2,
          });
        }
      } catch (e: any) {
        setMsg(e.message || "Failed to load products");
      }
    })();
  }, [storeId, query, refreshTick]);

  // Load auto discount rules when store changes
  useEffect(() => {
    if (!storeId) { setAutoDiscRules([]); return; }
    (async () => {
      try {
        const rules = await getActiveDiscountRules(storeId);
        setAutoDiscRules(rules || []);
      } catch {
        setAutoDiscRules([]);
      }
    })();
  }, [storeId]);


  // persist cart
  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  // scroll the cart to the most recently added/updated line
  useEffect(() => {
    if (!cartListRef.current || lastAddedId == null) return;
    const el = cartListRef.current.querySelector<HTMLElement>(`[data-vid="${lastAddedId}"]`);
    if (el) {
      // 'end' positions the item flush above the sticky footer (with our padding)
      el.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [cart, lastAddedId, footerH]);


  useEffect(() => {
    if (!flashToken) return;
    const t = setTimeout(() => setFlashToken(0), 900);
    return () => clearTimeout(t);
  }, [flashToken]);



  // cart helpers
  const qtyInCart = (variantId: number) =>
    cart.find(l => l.variant.id === variantId)?.qty ?? 0;

  const addToCart = (v: VariantLite) => {
    const onHand = toInt((v as any).on_hand, 0);
    const remaining = onHand - qtyInCart(v.id);
    if (remaining <= 0) { setMsg(`"${v.name}" is out of stock`); return; }
    setCart(prev => {
      const i = prev.findIndex(l => l.variant.id === v.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: Math.min(next[i].qty + 1, onHand) };
        if (next[i].qty === prev[i].qty) setMsg(`No more "${v.name}" available`);
        return next;
      }
      return [...prev, { variant: v, qty: 1 }];
    });
    // mark for scroll + flash
    setLastAddedId(v.id);
    setFlashToken(Date.now());

  };

  const changeQty = (id: number, delta: number) => {
    if (delta > 0) {
      setLastAddedId(id);
      setFlashToken(Date.now());
    }
    const v = products.find(p => p.id === id);
    const onHand = toInt((v as any)?.on_hand, 0);
    setCart(prev =>
      prev
        .map(l => {
          if (l.variant.id !== id) return l;
          const nextQty = Math.max(0, Math.min(999, l.qty + delta, onHand));
          if (nextQty === l.qty && delta > 0) setMsg(`No more "${l.variant.name}" available`);
          return { ...l, qty: nextQty };
        })
        .filter(l => l.qty > 0)
    );
  };


  const removeLine = (id: number) => setCart(prev => prev.filter(l => l.variant.id !== id));
  const clearCart = () => setCart([]);

  // preview subtotal only (the backend is authoritative for tax/total)
  const subtotal = useMemo(() => {
    return cart.reduce((s, l) => s + parseFloat(l.variant.price) * l.qty - (l.line_discount || 0), 0);
  }, [cart]);

  // barcode
  const onBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId || !barcode.trim()) return;
    try {
      const v = await lookupBarcode(storeId, barcode.trim());
      if (v) {
        addToCart(v);
        setBarcode("");
        barcodeRef.current?.focus();
      } else {
        setMsg(`No product for barcode ${barcode}`);
        setBarcode("");
      }
    } catch (e: any) {
      setMsg(e.message || "Lookup failed");
    }
  };

  // ===== NEW: live server-side quote (totals) =====
  const [quote, setQuote] = useState<QuoteOut | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // payload lines for quote
  const quoteLines = useMemo(() => {
    return cart.map(l => ({
      variant_id: l.variant.id,
      qty: l.qty,
      // send as string to avoid float drift; server is authoritative
      unit_price: toMoney(l.variant.price),
    }));
  }, [cart]);

  // fetch server totals on change (debounced)
  useEffect(() => {
    if (!storeId) { setQuote(null); return; }
    const id = setTimeout(async () => {
      // try {
      //   setQuoteError(null);
      //   if (quoteLines.length === 0) { setQuote(null); return; }
      //   const q = await quoteTotals({
      //     store_id: storeId,
      //     lines: quoteLines,
      //     coupon_code: coupon || undefined,
      //   });
      //   setQuote(q);
      // } catch (e: any) {
      //   setQuote(null);
      //   setQuoteError(e?.message || "Failed to get totals");
      // }

      try {
        setQuoteError(null);
        if (quoteLines.length === 0) { setQuote(null); return; }
        const { quote: q, currency: cur } = await quoteTotals({
          store_id: storeId!,
          lines: quoteLines,
          coupon_codes: appliedCoupons.map(x => x.code),
        });
        setQuote(q);
        if (cur) {
          setCurrency({
            code: cur.code || "USD",
            symbol: cur.symbol || undefined,
            precision: cur.precision ?? currency.precision ?? 2,
          });
        }
      } catch (e: any) {
        setQuote(null);
        setQuoteError(e?.message || "Failed to get totals");
      }

    }, 250); // debounce 250ms
    return () => clearTimeout(id);
  }, [storeId, quoteLines, appliedCoupons]);

  // checkout core (shared)
  async function submitCheckout(payment: Record<string, any>) {
    if (!storeId || cart.length === 0) return;
    setPaying(true);
    try {
      const payload = {
        store_id: storeId,
        register_id: null,
        lines: cart.map(l => ({
          variant_id: l.variant.id,
          qty: l.qty,
          unit_price: toMoney(l.variant.price),
          line_discount: l.line_discount ? toMoney(l.line_discount) : "0.00",
        })),
        payment,
        coupon_codes: appliedCoupons.map(x => x.code),
        // NEW: optional customer_id passed through to backend
        customer_id: customer?.id ?? null,
      };
      const res = await checkout(payload);
      console.log("checkout response", res); // quick sanity check
      if ((res as any).currency) {
        const cur = (res as any).currency as CurrencyInfo;
        setCurrency({
          code: cur.code || "USD",
          symbol: cur.symbol || undefined,
          precision: cur.precision ?? currency.precision ?? 2,
        });
      }


      // legacy summary
      setReceipt({
        sale_id: res.sale_id,
        receipt_number: (res as any).receipt_no || (res as any).receipt_number,
        receipt_qr_png: (res as any).qr_png_data_url || (res as any).receipt_qr_png,
        total: (res as any).total,
      });

      // open full receipt modal
      setLastReceipt((res as any).receipt || null);
      setLastQR((res as any).qr_png_data_url || null);
      if ((res as any).receipt?.currency) {
        const cur = (res as any).receipt.currency as CurrencyInfo;
        setCurrency({
          code: cur.code || "USD",
          symbol: cur.symbol || undefined,
          precision: cur.precision ?? currency.precision ?? 2,
        });
      }
      if ((res as any).receipt) setReceiptOpen(true);

      setMsg(`Sale #${res.sale_id} completed`);
      clearCart();
      setRefreshTick(t => t + 1);
      setAppliedCoupons([]); // clear applied coupons on successful checkout
      setCouponOk(null); // reset validation state
      setCouponMsg(null); // clear the “Applied:” message
      setCouponDiscRules([]);
      setCouponRuleByCode({});

    } catch (e: any) {
      setMsg(e.message || "Checkout failed");
    } finally {
      setPaying(false);
      setShowCash(false);
      setShowCard(false);
    }
  }

  // When cart changes, drop the last server receipt preview
  useEffect(() => {
    if (!receiptOpen && lastReceipt) {
      setLastReceipt(null);
      setLastQR(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, receiptOpen]);

  // tiny badge for stock state
  const StockBadge: React.FC<{ remaining: number }> = ({ remaining }) => {
    if (remaining <= 0) {
      return (
        <span className="mt-1 inline-flex items-center rounded-md bg-badge-error-bg px-2 py-0.5 text-xs font-medium text-badge-error-text ring-1 ring-inset ring-error/30">
          Out of stock
        </span>
      );
    }
    if (remaining <= LOW_STOCK_THRESHOLD) {
      return (
        <span className="mt-1 inline-flex items-center rounded-md bg-badge-warning-bg px-2 py-0.5 text-xs font-medium text-badge-warning-text ring-1 ring-inset ring-warning/30">
          Low: {remaining}
        </span>
      );
    }
    return (
      <span className="mt-1 inline-flex items-center rounded-md bg-badge-success-bg px-2 py-0.5 text-xs font-medium text-badge-success-text ring-1 ring-inset ring-success/30">
        Stock: {remaining}
      </span>
    );
  };

  // Derived totals from last server receipt (authoritative after checkout)
  const serverSub = toNum(lastReceipt?.totals?.subtotal);
  const serverDisc = toNum(lastReceipt?.totals?.discount);
  const serverTax = toNum(lastReceipt?.totals?.tax);
  const serverFees = toNum(lastReceipt?.totals?.fees);
  const serverGrand = toNum(lastReceipt?.totals?.grand_total);

  // Derived totals from live server quote (authoritative before checkout)
  const quoteSub = toNum(quote?.subtotal);
  const quoteTax = toNum(quote?.tax_total);
  const quoteGrand = toNum(quote?.grand_total);
  const quoteDisc = toNum(quote?.discount_total);


  // What to show in the panel
  const showDisc = lastReceipt ? serverDisc : (quote ? quoteDisc : 0);
  const showSub = lastReceipt ? serverSub : (quote ? quoteSub : subtotal);
  const showTax = lastReceipt ? serverTax : (quote ? quoteTax : 0);
  const showGrand = lastReceipt ? serverGrand : (quote ? quoteGrand : subtotal);

  function pctText(rate?: string | null) {
    const r = Number(rate || 0);
    if (!isFinite(r) || r <= 0) return null;
    return `${Math.round(r * 100)}% OFF`;
  }
  function moneyText(amount?: string | null) {
    const a = Number(amount || 0);
    if (!isFinite(a) || a <= 0) return null;
    return `-$${a.toFixed(2)}`;
  }

  function ruleMatchesVariant(rule: DiscountRule, v: VariantLite): boolean {
    const target = (rule.target || "ALL").toUpperCase();

    // Try multiple places/keys for tax category & product id that appear in your payloads
    const vcat = (
      (v as any).tax_category?.code ||
      (v as any).tax_category_code ||
      (v as any).product?.tax_category?.code ||            // ← product-level category
      (v as any).product_tax_category_code ||              // ← flat product cat code, if present
      ""
    ).toString().toUpperCase();

    const prodIdRaw =
      (v as any).product_id ??
      (v as any).product?.id ??
      (v as any).productId ??                              // ← be liberal with naming
      (v as any).productID ??
      null;
    const prodId = prodIdRaw != null ? Number(prodIdRaw) : null;

    if (target === "ALL") return true;

    if (target === "CATEGORY") {
      const codes = (rule.categories || []).map(c => (c.code || "").toUpperCase());
      if (codes.length === 0) return true;                  // empty set means "all"
      return vcat !== "" && codes.includes(vcat);
    }

    if (target === "PRODUCT") {
      const ids = (rule.product_ids || []).map(Number);
      return prodId != null && ids.includes(prodId);
    }

    if (target === "VARIANT") {
      const ids = (rule.variant_ids || []).map(Number);
      return ids.includes(Number((v as any).id));
    }

    return false;
  }

  type Badge = {
    id: number;
    name: string;
    text: string;     // short value like "20% OFF" or "-$5.00 (receipt)"
    label: string;    // "RULE NAME — 20% OFF"
    kind: "auto" | "coupon";
  };


  function badgesForVariant(
    v: VariantLite,
    autoRules: DiscountRule[],
    couponRules: DiscountRule[],
  ): Badge[] {
    const seen = new Set<number>();
    const out: Badge[] = [];

    const cands: Array<{ rule: DiscountRule; kind: "auto" | "coupon" }> = [];
    for (const r of autoRules) if (ruleMatchesVariant(r, v)) cands.push({ rule: r, kind: "auto" });
    for (const r of couponRules) if (ruleMatchesVariant(r, v)) cands.push({ rule: r, kind: "coupon" });
    if (cands.length === 0) return out;

    // sort by priority → id
    cands.sort((a, b) => (a.rule.priority - b.rule.priority) || (a.rule.id - b.rule.id));

    for (const { rule, kind } of cands) {
      if (seen.has(rule.id)) continue; // de-dupe just in case
      seen.add(rule.id);

      let text = rule.basis === "PCT" ? pctText(rule.rate) : moneyText(rule.amount);
      if (!text) text = "Discount";
      if (rule.apply_scope === "RECEIPT") text += " (receipt)";

      const name = rule.name || rule.code || "Discount";
      const baseLabel = `${name} — ${text}`;
      const label = kind === "coupon" ? `Coupon: ${baseLabel}` : baseLabel;

      out.push({ id: rule.id, name, text, label, kind });
    }
    return out;
  }

  type PricePreview = { orig: number; final: number; hasReceipt: boolean };

  function pricePreviewForVariant(
    v: VariantLite,
    autoRules: DiscountRule[],
    couponRules: DiscountRule[],
  ): PricePreview | null {
    const orig = Number((v as any).price ?? v.price);
    if (!isFinite(orig) || orig <= 0) return null;

    // collect all rules that touch this variant
    const lineRules = [...autoRules, ...couponRules]
      .filter(r => (r.apply_scope || "LINE").toUpperCase() === "LINE")
      .filter(r => ruleMatchesVariant(r, v));

    const receiptRulesExist = [...autoRules, ...couponRules]
      .some(r => (r.apply_scope || "LINE").toUpperCase() === "RECEIPT" && ruleMatchesVariant(r, v));

    if (lineRules.length === 0) {
      // No line discount; only show a hint if receipt-level savings exist
      return receiptRulesExist ? { orig, final: orig, hasReceipt: true } : null;
    }

    // Sort by priority then id (matches your badge ordering)
    lineRules.sort((a, b) => (a.priority - b.priority) || (a.id - b.id));

    // Backend sums percent-and-flat against the same base (non-compounding).
    // Mirror that: each rule is applied on 'orig'.
    let discount = 0;
    for (const r of lineRules) {
      const basis = (r.basis || "PCT").toUpperCase();
      const rate = Number(r.rate ?? 0);
      const amount = Number(r.amount ?? 0);

      const amt = basis === "PCT" ? orig * rate : amount;
      if (amt > 0) discount += amt;

      // respect non-stackable when present
      const stackable = (r as any).stackable;
      if (stackable === false) break;
    }

    if (discount > orig) discount = orig;
    const final = Math.max(0, orig - discount);
    return { orig, final, hasReceipt: receiptRulesExist };
  }





  return (
    <>
      {stores.length === 0 && (
        <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg w-full rounded-2xl border border-border bg-card p-6 text-center shadow">
            <h2 className="text-xl font-semibold mb-2">No store access</h2>
            <p className="text-muted-foreground">
              You are not assigned to any store. Please contact your store administrator.
            </p>
          </div>
        </div>
      )}

      {stores.length > 0 && (
        <div className="flex min-h-[calc(100vh-3rem)] bg-background text-foreground">
          {/* Left: Catalog */}
          <div className="flex-1 flex flex-col min-h-0 border-r border-border p-4">
            {/* Store selector + Search */}
            <div className="mb-3 flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
                <Store className="h-4 w-4 text-muted-foreground" />
                <select
                  value={storeId ?? ""}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setStoreId(v);
                    const selected = stores.find(s => s.id === v);
                    if (selected) {
                      setCurrency({
                        code: selected.currency_code || "USD",
                        symbol: selected.currency_symbol || undefined,
                        precision: selected.currency_precision ?? 2,
                      });
                    }
                    localStorage.setItem(STORE_KEY, String(v));
                  }}
                  className="bg-transparent outline-none"
                >
                  {stores.map(s => (
                    <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-1 items-center gap-2 rounded-lg bg-muted px-3 py-2">
                <Search className="h-5 w-5 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name / SKU / barcode…"
                  className="flex-1 bg-transparent placeholder:text-muted-foreground focus:outline-none"
                />
              </div>
            </div>

            <div className="p-4 border-b border-border flex items-center gap-2">
              <input
                value={coupon}
                onChange={(e) => {
                  setCoupon(e.target.value.toUpperCase());
                  setCouponOk(null);
                  setCouponMsg(null);
                }}
                placeholder="Coupon code"
                className="flex-1 rounded-lg bg-muted px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <button
                onClick={async () => {
                  try {
                    const sub = quote ? parseFloat(quote.subtotal) : subtotal;
                    const c = await validateCoupon(coupon, sub);
                    // build next list (avoid duplicates)
                    const newEntry = { code: coupon.toUpperCase(), name: c.name || c.code };
                    const next = appliedCoupons.some(ac => ac.code.toUpperCase() === newEntry.code)
                      ? appliedCoupons
                      : [...appliedCoupons, newEntry];

                    setAppliedCoupons(next);
                    // save coupon rule (for tile badges)
                    if ((c as any).rule) {
                      setCouponRuleByCode(prev => ({ ...prev, [newEntry.code]: (c as any).rule }));
                      setCouponDiscRules(prev => {
                        const r = (c as any).rule as DiscountRule;
                        return prev.some(x => x.id === r.id) ? prev : [...prev, r];
                      });
                    }

                    setCouponOk(true);
                    setCouponMsg(`Applied: ${next.map(x => x.name || x.code).join(", ")}`);
                    setCoupon(""); // clear input

                    // re-quote immediately with all coupons
                    const { quote: q, currency: cur } = await quoteTotals({
                      store_id: storeId!,
                      lines: quoteLines,
                      coupon_codes: next.map(x => x.code),
                    });
                    setQuote(q);
                    if (cur) {
                      setCurrency({
                        code: cur.code || "USD",
                        symbol: cur.symbol || undefined,
                        precision: cur.precision ?? currency.precision ?? 2,
                      });
                    }

                  } catch (err: any) {
                    setCouponOk(false);
                    setCouponMsg(err?.message || "Invalid coupon");
                  }
                }}
                disabled={!coupon.trim()}
                className="rounded bg-muted px-3 py-2 hover:bg-muted disabled:opacity-50"
              >
                Apply
              </button>
            </div>

            {/* Applied coupon chips */}
            {appliedCoupons.length > 0 && (
              <div className="px-4 pb-2 flex flex-wrap gap-2">
                {appliedCoupons.map((ac) => (
                  <span key={ac.code} className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-sm">
                    <span>{ac.name || ac.code}</span>
                    <button
                      onClick={async () => {
                        const next = appliedCoupons.filter(x => x.code !== ac.code);
                        setAppliedCoupons(next);

                        // remove its rule (if we stored it)
                        setCouponDiscRules(prev => {
                          const r = couponRuleByCode[ac.code];
                          return r ? prev.filter(x => x.id !== r.id) : prev;
                        });
                        setCouponRuleByCode(prev => {
                          const { [ac.code]: _, ...rest } = prev;
                          return rest;
                        });


                        // keep status/message in sync with what remains
                        if (next.length > 0) {
                          setCouponOk(true);
                          setCouponMsg(`Applied: ${next.map(x => x.name || x.code).join(", ")}`);
                        } else {
                          setCouponOk(null);
                          setCouponMsg(null);
                        }

                        if (storeId && quoteLines.length) {
                          const { quote: q, currency: cur } = await quoteTotals({
                            store_id: storeId,
                            lines: quoteLines,
                            coupon_codes: next.map(x => x.code),
                          });
                          setQuote(q);
                          if (cur) {
                            setCurrency({
                              code: cur.code || "USD",
                              symbol: cur.symbol || undefined,
                              precision: cur.precision ?? currency.precision ?? 2,
                            });
                          }
                        }
                      }}
                      className="rounded bg-muted px-1.5 py-0.5 text-xs hover:bg-muted"
                      title="Remove"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {couponMsg && (
              <div className={`px-4 pb-2 text-sm ${couponOk ? "text-success" : "text-error"}`}>
                {couponMsg}
              </div>
            )}



            {/* Product grid */}
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {products.map((p) => {
                  const onHand = toInt((p as any).on_hand, 0);
                  const remaining = Math.max(0, onHand - qtyInCart(p.id));
                  const disabled = remaining <= 0;
                  return (
                    <button
                      key={p.id}
                      onClick={() => addToCart(p)}
                      disabled={disabled}
                      className={`relative rounded-xl p-3 text-left transition-colors ${disabled
                        ? "bg-muted/60 cursor-not-allowed opacity-60"
                        : "bg-muted hover:bg-muted"
                        }`}
                      title={disabled ? "Out of stock" : "Add to cart"}
                    >
                      {/* DISCOUNT BADGES (multi) — positioned at card level to avoid clipping */}
                      {(() => {
                        const list = badgesForVariant(p, autoDiscRules, couponDiscRules);
                        if (list.length === 0) return null;

                        const shown = list.slice(0, 1);           // show up to n pills
                        const extra = list.length - shown.length; // rest go in tooltip

                        return (
                          <div className="absolute top-2 left-2 z-10 flex flex-col gap-1 pointer-events-none">
                            {shown.map(b => (
                              <span
                                key={b.id}
                                className={`pointer-events-auto rounded-full px-2 py-0.5 text-[11px] font-semibold shadow max-w-[14rem] truncate
                                              ${b.kind === "coupon" ? "bg-info text-info-foreground" : "bg-success text-success-foreground"}`}
                                title={b.label}   // full on native hover as well
                              >
                                {b.label}
                              </span>
                            ))}

                            {extra > 0 && (
                              <div className="relative group pointer-events-auto">
                                <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-muted text-muted-foreground shadow">
                                  +{extra} more
                                </span>
                                {/* Hover tooltip */}
                                <div
                                  className="absolute left-0 top-full mt-1 hidden group-hover:block z-20
                                              max-w-[16rem] rounded-md border border-border bg-card p-2 text-xs text-muted-foreground shadow-lg"
                                >
                                  <ul className="space-y-1">
                                    {list.slice(shown.length).map(b => (
                                      <li key={`more-${b.id}`} className="flex items-center gap-2">
                                        <span className={`inline-block h-2.5 w-2.5 rounded-full
                                                            ${b.kind === "coupon" ? "bg-info" : "bg-success"}`} />
                                        <span className="truncate">{b.label}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}


                      <div className="relative h-24 md:h-28 flex items-center justify-center bg-muted/40 rounded-lg mb-2 overflow-hidden">
                        {imgFor(p) ? (
                          <img
                            src={imgFor(p)}
                            alt={p.name}
                            className="h-full w-full object-contain"
                            onError={(e) => { e.currentTarget.style.display = "none"; }}
                          />
                        ) : (
                          <span className="text-muted-foreground">🛒</span>
                        )}
                      </div>






                      <div className="font-medium truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {(p as any).variant_name || p.sku || ""}
                      </div>
                      {/* <div className="text-sm text-muted-foreground">${toMoney(p.price)}</div> */}
                      {(() => {
                        const pv = pricePreviewForVariant(p, autoDiscRules, couponDiscRules);
                        if (!pv) {
                          return <div className="text-sm text-muted-foreground">{money(p.price)}</div>;
                        }
                        const orig = toMoney(pv.orig);
                        const fin = toMoney(pv.final);
                        return (
                          <div className="text-sm">
                            {pv.final < pv.orig ? (
                              <>
                                <span className="text-muted-foreground line-through mr-2">{money(orig)}</span>
                                <span className="text-success font-semibold">{money(fin)}</span>
                                {pv.hasReceipt && (
                                  <span className="ml-2 text-xs text-muted-foreground">(more at checkout)</span>
                                )}
                              </>
                            ) : (
                              <>
                                <span className="text-muted-foreground">{money(orig)}</span>
                                {pv.hasReceipt && (
                                  <span className="ml-2 text-xs text-muted-foreground">(savings at checkout)</span>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })()}

                      <StockBadge remaining={remaining} />
                    </button>
                  );
                })}
                {products.length === 0 && (
                  <div className="col-span-full text-muted-foreground">No products</div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Cart */}
          <div className="w-[30rem] h-screen flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="flex items-center gap-2 font-semibold">
                <span className="relative inline-block" aria-label={`Cart (${cartCount} items)`}>
                  <ShoppingCart className="h-5 w-5" />
                  {cartCount > 0 && (
                    <span
                      className="
                    absolute -top-2 -right-2 min-w-[1.1rem] h-[1.1rem]
                    rounded-full bg-success px-1 text-[0.70rem] leading-[1.1rem]
                    text-foreground font-bold text-center shadow
                    ring-2 ring-background
                    animate-[pop_150ms_ease-in-out]
                  "
                    >
                      {cartCount}
                    </span>
                  )}
                </span>
                Cart
              </h2>
              {/* NEW: Customer selector pill */}
              <button
                type="button"
                onClick={() => setCustomerModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground hover:bg-muted"
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] uppercase">
                  {customer?.name
                    ? customer.name.charAt(0)
                    : "👤"}
                </span>
                <span className="truncate max-w-[10rem]">
                  {customer?.name || "Select customer"}
                </span>
              </button>
            </div>

            {/* Barcode */}
            <form onSubmit={onBarcodeSubmit} className="p-4 border-b border-border flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-muted-foreground" />
              <input
                ref={barcodeRef}
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Scan barcode then Enter"
                className="flex-1 rounded-lg bg-muted px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </form>

            {/* Lines */}
            <div
              ref={cartListRef}
              className="flex-1 overflow-y-auto p-4 space-y-3"
              style={{ paddingBottom: footerH ? footerH + 16 : undefined }}  // +16 for a little breathing room
            >

              {cart.map((l) => (
                <div
                  key={l.variant.id}
                  data-vid={l.variant.id}
                  style={{ scrollMarginBottom: footerH ? footerH + 16 : undefined }}
                  className={`flex flex-col gap-2 rounded-xl p-4 shadow-sm border border-border bg-muted/90 transition-colors
                              ${l.variant.id === lastAddedId && flashToken
                      ? "bg-success/10 ring-2 ring-success/60 animate-[pop_150ms_ease-in-out]"
                      : "bg-muted"
                    }`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium leading-snug break-words whitespace-normal">
                      {l.variant.name}
                    </div>
                    <div className="text-xs text-muted-foreground break-words whitespace-normal">
                      {(l.variant as any).variant_name || l.variant.sku || ""}
                    </div>

                    <hr className="border-border/60 my-1" />
                    <div className="text-sm text-muted-foreground">
                      {money(l.variant.price)} × {l.qty}
                      {(() => {
                        const qLine = quote?.lines?.find(
                          (ln: any) => ln.variant_id === l.variant.id
                        );
                        if (!qLine) return null;

                        const dSum = qLine.discounts
                          ? qLine.discounts.reduce((s: number, x: any) => s + parseFloat(x.amount || "0"), 0)
                          : 0;
                        const tSum = qLine.taxes
                          ? qLine.taxes.reduce((s: number, x: any) => s + parseFloat(x.amount || "0"), 0)
                          : 0;

                        if (dSum === 0 && tSum === 0) return null;

                        return (
                          <span className="ml-2">
                            {dSum > 0 && (
                              <span className="text-success/90">
                                {" "}–{money(dSum)} discounts
                              </span>
                            )}
                            {tSum > 0 && (
                              <span className="text-warning/90">
                                {dSum > 0 ? ", " : " "}
                                +{money(tSum)} tax
                              </span>
                            )}
                          </span>
                        );
                      })()}
                    </div>


                    {/* Per-line breakdown (expand/collapse with smooth transition) */}
                    <div
                      className={`transition-all duration-600 ease-in-out overflow-hidden ${expandedLines[l.variant.id]
                        ? "max-h-64 opacity-100 mt-2"
                        : "max-h-0 opacity-0"
                        }`}
                    >
                      {expandedLines[l.variant.id] && (() => {
                        const qLine = quote?.lines?.find((ln: any) => ln.variant_id === l.variant.id);
                        if (!qLine) return null;

                        const hasDisc = Array.isArray(qLine.discounts) && qLine.discounts.length > 0;
                        const hasTax = Array.isArray(qLine.taxes) && qLine.taxes.length > 0;
                        if (!hasDisc && !hasTax)
                          return <div className="text-xs text-muted-foreground">No adjustments on this line.</div>;

                        return (
                          <div className="rounded-lg bg-muted/80 border border-border p-3 shadow-inner space-y-1">
                            {hasDisc && (
                              <>
                                <div className="text-[11px] font-semibold text-success uppercase tracking-wide mb-1">
                                  Discounts
                                </div>
                                <ul className="mb-2 space-y-0.5">
                                  {qLine.discounts.map((d: any, idx: number) => (
                                    <li
                                      key={`${d.rule_id ?? d.code ?? idx}`}
                                      className="flex justify-between text-xs"
                                    >
                                      <span className="truncate">{d.name}</span>
                                      <span className="tabular-nums">{money(-toNum(d.amount))}</span>
                                    </li>
                                  ))}
                                </ul>
                              </>
                            )}

                            {hasTax && (
                              <>
                                <div className="text-[11px] font-semibold text-warning uppercase tracking-wide mb-1">
                                  Taxes
                                </div>
                                <ul className="space-y-0.5">
                                  {qLine.taxes.map((t: any, idx: number) => (
                                    <li
                                      key={`${t.rule_id ?? t.code ?? idx}`}
                                      className="flex justify-between text-xs"
                                    >
                                      <span className="truncate">{t.name}</span>
                                      <span className="tabular-nums">+{money(t.amount)}</span>
                                    </li>
                                  ))}
                                </ul>
                              </>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => changeQty(l.variant.id, -1)}
                      className="rounded bg-muted p-1 hover:bg-muted"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                      <input
                        type="number"
                        min={0}
                        max={999}
                        value={l.qty}
                        onChange={(e) => {
                          const raw = e.target.value;
                          let n = parseInt(raw, 10);
                          if (!Number.isFinite(n) || n < 0) n = 0;

                          const delta = n - l.qty;
                          if (delta !== 0) {
                            changeQty(l.variant.id, delta);
                          }
                        }}
                        className="w-14 rounded bg-card px-1.5 py-1 text-center text-sm tabular-nums border border-border focus:outline-none focus:ring-1 focus:ring-success"
                      />
                    <button
                      onClick={() => changeQty(l.variant.id, +1)}
                      className="rounded bg-muted p-1 hover:bg-muted"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => removeLine(l.variant.id)}
                      className="text-error hover:text-error/80"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <LineToggle
                      open={!!expandedLines[l.variant.id]}
                      onClick={() =>
                        setExpandedLines((prev) => ({
                          ...prev,
                          [l.variant.id]: !prev[l.variant.id],
                        }))
                      }
                    />
                  </div>

                </div>
              ))}
              {cart.length === 0 && <div className="text-center text-muted-foreground">No items yet</div>}
            </div>

            {/* Totals + actions */}
            <div
              ref={cartTotalsRef}
              className="border-t border-border p-4 space-y-2 sticky bottom-0 bg-background"
            >
              {/* Optional error from quote */}
              {quoteError && (
                <div className="mb-2 rounded-md border border-error/30 bg-error/10 px-3 py-2 text-error">
                  {quoteError}
                </div>
              )}

              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="tabular-nums">{money(showSub)}</span>
              </div>

              {/* Optional per-rule discount lines (if backend ever returns them) */}
              {!lastReceipt && (quote?.discount_by_rule || []).map((d: any) => (
                <div key={d.rule_id ?? d.code ?? d.name} className="flex justify-between text-sm opacity-90">
                  <span>{d.name}</span>
                  <span className="tabular-nums">{money(-toNum(d.amount))}</span>
                </div>
              ))}

              {/* Discount total (from server quote, before checkout) */}
              {!!showDisc && !lastReceipt && (
                <div className="flex justify-between text-sm">
                  <span>Total Discounts</span>
                  <span className="tabular-nums">{money(-showDisc)}</span>
                </div>
              )}

              {/* Per-rule tax lines (from server quote, before checkout) */}
              {!lastReceipt && (quote?.tax_by_rule || []).map((r: any) => (
                <div key={r.rule_id ?? r.code ?? r.name} className="flex justify-between text-sm opacity-90">
                  <span>{r.name}</span>
                  <span className="tabular-nums">{money(r.amount)}</span>
                </div>
              ))}

              <div className="flex justify-between">
                <span>Total Taxes</span>
                <span className="tabular-nums">{money(showTax)}</span>
              </div>

              <div className="flex justify-between font-semibold text-lg">
                <span>Total</span><span className="tabular-nums">{money(showGrand)}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-3">
                <button
                  onClick={() => setShowCash(true)}
                  disabled={paying || cart.length === 0}
                  className="flex items-center justify-center gap-2 rounded-lg bg-success py-2 font-medium hover:bg-success/90 disabled:opacity-50"
                >
                  <Wallet className="h-4 w-4" /> Cash
                </button>
                <button
                  onClick={() => setShowCard(true)}
                  disabled={paying || cart.length === 0}
                  className="flex items-center justify-center gap-2 rounded-lg bg-info py-2 font-medium hover:bg-info/90 disabled:opacity-50"
                >
                  <CreditCard className="h-4 w-4" /> Card
                </button>
                <button
                  onClick={() => setMsg("Order placed on hold (client-only for now)")}
                  disabled={cart.length === 0}
                  className="flex items-center justify-center gap-2 rounded-lg bg-warning py-2 font-medium hover:bg-warning/90 col-span-2 disabled:opacity-50"
                >
                  <PauseCircle className="h-4 w-4" /> Hold
                </button>
                <button
                  onClick={() => { clearCart(); setMsg("Order voided (client-only)"); }}
                  disabled={cart.length === 0}
                  className="flex items-center justify-center gap-2 rounded-lg bg-error py-2 font-medium hover:bg-error/90 col-span-2 disabled:opacity-50"
                >
                  <XCircle className="h-4 w-4" /> Void
                </button>
              </div>

              {msg && <div className="mt-3 rounded-lg bg-muted p-2 text-sm text-muted-foreground">{msg}</div>}
            </div>
          </div>


          {/* ---- CUSTOMER MODAL ---- */}
          <CustomerModal
            open={customerModalOpen}
            onClose={() => setCustomerModalOpen(false)}
            onSelect={(c) => setCustomer(c)}
          />


          {/* ---- CASH MODAL ---- */}
          {showCash && (
            <CashModal
              total={showGrand}
              currency={currency}
              onClose={() => setShowCash(false)}
              onSubmit={(cashAmount) =>
                submitCheckout({
                  type: "CASH",
                  amount: toMoney(showGrand),
                  received: toMoney(cashAmount),
                })
              }
            />
          )}

          {/* ---- CARD MODAL ---- */}
          {showCard && (
            <CardModal
              total={showGrand}
              currency={currency}
              onClose={() => setShowCard(false)}
              onSubmit={(card) =>
                submitCheckout({
                  type: "CARD",
                  amount: toMoney(showGrand),
                  card_brand: card.brand,
                  card_last4: card.last4,
                  card_auth_code: card.auth,
                  card_reference: card.reference,
                })
              }
            />
          )}

          {/* ---- RECEIPT MODAL ---- */}
          {receiptOpen && lastReceipt && (
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
              onClick={() => setReceiptOpen(false)}
            >
              <div
                className="w-[520px] max-w-[90vw] rounded-xl bg-card text-foreground shadow-2xl ring-1 ring-border"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-border p-4">
                  <div className="font-semibold">Receipt #{lastReceipt?.receipt_no}</div>
                  <div className="text-muted-foreground text-sm">
                    {lastReceipt?.store?.code} — {lastReceipt?.store?.name}
                  </div>
                </div>

                <div className="max-h-[70vh] overflow-y-auto p-4 space-y-3">
                  <div className="text-sm text-muted-foreground">
                    {new Date(lastReceipt?.created_at || Date.now()).toLocaleString()}
                  </div>

                  {lastReceipt?.customer && (
                    <div className="text-sm text-muted-foreground">
                      Customer:{" "}
                      <span className="font-medium">
                        {lastReceipt.customer.name || `#${lastReceipt.customer.id}`}
                      </span>
                      {lastReceipt.customer.email && (
                        <span className="text-muted-foreground"> • {lastReceipt.customer.email}</span>
                      )}
                      {lastReceipt.customer.phone && (
                        <span className="text-muted-foreground"> • {lastReceipt.customer.phone}</span>
                      )}
                    </div>
                  )}


                  <div className="rounded-lg bg-muted p-3">
                    {(lastReceipt?.lines || []).map((l: any) => (
                      <div key={`${l.variant_id}-${l.sku}-${l.name}`} className="flex items-center justify-between py-1">
                        <div className="min-w-0 pr-2">
                          <div className="truncate">{l.name}</div>
                          <div className="text-xs text-muted-foreground">{l.sku || "-"}</div>
                        </div>
                        <div className="tabular-nums text-right">
                          <div className="text-muted-foreground">{l.qty} × {money(l.unit_price)}</div>
                          <div className="font-medium">{money(l.line_subtotal ?? l.line_total ?? l.line_net)}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Subtotal</span>
                        <span className="tabular-nums">{money(lastReceipt?.totals?.subtotal || "0.00")}</span>
                      </div>
                      {(lastReceipt?.totals?.discount_by_rule || []).map((d: any) => (
                        <div key={d.rule_id ?? d.code ?? d.name} className="flex justify-between text-sm opacity-90">
                          <span>{d.name}</span>
                          <span className="tabular-nums">{money(-toNum(d.amount))}</span>
                        </div>
                      ))}

                      {!!lastReceipt?.totals?.discount && (
                        <div className="flex justify-between">
                          <span>Total Discounts</span>
                          <span className="tabular-nums">{money(-toNum(lastReceipt?.totals?.discount))}</span>
                        </div>
                      )}
                      {/* NEW: per-rule tax lines, if present */}
                      {(lastReceipt?.totals?.tax_by_rule || []).map((r: any) => (
                        <div key={r.rule_id ?? r.code ?? r.name} className="flex justify-between text-sm opacity-90">
                          <span>{r.name}</span>
                          <span className="tabular-nums">{money(r.amount)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between">
                        <span>Total Taxes</span>
                        <span className="tabular-nums">{money(lastReceipt?.totals?.tax || "0.00")}</span>
                      </div>
                      {!!lastReceipt?.totals?.fees && (
                        <div className="flex justify-between">
                          <span>Fees</span>
                          <span className="tabular-nums">{money(lastReceipt?.totals?.fees)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-lg font-semibold">
                        <span>Total</span>
                        <span className="tabular-nums">{money(lastReceipt?.totals?.grand_total || "0.00")}</span>
                      </div>
                    </div>

                    {lastReceipt?.payment && (
                      <div className="rounded-lg bg-muted p-3 text-sm">
                        <div>Payment: <span className="font-medium">{lastReceipt.payment.type}</span></div>
                        {lastReceipt.payment.received && (<div>Received: {money(lastReceipt.payment.received)}</div>)}
                        {lastReceipt.payment.change && (<div>Change: {money(lastReceipt.payment.change)}</div>)}
                      </div>
                    )}

                  {lastQR && (
                    <div className="flex justify-center">
                      <img src={lastQR} alt="QR" className="h-40 w-40 rounded bg-white p-2" />
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-border p-3">
                  <button
                    onClick={() => {
                      const html = buildReceiptHtml(lastReceipt, lastQR);
                      printHtml(html);
                    }}
                    className="rounded-lg bg-primary px-3 py-2 font-medium hover:bg-primary/90"
                  >
                    Print
                  </button>
                  <button
                    onClick={() => setReceiptOpen(false)}
                    className="rounded-lg bg-muted px-3 py-2 font-medium hover:bg-muted"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ---------------------------- Cash Modal ---------------------------- */
function CashModal({
  total, onClose, onSubmit, currency,
}: { total: number; onClose: () => void; onSubmit: (cashAmount: number) => void; currency: CurrencyInfo; }) {
  const [tendered, setTendered] = useState<string>("");
  const amount = parseFloat(tendered || "0");
  const change = Math.max(0, amount - total);
  const exact = Math.abs(amount - total) < 0.005;
  const canPay = amount >= total - 0.005;
  const m = (v: number) => formatCurrency(v, currency);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4">
      <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-xl">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h3 className="font-semibold">Cash Payment</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span>Total due</span>
            <span className="font-semibold">{m(total)}</span>
          </div>
          <label className="block text-sm">
            Cash tendered
            <input
              autoFocus inputMode="decimal" value={tendered}
              onChange={(e) => setTendered(e.target.value)}
              placeholder="0.00"
              className="mt-1 w-full rounded-lg bg-muted px-3 py-2 outline-none"
            />
          </label>
          <div className="flex justify-between text-sm">
            <span>Change</span>
            <span className="font-semibold">{m(change)}</span>
          </div>
          {!canPay && (<div className="text-warning text-sm">Insufficient cash. Total is {m(total)}.</div>)}
          <div className="pt-2 flex gap-2">
            <button onClick={() => setTendered(toMoney(total))} className="rounded-lg bg-muted px-3 py-2 text-sm">
              Exact {m(total)}
            </button>
            <button onClick={() => setTendered(toMoney(Math.ceil(total)))} className="rounded-lg bg-muted px-3 py-2 text-sm">
              Round ↑ {m(Math.ceil(total))}
            </button>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 bg-muted hover:bg-muted">Cancel</button>
          <button onClick={() => canPay && onSubmit(amount)} disabled={!canPay}
            className="rounded-lg px-4 py-2 bg-success hover:bg-success/90 disabled:opacity-50">
            Take Cash
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- Card Modal ---------------------------- */
function CardModal({
  total, onClose, onSubmit, currency,
}: { total: number; onClose: () => void; onSubmit: (card: { brand?: string; last4?: string; auth?: string; reference?: string }) => void; currency: CurrencyInfo; }) {
  const [brand, setBrand] = useState<string>("VISA");
  const [last4, setLast4] = useState<string>("");
  const [auth, setAuth] = useState<string>("");
  const [reference, setReference] = useState<string>("");
  const canPay = /^\d{4}$/.test(last4 || "") && (auth?.length ?? 0) >= 4;
  const m = (v: number) => formatCurrency(v, currency);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4">
      <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-xl">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h3 className="font-semibold">Card Payment</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-muted-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span>Total to charge</span>
            <span className="font-semibold">{m(total)}</span>
          </div>
          <label className="block text-sm">
            Card brand
            <select value={brand} onChange={(e) => setBrand(e.target.value)}
              className="mt-1 w-full rounded-lg bg-muted px-3 py-2 outline-none">
              <option>VISA</option><option>MASTERCARD</option><option>AMEX</option><option>DISCOVER</option>
              <option value="">Other / Unknown</option>
            </select>
          </label>
          <label className="block text-sm">
            Last 4 digits
            <input inputMode="numeric" maxLength={4} value={last4}
              onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))}
              placeholder="1234" className="mt-1 w-full rounded-lg bg-muted px-3 py-2 outline-none" />
          </label>
          <label className="block text-sm">
            Auth code
            <input value={auth} onChange={(e) => setAuth(e.target.value)}
              placeholder="Gateway auth code"
              className="mt-1 w-full rounded-lg bg-muted px-3 py-2 outline-none" />
          </label>
          <label className="block text-sm">
            Reference (optional)
            <input value={reference} onChange={(e) => setReference(e.target.value)}
              placeholder="Transaction reference"
              className="mt-1 w-full rounded-lg bg-muted px-3 py-2 outline-none" />
          </label>
          <p className="text-xs text-muted-foreground">
            (This UI assumes you’ve already authorized the card on a terminal and are recording the result here.)
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 bg-muted hover:bg-muted">Cancel</button>
          <button onClick={() => canPay && onSubmit({ brand, last4, auth, reference })}
            disabled={!canPay} className="rounded-lg px-4 py-2 bg-info hover:bg-info/90 disabled:opacity-50">
            Charge Card
          </button>
        </div>
      </div>
    </div>
  );
}

type CustomerModalProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (c: PosCustomer | null) => void;
};

const CustomerModal: React.FC<CustomerModalProps> = ({ open, onClose, onSelect }) => {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PosCustomer[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");


  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setErrorMsg(null);

    setNewName("");
    setNewEmail("");
    setNewPhone("");
    setCreateError(null);
    setCreating(false);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const id = setTimeout(async () => {
      try {
        setLoading(true);
        setErrorMsg(null);
        const list = await (await import("./api")).searchCustomers({ query: q });
        setResults(Array.isArray(list) ? list : []);
      } catch (e: any) {
        setErrorMsg(e?.message || "Failed to search customers");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(id);
  }, [open, query]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    const name = newName.trim();
    const email = newEmail.trim();
    const phone = newPhone.trim();

    if (!name && !email && !phone) {
      setCreateError("Please enter at least a name, email, or phone.");
      return;
    }

    try {
      setCreating(true);
      setCreateError(null);

      const api = await import("./api");
      const created = await api.createCustomer({
        // we stuff full name into first_name for quick POS creation
        first_name: name || undefined,
        email: email || undefined,
        phone_number: phone || undefined,
      });

      const selected: PosCustomer = {
        id: created.id,
        name:
          created.full_name ||
          name ||
          created.email ||
          created.phone_number ||
          `Customer #${created.id}`,
        email: created.email || undefined,
        phone: created.phone_number || undefined,
      };

      onSelect(selected);
      onClose();
    } catch (err: any) {
      setCreateError(err?.message || "Failed to create customer");
    } finally {
      setCreating(false);
    }
  };


  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/70 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-card border border-border shadow-xl">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h3 className="font-semibold text-foreground">Select customer</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-muted-foreground">
            ×
          </button>
        </div>
        <div className="p-4 space-y-3">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, email, or phone…"
            className="w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          {errorMsg && (
            <div className="rounded-md border border-error/40 bg-error/20 px-3 py-2 text-xs text-error-foreground">
              {errorMsg}
            </div>
          )}
          {loading && <div className="text-sm text-muted-foreground">Searching…</div>}
          {!loading && results.length === 0 && query.trim().length >= 2 && !errorMsg && (
            <div className="text-sm text-muted-foreground">No customers found for “{query.trim()}”.</div>
          )}
          <div className="max-h-64 overflow-y-auto space-y-1">
            {results.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => { onSelect(c); onClose(); }}
                className="w-full flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-muted text-left"
              >
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[11px] font-medium text-muted-foreground">
                    {String(c.name || c.email || c.phone || "?").trim().charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-medium text-foreground truncate">{c.name || "Unnamed"}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {c.email || c.phone || "No contact on file"}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Quick create section */}
          <div className="pt-3 mt-2 border-t border-border space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Quick create
            </div>
            <form onSubmit={handleCreate} className="space-y-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Full name"
                className="w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              <div className="flex gap-2">
                <input
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="Email (optional)"
                  className="flex-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
                <input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="Phone (optional)"
                  className="flex-1 rounded-lg bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
              </div>
              {createError && (
                <div className="text-xs text-error">
                  {createError}
                </div>
              )}
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-md bg-success px-3 py-1.5 text-xs font-medium text-success-foreground hover:bg-success/90 disabled:opacity-50"
                >
                  {creating ? "Creating…" : "Create & select"}
                </button>
              </div>
            </form>
          </div>

        </div>
        <div className="flex items-center justify-between border-t border-border p-3">
          <button
            type="button"
            onClick={() => { onSelect(null); onClose(); }}
            className="text-xs text-muted-foreground hover:underline"
          >
            Clear selection
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-muted px-3 py-1.5 text-sm text-foreground hover:bg-muted"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
