// src/features/pos/PosScreen.tsx
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
} from "./api";

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


  const [paying, setPaying] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // legacy small summary (kept)
  const [receipt, setReceipt] = useState<ReceiptInfo | null>(null);

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
    const lines = (r?.lines || []).map(
      (l: any) => `
        <tr>
          <td style="padding:4px 0">${l.name} (${l.sku || "-"})</td>
          <td style="text-align:right;padding:4px 0">${l.qty}</td>
          <td style="text-align:right;padding:4px 0">$${l.unit_price}</td>
          <td style="text-align:right;padding:4px 0">$${l.line_subtotal ?? l.line_total ?? l.line_net}</td>
        </tr>`
    ).join("");

    const taxLines = (r?.totals?.tax_by_rule || [])
      .map((t: any) =>
        `<tr><td>${t.name}</td><td style="text-align:right">$${t.amount}</td></tr>`
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
  </div>
  <div class="bar"></div>
  <table>
    <thead><tr><th style="text-align:left">Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Total</th></tr></thead>
    <tbody>${lines}</tbody>
  </table>
  <div class="bar"></div>
  <table class="totals">
    <tr><td>Subtotal</td><td style="text-align:right">$${r?.totals?.subtotal || "0.00"}</td></tr>
    ${taxLines}
    ${r?.totals?.discount ? `<tr><td>Total Discounts</td><td style="text-align:right">-$${r.totals.discount}</td></tr>` : ""}
    <tr><td>Total Taxes</td><td style="text-align:right">$${r?.totals?.tax || "0.00"}</td></tr>
    ${r?.totals?.fees ? `<tr><td>Fees</td><td style="text-align:right">$${r.totals.fees}</td></tr>` : ""}
    <tr><td><strong>Grand Total</strong></td><td style="text-align:right"><strong>$${r?.totals?.grand_total || "0.00"}</strong></td></tr>
  </table>
  <div class="bar"></div>
  <div>Cashier: ${r?.cashier?.username || "-"}</div>
  ${r?.payment ? `<div>Payment: ${r.payment.type}${r.payment.received ? ` (received $${r.payment.received})` : ""}${r.payment.change ? `, change $${r.payment.change}` : ""}</div>` : ""}
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
        const list = await searchProducts({ store_id: storeId, query });
        setProducts(list);
      } catch (e: any) {
        setMsg(e.message || "Failed to load products");
      }
    })();
  }, [storeId, query, refreshTick]);

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
        const q = await quoteTotals({
          store_id: storeId!,
          lines: quoteLines,
          coupon_codes: appliedCoupons.map(x => x.code),
        });
        setQuote(q);
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
      };
      const res = await checkout(payload);
      console.log("checkout response", res); // quick sanity check


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
      if ((res as any).receipt) setReceiptOpen(true);

      setMsg(`Sale #${res.sale_id} completed`);
      clearCart();
      setRefreshTick(t => t + 1);
      setAppliedCoupons([]); // clear applied coupons on successful checkout
      setCouponOk(null); // reset validation state
      setCouponMsg(null); // clear the “Applied:” message
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
        <span className="mt-1 inline-flex items-center rounded-md bg-red-600/20 px-2 py-0.5 text-xs font-medium text-red-300 ring-1 ring-inset ring-red-600/30">
          Out of stock
        </span>
      );
    }
    if (remaining <= LOW_STOCK_THRESHOLD) {
      return (
        <span className="mt-1 inline-flex items-center rounded-md bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30">
          Low: {remaining}
        </span>
      );
    }
    return (
      <span className="mt-1 inline-flex items-center rounded-md bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
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

  return (
    <>
      {stores.length === 0 && (
        <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-100 p-6">
          <div className="max-w-lg w-full rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center shadow">
            <h2 className="text-xl font-semibold mb-2">No store access</h2>
            <p className="text-slate-300">
              You are not assigned to any store. Please contact your store administrator.
            </p>
          </div>
        </div>
      )}

      {stores.length > 0 && (
        <div className="flex h-screen bg-slate-950 text-slate-100">
          {/* Left: Catalog */}
          <div className="flex-1 flex flex-col min-h-0 border-r border-slate-800 p-4">
            {/* Store selector + Search */}
            <div className="mb-3 flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2">
                <Store className="h-4 w-4 text-slate-400" />
                <select
                  value={storeId ?? ""}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setStoreId(v);
                    localStorage.setItem(STORE_KEY, String(v));
                  }}
                  className="bg-transparent outline-none"
                >
                  {stores.map(s => (
                    <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-1 items-center gap-2 rounded-lg bg-slate-800 px-3 py-2">
                <Search className="h-5 w-5 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name / SKU / barcode…"
                  className="flex-1 bg-transparent placeholder:text-slate-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="p-4 border-b border-slate-800 flex items-center gap-2">
              <input
                value={coupon}
                onChange={(e) => {
                  setCoupon(e.target.value.toUpperCase());
                  setCouponOk(null);
                  setCouponMsg(null);
                }}
                placeholder="Coupon code"
                className="flex-1 rounded-lg bg-slate-800 px-3 py-2 text-slate-100 placeholder:text-slate-400 focus:outline-none"
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
                    setCouponOk(true);
                    setCouponMsg(`Applied: ${next.map(x => x.name || x.code).join(", ")}`);
                    setCoupon(""); // clear input

                    // re-quote immediately with all coupons
                    const q = await quoteTotals({
                      store_id: storeId!,
                      lines: quoteLines,
                      coupon_codes: next.map(x => x.code),
                    });
                    setQuote(q);

                  } catch (err: any) {
                    setCouponOk(false);
                    setCouponMsg(err?.message || "Invalid coupon");
                  }
                }}
                disabled={!coupon.trim()}
                className="rounded bg-slate-700 px-3 py-2 hover:bg-slate-600 disabled:opacity-50"
              >
                Apply
              </button>
            </div>

            {/* Applied coupon chips */}
            {appliedCoupons.length > 0 && (
              <div className="px-4 pb-2 flex flex-wrap gap-2">
                {appliedCoupons.map((ac) => (
                  <span key={ac.code} className="inline-flex items-center gap-2 rounded-full bg-slate-800 px-3 py-1 text-sm">
                    <span>{ac.name || ac.code}</span>
                    <button
                      onClick={async () => {
                        const next = appliedCoupons.filter(x => x.code !== ac.code);
                        setAppliedCoupons(next);

                        // keep status/message in sync with what remains
                        if (next.length > 0) {
                          setCouponOk(true);
                          setCouponMsg(`Applied: ${next.map(x => x.name || x.code).join(", ")}`);
                        } else {
                          setCouponOk(null);
                          setCouponMsg(null);
                        }

                        if (storeId && quoteLines.length) {
                          const q = await quoteTotals({
                            store_id: storeId,
                            lines: quoteLines,
                            coupon_codes: next.map(x => x.code),
                          });
                          setQuote(q);
                        }
                      }}
                      className="rounded bg-slate-700 px-1.5 py-0.5 text-xs hover:bg-slate-600"
                      title="Remove"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {couponMsg && (
              <div className={`px-4 pb-2 text-sm ${couponOk ? "text-emerald-400" : "text-red-400"}`}>
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
                      className={`rounded-xl p-3 text-left transition-colors ${disabled
                        ? "bg-slate-800/60 cursor-not-allowed opacity-60"
                        : "bg-slate-800 hover:bg-slate-700"
                        }`}
                      title={disabled ? "Out of stock" : "Add to cart"}
                    >
                      <div className="h-24 md:h-28 flex items-center justify-center bg-slate-700/40 rounded-lg mb-2 overflow-hidden">
                        {imgFor(p) ? (
                          <img
                            src={imgFor(p)}
                            alt={p.name}
                            className="h-full w-full object-contain"
                            onError={(e) => { e.currentTarget.style.display = "none"; }}
                          />
                        ) : (
                          <span className="text-slate-400">🛒</span>
                        )}
                      </div>

                      <div className="font-medium truncate">{p.name}</div>
                      <div className="text-xs text-slate-300 mt-0.5 truncate">
                        {(p as any).variant_name || p.sku || ""}
                      </div>
                      <div className="text-sm text-slate-400">${toMoney(p.price)}</div>
                      <StockBadge remaining={remaining} />
                    </button>
                  );
                })}
                {products.length === 0 && (
                  <div className="col-span-full text-slate-400">No products</div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Cart */}
          <div className="w-[420px] h-screen flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <h2 className="flex items-center gap-2 font-semibold">
                <span className="relative inline-block" aria-label={`Cart (${cartCount} items)`}>
                  <ShoppingCart className="h-5 w-5" />
                  {cartCount > 0 && (
                    <span
                      className="
                    absolute -top-2 -right-2 min-w-[1.1rem] h-[1.1rem]
                    rounded-full bg-emerald-500 px-1 text-[0.70rem] leading-[1.1rem]
                    text-slate-900 font-bold text-center shadow
                    ring-2 ring-slate-950
                    animate-[pop_150ms_ease-in-out]
                  "
                    >
                      {cartCount}
                    </span>
                  )}
                </span>
                Cart
              </h2>

              {/* <button onClick={logout} className="flex items-center gap-1 text-red-400 hover:text-red-300">
            <LogOut className="h-4 w-4" /> Logout
          </button> */}
            </div>

            {/* Barcode */}
            <form onSubmit={onBarcodeSubmit} className="p-4 border-b border-slate-800 flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-slate-400" />
              <input
                ref={barcodeRef}
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Scan barcode then Enter"
                className="flex-1 rounded-lg bg-slate-800 px-3 py-2 text-slate-100 placeholder:text-slate-400 focus:outline-none"
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
                  className={`flex items-center justify-between rounded-lg p-3 transition-colors
                              ${l.variant.id === lastAddedId && flashToken
                      ? "bg-emerald-500/10 ring-2 ring-emerald-400/60 animate-[pop_150ms_ease-in-out]"
                      : "bg-slate-800"
                    }`}
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{l.variant.name}</div>
                    <div className="text-sm text-slate-400 truncate">
                      {(l.variant as any).variant_name || l.variant.sku || ""}
                    </div>
                    <div className="text-sm text-slate-400">
                      ${toMoney(l.variant.price)} × {l.qty}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => changeQty(l.variant.id, -1)} className="rounded bg-slate-700 p-1 hover:bg-slate-600">
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="tabular-nums min-w-[1.5rem] text-center">{l.qty}</span>
                    <button onClick={() => changeQty(l.variant.id, +1)} className="rounded bg-slate-700 p-1 hover:bg-slate-600">
                      <Plus className="h-4 w-4" />
                    </button>
                    <button onClick={() => removeLine(l.variant.id)} className="text-red-400 hover:text-red-300">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              {cart.length === 0 && <div className="text-center text-slate-400">No items yet</div>}
            </div>

            {/* Totals + actions */}
            <div
              ref={cartTotalsRef}
              className="border-t border-slate-800 p-4 space-y-2 sticky bottom-0 bg-slate-950"
            >
              {/* Optional error from quote */}
              {quoteError && (
                <div className="mb-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-red-800">
                  {quoteError}
                </div>
              )}

              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="tabular-nums">${toMoney(showSub)}</span>
              </div>

              {/* Optional per-rule discount lines (if backend ever returns them) */}
              {!lastReceipt && (quote?.discount_by_rule || []).map((d: any) => (
                <div key={d.rule_id ?? d.code ?? d.name} className="flex justify-between text-sm opacity-90">
                  <span>{d.name}</span>
                  <span className="tabular-nums">-${toMoney(d.amount)}</span>
                </div>
              ))}

              {/* Discount total (from server quote, before checkout) */}
              {!!showDisc && !lastReceipt && (
                <div className="flex justify-between text-sm">
                  <span>Total Discounts</span>
                  <span className="tabular-nums">-${toMoney(showDisc)}</span>
                </div>
              )}

              {/* Per-rule tax lines (from server quote, before checkout) */}
              {!lastReceipt && (quote?.tax_by_rule || []).map((r: any) => (
                <div key={r.rule_id ?? r.code ?? r.name} className="flex justify-between text-sm opacity-90">
                  <span>{r.name}</span>
                  <span className="tabular-nums">${toMoney(r.amount)}</span>
                </div>
              ))}

              <div className="flex justify-between">
                <span>Total Taxes</span>
                <span className="tabular-nums">${toMoney(showTax)}</span>
              </div>

              <div className="flex justify-between font-semibold text-lg">
                <span>Total</span><span className="tabular-nums">${toMoney(showGrand)}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-3">
                <button
                  onClick={() => setShowCash(true)}
                  disabled={paying || cart.length === 0}
                  className="flex items-center justify-center gap-2 rounded-lg bg-green-600 py-2 font-medium hover:bg-green-500 disabled:opacity-50"
                >
                  <Wallet className="h-4 w-4" /> Cash
                </button>
                <button
                  onClick={() => setShowCard(true)}
                  disabled={paying || cart.length === 0}
                  className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 py-2 font-medium hover:bg-blue-500 disabled:opacity-50"
                >
                  <CreditCard className="h-4 w-4" /> Card
                </button>
                <button
                  onClick={() => setMsg("Order placed on hold (client-only for now)")}
                  disabled={cart.length === 0}
                  className="flex items-center justify-center gap-2 rounded-lg bg-yellow-600 py-2 font-medium hover:bg-yellow-500 col-span-2 disabled:opacity-50"
                >
                  <PauseCircle className="h-4 w-4" /> Hold
                </button>
                <button
                  onClick={() => { clearCart(); setMsg("Order voided (client-only)"); }}
                  disabled={cart.length === 0}
                  className="flex items-center justify-center gap-2 rounded-lg bg-red-600 py-2 font-medium hover:bg-red-500 col-span-2 disabled:opacity-50"
                >
                  <XCircle className="h-4 w-4" /> Void
                </button>
              </div>

              {msg && <div className="mt-3 rounded-lg bg-slate-800 p-2 text-sm text-slate-200">{msg}</div>}
            </div>
          </div>

          {/* ---- CASH MODAL ---- */}
          {showCash && (
            <CashModal
              total={showGrand}
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
                className="w-[520px] max-w-[90vw] rounded-xl bg-slate-900 text-slate-100 shadow-2xl ring-1 ring-slate-700"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-slate-800 p-4">
                  <div className="font-semibold">Receipt #{lastReceipt?.receipt_no}</div>
                  <div className="text-slate-400 text-sm">
                    {lastReceipt?.store?.code} — {lastReceipt?.store?.name}
                  </div>
                </div>

                <div className="max-h-[70vh] overflow-y-auto p-4 space-y-3">
                  <div className="text-sm text-slate-400">
                    {new Date(lastReceipt?.created_at || Date.now()).toLocaleString()}
                  </div>

                  <div className="rounded-lg bg-slate-800 p-3">
                    {(lastReceipt?.lines || []).map((l: any) => (
                      <div key={`${l.variant_id}-${l.sku}-${l.name}`} className="flex items-center justify-between py-1">
                        <div className="min-w-0 pr-2">
                          <div className="truncate">{l.name}</div>
                          <div className="text-xs text-slate-400">{l.sku || "-"}</div>
                        </div>
                        <div className="tabular-nums text-right">
                          <div className="text-slate-400">{l.qty} × ${l.unit_price}</div>
                          <div className="font-medium">${l.line_subtotal ?? l.line_total ?? l.line_net}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span className="tabular-nums">${lastReceipt?.totals?.subtotal || "0.00"}</span>
                    </div>
                    {(lastReceipt?.totals?.discount_by_rule || []).map((d: any) => (
                      <div key={d.rule_id ?? d.code ?? d.name} className="flex justify-between text-sm opacity-90">
                        <span>{d.name}</span>
                        <span className="tabular-nums">-${d.amount}</span>
                      </div>
                    ))}

                    {!!lastReceipt?.totals?.discount && (
                      <div className="flex justify-between">
                        <span>Total Discounts</span>
                        <span className="tabular-nums">-${lastReceipt?.totals?.discount}</span>
                      </div>
                    )}
                    {/* NEW: per-rule tax lines, if present */}
                    {(lastReceipt?.totals?.tax_by_rule || []).map((r: any) => (
                      <div key={r.rule_id ?? r.code ?? r.name} className="flex justify-between text-sm opacity-90">
                        <span>{r.name}</span>
                        <span className="tabular-nums">${r.amount}</span>
                      </div>
                    ))}
                    <div className="flex justify-between">
                      <span>Total Taxes</span>
                      <span className="tabular-nums">${lastReceipt?.totals?.tax || "0.00"}</span>
                    </div>
                    {!!lastReceipt?.totals?.fees && (
                      <div className="flex justify-between">
                        <span>Fees</span>
                        <span className="tabular-nums">${lastReceipt?.totals?.fees}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-lg font-semibold">
                      <span>Total</span>
                      <span className="tabular-nums">${lastReceipt?.totals?.grand_total || "0.00"}</span>
                    </div>
                  </div>

                  {lastReceipt?.payment && (
                    <div className="rounded-lg bg-slate-800 p-3 text-sm">
                      <div>Payment: <span className="font-medium">{lastReceipt.payment.type}</span></div>
                      {lastReceipt.payment.received && (<div>Received: ${lastReceipt.payment.received}</div>)}
                      {lastReceipt.payment.change && (<div>Change: ${lastReceipt.payment.change}</div>)}
                    </div>
                  )}

                  {lastQR && (
                    <div className="flex justify-center">
                      <img src={lastQR} alt="QR" className="h-40 w-40 rounded bg-white p-2" />
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-800 p-3">
                  <button
                    onClick={() => {
                      const html = buildReceiptHtml(lastReceipt, lastQR);
                      printHtml(html);
                    }}
                    className="rounded-lg bg-indigo-600 px-3 py-2 font-medium hover:bg-indigo-500"
                  >
                    Print
                  </button>
                  <button
                    onClick={() => setReceiptOpen(false)}
                    className="rounded-lg bg-slate-700 px-3 py-2 font-medium hover:bg-slate-600"
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
  total, onClose, onSubmit,
}: { total: number; onClose: () => void; onSubmit: (cashAmount: number) => void; }) {
  const [tendered, setTendered] = useState<string>("");
  const amount = parseFloat(tendered || "0");
  const change = Math.max(0, amount - total);
  const exact = Math.abs(amount - total) < 0.005;
  const canPay = amount >= total - 0.005;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <h3 className="font-semibold">Cash Payment</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span>Total due</span>
            <span className="font-semibold">${toMoney(total)}</span>
          </div>
          <label className="block text-sm">
            Cash tendered
            <input
              autoFocus inputMode="decimal" value={tendered}
              onChange={(e) => setTendered(e.target.value)}
              placeholder="0.00"
              className="mt-1 w-full rounded-lg bg-slate-800 px-3 py-2 outline-none"
            />
          </label>
          <div className="flex justify-between text-sm">
            <span>Change</span>
            <span className="font-semibold">${toMoney(change)}</span>
          </div>
          {!canPay && (<div className="text-amber-300 text-sm">Insufficient cash. Total is ${toMoney(total)}.</div>)}
          <div className="pt-2 flex gap-2">
            <button onClick={() => setTendered(toMoney(total))} className="rounded-lg bg-slate-700 px-3 py-2 text-sm">
              Exact ${toMoney(total)}
            </button>
            <button onClick={() => setTendered(toMoney(Math.ceil(total)))} className="rounded-lg bg-slate-700 px-3 py-2 text-sm">
              Round ↑ ${toMoney(Math.ceil(total))}
            </button>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-800 p-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 bg-slate-700 hover:bg-slate-600">Cancel</button>
          <button onClick={() => canPay && onSubmit(amount)} disabled={!canPay}
            className="rounded-lg px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50">
            Take Cash
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- Card Modal ---------------------------- */
function CardModal({
  total, onClose, onSubmit,
}: { total: number; onClose: () => void; onSubmit: (card: { brand?: string; last4?: string; auth?: string; reference?: string }) => void; }) {
  const [brand, setBrand] = useState<string>("VISA");
  const [last4, setLast4] = useState<string>("");
  const [auth, setAuth] = useState<string>("");
  const [reference, setReference] = useState<string>("");
  const canPay = /^\d{4}$/.test(last4 || "") && (auth?.length ?? 0) >= 4;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <h3 className="font-semibold">Card Payment</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span>Total to charge</span>
            <span className="font-semibold">${toMoney(total)}</span>
          </div>
          <label className="block text-sm">
            Card brand
            <select value={brand} onChange={(e) => setBrand(e.target.value)}
              className="mt-1 w-full rounded-lg bg-slate-800 px-3 py-2 outline-none">
              <option>VISA</option><option>MASTERCARD</option><option>AMEX</option><option>DISCOVER</option>
              <option value="">Other / Unknown</option>
            </select>
          </label>
          <label className="block text-sm">
            Last 4 digits
            <input inputMode="numeric" maxLength={4} value={last4}
              onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))}
              placeholder="1234" className="mt-1 w-full rounded-lg bg-slate-800 px-3 py-2 outline-none" />
          </label>
          <label className="block text-sm">
            Auth code
            <input value={auth} onChange={(e) => setAuth(e.target.value)}
              placeholder="Gateway auth code"
              className="mt-1 w-full rounded-lg bg-slate-800 px-3 py-2 outline-none" />
          </label>
          <label className="block text-sm">
            Reference (optional)
            <input value={reference} onChange={(e) => setReference(e.target.value)}
              placeholder="Transaction reference"
              className="mt-1 w-full rounded-lg bg-slate-800 px-3 py-2 outline-none" />
          </label>
          <p className="text-xs text-slate-400">
            (This UI assumes you’ve already authorized the card on a terminal and are recording the result here.)
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-800 p-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 bg-slate-700 hover:bg-slate-600">Cancel</button>
          <button onClick={() => canPay && onSubmit({ brand, last4, auth, reference })}
            disabled={!canPay} className="rounded-lg px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50">
            Charge Card
          </button>
        </div>
      </div>
    </div>
  );
}
