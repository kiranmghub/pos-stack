// src/features/pos/PosScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ShoppingCart, Search, Minus, Plus, Trash2,
  CreditCard, Wallet, PauseCircle, XCircle, LogOut, ScanLine
} from "lucide-react";
import {
  mockFetchCategories,
  mockSearchProducts,
  mockLookupByBarcode,
  computeTotals,
  type Product,
  type CartLine,
  type Category,
  mockCheckout,
} from "./mock";
import { logout } from "@/lib/auth";

const CART_KEY = "pos_cart_v1";

export default function PosScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCat, setActiveCat] = useState<string>("ALL");

  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);

  const [cart, setCart] = useState<CartLine[]>(() => {
    try {
      const raw = localStorage.getItem(CART_KEY);
      return raw ? (JSON.parse(raw) as CartLine[]) : [];
    } catch {
      return [];
    }
  });

  const [barcode, setBarcode] = useState("");
  const [paying, setPaying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);

  // Load categories
  useEffect(() => {
    (async () => setCategories(await mockFetchCategories()))();
  }, []);

  // Load products whenever filters change
  useEffect(() => {
    (async () => {
      const list = await mockSearchProducts({ query, category: activeCat });
      setProducts(list);
    })();
  }, [query, activeCat]);

  // Persist cart
  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  const addToCart = (p: Product) => {
    setCart((prev) => {
      const i = prev.findIndex((l) => l.product.id === p.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: Math.min(next[i].qty + 1, 999) };
        return next;
        }
      return [...prev, { product: p, qty: 1 }];
    });
  };

  const changeQty = (id: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => (l.product.id === id ? { ...l, qty: Math.max(0, Math.min(999, l.qty + delta)) } : l))
        .filter((l) => l.qty > 0)
    );
  };

  const removeLine = (id: number) => setCart((prev) => prev.filter((l) => l.product.id !== id));

  const totals = useMemo(() => computeTotals(cart), [cart]);

  const handleBarcodeEnter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcode.trim()) return;
    const found = await mockLookupByBarcode(barcode.trim());
    if (found) {
      addToCart(found);
      setBarcode("");
      barcodeRef.current?.focus();
    } else {
      setMessage(`No product for barcode: ${barcode}`);
      setBarcode("");
    }
  };

  const clearCart = () => setCart([]);

  const payCash = async () => {
    try {
      setPaying(true);
      const res = await mockCheckout({ lines: cart, payment: { type: "CASH", amount: totals.total } });
      setMessage(`Sale #${res.sale_number} paid CASH`);
      clearCart();
    } catch (err: any) {
      setMessage(err?.message || "Payment failed");
    } finally {
      setPaying(false);
    }
  };

  const payCard = async () => {
    try {
      setPaying(true);
      const res = await mockCheckout({ lines: cart, payment: { type: "CARD", amount: totals.total } });
      setMessage(`Sale #${res.sale_number} paid CARD`);
      clearCart();
    } catch (err: any) {
      setMessage(err?.message || "Payment failed");
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Left: Catalog */}
      <div className="flex-1 border-r border-border p-4">
        {/* Search + Categories */}
        <div className="flex items-center gap-2 mb-4">
          <Search className="h-5 w-5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name / SKU / barcode…"
            className="flex-1 rounded-lg bg-muted px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              className={`rounded-full px-3 py-1 text-sm ${
                activeCat === c.id ? "bg-indigo-600" : "bg-muted hover:bg-muted"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        {/* Product grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {products.map((p) => (
            <button
              key={p.id}
              onClick={() => addToCart(p)}
              className="rounded-xl bg-muted p-3 text-left hover:bg-muted"
            >
              <div className="h-20 flex items-center justify-center bg-muted/40 rounded-lg mb-2">
                {p.image ? (
                  <img src={p.image} alt={p.name} className="h-full object-cover rounded-lg" />
                ) : (
                  <span className="text-muted-foreground">🛒</span>
                )}
              </div>
              <div className="font-medium truncate">{p.name}</div>
              <div className="text-sm text-muted-foreground">${p.price.toFixed(2)}</div>
            </button>
          ))}
          {products.length === 0 && (
            <div className="col-span-full text-muted-foreground">No products</div>
          )}
        </div>
      </div>

      {/* Right: Cart */}
      <div className="w-[420px] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="flex items-center gap-2 font-semibold">
            <ShoppingCart className="h-5 w-5" /> Cart
          </h2>
          <button onClick={logout} className="flex items-center gap-1 text-red-400 hover:text-red-300">
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>

        {/* Barcode box */}
        <form onSubmit={handleBarcodeEnter} className="p-4 border-b border-border flex items-center gap-2">
          <ScanLine className="h-5 w-5 text-muted-foreground" />
          <input
            ref={barcodeRef}
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="Scan barcode and press Enter"
            className="flex-1 rounded-lg bg-muted px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </form>

        {/* Lines */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.map((l) => (
            <div key={l.product.id} className="flex items-center justify-between bg-muted rounded-lg p-3">
              <div className="min-w-0">
                <div className="font-medium truncate">{l.product.name}</div>
                <div className="text-sm text-muted-foreground">
                  ${l.product.price.toFixed(2)} × {l.qty}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => changeQty(l.product.id, -1)} className="rounded bg-muted p-1 hover:bg-muted">
                  <Minus className="h-4 w-4" />
                </button>
                <span className="tabular-nums min-w-[1.5rem] text-center">{l.qty}</span>
                <button onClick={() => changeQty(l.product.id, +1)} className="rounded bg-muted p-1 hover:bg-muted">
                  <Plus className="h-4 w-4" />
                </button>
                <button onClick={() => removeLine(l.product.id)} className="text-red-400 hover:text-red-300">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          {cart.length === 0 && <div className="text-center text-muted-foreground">No items yet</div>}
        </div>

        {/* Totals + actions */}
        <div className="border-t border-border p-4 space-y-2">
          <div className="flex justify-between">
            <span>Subtotal</span><span className="tabular-nums">${totals.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Tax</span><span className="tabular-nums">${totals.tax.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-semibold text-lg">
            <span>Total</span><span className="tabular-nums">${totals.total.toFixed(2)}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-3">
            <button
              onClick={payCash}
              disabled={paying || cart.length === 0}
              className="flex items-center justify-center gap-2 rounded-lg bg-green-600 py-2 font-medium hover:bg-green-500 disabled:opacity-50"
            >
              <Wallet className="h-4 w-4" /> Cash
            </button>
            <button
              onClick={payCard}
              disabled={paying || cart.length === 0}
              className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 py-2 font-medium hover:bg-blue-500 disabled:opacity-50"
            >
              <CreditCard className="h-4 w-4" /> Card
            </button>
            <button
              onClick={() => setMessage("Order placed on hold")}
              disabled={cart.length === 0}
              className="flex items-center justify-center gap-2 rounded-lg bg-yellow-600 py-2 font-medium hover:bg-yellow-500 col-span-2 disabled:opacity-50"
            >
              <PauseCircle className="h-4 w-4" /> Hold
            </button>
            <button
              onClick={() => { clearCart(); setMessage("Order voided"); }}
              disabled={cart.length === 0}
              className="flex items-center justify-center gap-2 rounded-lg bg-red-600 py-2 font-medium hover:bg-red-500 col-span-2 disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" /> Void
            </button>
          </div>

          {message && (
            <div className="mt-3 rounded-lg bg-muted p-2 text-sm text-muted-foreground">{message}</div>
          )}
        </div>
      </div>
    </div>
  );
}
