import React from "react";
import { listProducts } from "../api";
import type { ProductListItem } from "../types";

const currency = (v: string | number) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(v));

export function ProductTable({ onOpenProduct, onNewProduct, onNewVariant }: { onOpenProduct: (p: ProductListItem) => void; onNewProduct: () => void; onNewVariant: (product?: ProductListItem) => void }) {
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [onlyLow, setOnlyLow] = React.useState(false);
  const [rows, setRows] = React.useState<ProductListItem[]>([]);
  const [loading, setLoading] = React.useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await listProducts({ page_size: 50, search: query || undefined, category: category || undefined });
      setRows(data.results || []);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, category]);

  const filtered = React.useMemo(() => (onlyLow ? rows.filter((p) => p.on_hand_sum <= 5) : rows), [rows, onlyLow]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div className="grid w-full grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto]">
          <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Search name, code, SKU, category…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} />
            Low / OOS
          </label>
        </div>
        <div className="flex gap-2">
          <button className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50" onClick={() => onNewVariant(undefined)}>+ New Variant</button>
          <button className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500" onClick={onNewProduct}>+ New Product</button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border">
        <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] gap-3 bg-zinc-50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-600">
          <div className="w-12">Image</div>
          <div>Product</div>
          <div>Category</div>
          <div>Code</div>
          <div className="justify-self-end">Price</div>
          <div className="justify-self-end">On Hand</div>
          <div className="justify-self-end">Status</div>
        </div>
        <div className="divide-y">
          {loading && <div className="p-6 text-sm text-zinc-500">Loading…</div>}
          {!loading && filtered.map((p) => (
            <div key={p.id} className="grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] items-center gap-3 px-3 py-3 text-sm hover:bg-zinc-50">
              <div className="w-12">
                <div className="h-12 w-12 overflow-hidden rounded-xl border bg-zinc-100">
                  {p.cover_image ? <img src={p.cover_image} className="h-full w-full object-cover" /> : null}
                </div>
              </div>
              <button className="min-w-0 text-left font-medium" onClick={() => onOpenProduct(p)}>{p.name}</button>
              <div className="truncate text-zinc-600" title={p.category}>{p.category}</div>
              <div className="truncate text-zinc-600" title={p.code}>{p.code}</div>
              <div className="justify-self-end">{currency(p.price_min)} – {currency(p.price_max)}</div>
              <div className={`justify-self-end rounded-full px-2 py-0.5 text-xs ${p.on_hand_sum === 0 ? "bg-red-50 text-red-700" : p.on_hand_sum < 5 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{p.on_hand_sum}</div>
              <div className="justify-self-end">
                <span className={`rounded-full px-2 py-0.5 text-xs ${p.active ? "bg-indigo-50 text-indigo-700" : "bg-zinc-100 text-zinc-600"}`}>{p.active ? "Active" : "Inactive"}</span>
              </div>
            </div>
          ))}
          {!loading && filtered.length === 0 && <div className="p-6 text-sm text-zinc-500">No products found.</div>}
        </div>
      </div>
    </div>
  );
}
