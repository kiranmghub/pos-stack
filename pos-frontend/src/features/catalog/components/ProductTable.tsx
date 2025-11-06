// pos-frontend/src/features/catalog/components/ProductTable.tsx
import React from "react";
import { listProducts, getProduct, updateVariant, deleteVariant, deleteProduct, updateProduct, listInventoryStores } from "../api";
import type { ProductListItem, ProductDetail, Variant } from "../types";
import { useNotify } from "@/lib/notify";
import ExportModal from "./ExportModal";
import ImportModal from "./ImportModal";


const currency = (v: string | number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(v));

type Props = {
  onEditProduct: (p: ProductListItem | ProductDetail) => void;
  onNewProduct: () => void;
  onNewVariant: (product?: ProductListItem | ProductDetail) => void;
  onEditVariant: (product: ProductListItem | ProductDetail, variant: Variant) => void;
  onViewVariant: (product: ProductListItem | ProductDetail, variant: Variant) => void;
  onViewProduct: (p: ProductListItem | ProductDetail) => void;
};

export function ProductTable({ onEditProduct, onNewProduct, onNewVariant, onEditVariant, onViewVariant, onViewProduct }: Props) {
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [onlyLow, setOnlyLow] = React.useState(false);
  const [rows, setRows] = React.useState<ProductListItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [totalCount, setTotalCount] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [bootstrapped, setBootstrapped] = React.useState(false);
  // Product order for server-side sorting: "{field}:{direction}"
  // field ∈ { name, price_min, price_max, on_hand, active }, direction ∈ { 'asc','desc' }
  const [productOrder, setProductOrder] = React.useState<"name:asc" | "name:desc" | "price_min:asc" | "price_max:desc" | "on_hand:asc" | "on_hand:desc" | "active:asc" | "active:desc">("name:asc");
  // Variant order for client-side sorting of expanded rows: "{field}:{direction}"
  // field ∈ { name, price, on_hand, active }, direction ∈ { 'asc','desc' }
  const [variantOrder, setVariantOrder] = React.useState<"name:asc" | "name:desc" | "price:asc" | "price:desc" | "on_hand:asc" | "on_hand:desc" | "active:asc" | "active:desc">("name:asc");

  const [storeId, setStoreId] = React.useState<string>("");
  const [stores, setStores] = React.useState<{ id: number, name: string }[]>([]);
  const [showExport, setShowExport] = React.useState(false);
  const [showImport, setShowImport] = React.useState(false);



  // expand state & product detail cache (variants)
  const [expanded, setExpanded] = React.useState<Record<string | number, boolean>>({});
  const [details, setDetails] = React.useState<Record<string | number, ProductDetail>>({});
  const [loadingRow, setLoadingRow] = React.useState<Record<string | number, boolean>>({});

  const { success, error } = useNotify();
  const [openMenu, setOpenMenu] = React.useState<null | number>(null); // variantId whose menu is open
  const [openProdMenu, setOpenProdMenu] = React.useState<null | number>(null); // productId whose menu is open
  const [menuDirection, setMenuDirection] = React.useState<"up" | "down">("down");
  const tableRef = React.useRef<HTMLDivElement>(null);


  // ---- persistence keys ----
  const LS_PAGE = "catalog.page";
  const LS_PAGE_SIZE = "catalog.pageSize";
  const LS_PROD_ORDER = "catalog.productOrder";
  const LS_VAR_ORDER = "catalog.variantOrder";
  const LS_STORE = "catalog.storeId";

  const PRODUCT_ORDERS = new Set([
    "name:asc", "name:desc",
    "price_min:asc", "price_max:desc",
    "on_hand:asc", "on_hand:desc",
    "active:asc", "active:desc",
  ]);
  const VARIANT_ORDERS = new Set([
    "name:asc", "name:desc",
    "price:asc", "price:desc",
    "on_hand:asc", "on_hand:desc",
    "active:asc", "active:desc",
  ]);


  // ---- hydrate pagination + sort from localStorage once, then mark ready ----
  React.useEffect(() => {
    try {
      const psRaw = localStorage.getItem(LS_PAGE_SIZE);
      const ps = psRaw != null ? Number(psRaw) : NaN;
      if ([10, 20, 50, 100].includes(ps)) {
        setPageSize(ps);
      }
      const pRaw = localStorage.getItem(LS_PAGE);
      const p = pRaw != null ? Number(pRaw) : NaN;
      if (Number.isFinite(p) && p >= 1) {
        setPage(p);
      }
      const po = localStorage.getItem(LS_PROD_ORDER) || "";
      if (PRODUCT_ORDERS.has(po)) {
        setProductOrder(po as any);
      }
      const vo = localStorage.getItem(LS_VAR_ORDER) || "";
      if (VARIANT_ORDERS.has(vo)) {
        setVariantOrder(vo as any);
      }
      // hydrate selected store
      const sid = localStorage.getItem(LS_STORE) || "";
      setStoreId(sid);
    } catch {
      // ignore storage errors (e.g., private mode)
    } finally {
      setTimeout(() => setBootstrapped(true), 0);
    }
  }, []);

  // ---- persist on change ----
  // ---- persist on change ----
  React.useEffect(() => {
    if (!bootstrapped) return;
    try { localStorage.setItem(LS_PAGE, String(page)); } catch { }
  }, [bootstrapped, page]);

  React.useEffect(() => {
    if (!bootstrapped) return;
    try { localStorage.setItem(LS_PAGE_SIZE, String(pageSize)); } catch { }
  }, [bootstrapped, pageSize]);

  React.useEffect(() => {
    if (!bootstrapped) return;
    try { localStorage.setItem(LS_PROD_ORDER, productOrder); } catch { }
  }, [bootstrapped, productOrder]);

  React.useEffect(() => {
    if (!bootstrapped) return;
    try { localStorage.setItem(LS_VAR_ORDER, variantOrder); } catch { }
  }, [bootstrapped, variantOrder]);


  // persist selected store
  React.useEffect(() => {
    if (!bootstrapped) return;
    try { localStorage.setItem(LS_STORE, storeId); } catch { }
  }, [bootstrapped, storeId]);



  React.useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[aria-haspopup='menu']") && !target.closest("[role='menu']")) {
        setOpenMenu(null);
        setOpenProdMenu(null); // also close product menus
      }
    }
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, []);

  React.useEffect(() => {
    (async () => {
      try { setStores(await listInventoryStores()); }
      catch (err) { console.error("Failed to load stores", err); }
    })();
  }, []);



  async function load() {
    setLoading(true);
    try {
      const [sortKey, sortDirVal] = productOrder.split(":") as [string, "asc" | "desc"];
      const data = await listProducts({
        page_size: pageSize,
        page,
        search: query || undefined,
        category: category || undefined,
        sort: sortKey as any,     // 'name' | 'price_min' | 'price_max' | 'on_hand' | 'active'
        direction: sortDirVal,    // 'asc' | 'desc'
        store_id: storeId || undefined,
      });
      setRows(data.results || []);
      setTotalCount(Number(data.count || 0));
      const lastPage = Math.max(1, Math.ceil((Number(data.count || 0)) / pageSize));
      if (page > lastPage && lastPage !== page) {
        setPage(lastPage);
      }
      // collapse rows when search/category changes
      setExpanded({});
    } finally {
      setLoading(false);
    }
  }

  // ✅ Reload table when a product is saved in the drawer
  React.useEffect(() => {
    function onSaved() {
      load(); // re-fetch rows so 'active' badge updates
    }
    window.addEventListener("catalog:product:saved", onSaved);
    return () => window.removeEventListener("catalog:product:saved", onSaved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ After a variant is created/updated, refresh just that product’s detail (keep expanded state)
  React.useEffect(() => {
    async function refreshProductDetail(productId: string | number) {
      try {
        setLoadingRow((s) => ({ ...s, [productId]: true }));
        // const d = await getProduct(productId);
        const [vk, vdir] = variantOrder.split(":") as ["name" | "price" | "on_hand" | "active", "asc" | "desc"];
        const d = await getProduct(productId, { vsort: vk, vdirection: vdir, store_id: storeId || undefined });
        // update the detail cache so the variants list refreshes
        setDetails((s) => ({ ...s, [productId]: d }));
        // also patch the summary row (price range, on-hand, variant count) without reloading all rows
        setRows((rows) =>
          rows.map((r) =>
            r.id === productId
              ? {
                ...r,
                price_min: (d as any).price_min ?? r.price_min,
                price_max: (d as any).price_max ?? r.price_max,
                on_hand_sum: (d as any).on_hand_sum ?? r.on_hand_sum,
                variant_count: (d as any).variants ? (d as any).variants.length : r.variant_count,
              }
              : r
          )
        );
      } finally {
        setLoadingRow((s) => ({ ...s, [productId]: false }));
      }
    }

    function onVariantSaved(e: any) {
      const pid =
        e?.detail?.productId ??
        e?.detail?.id ??
        e?.detail; // be tolerant of payload shapes
      if (!pid) return;
      // Only refresh if that row is currently expanded; otherwise it will refresh on expand.
      refreshProductDetail(pid);
    }

    function onVariantDeleted(e: any) {
      const pid = e?.detail?.productId ?? e?.detail?.id ?? e?.detail;
      if (!pid) return;
      refreshProductDetail(pid);
    }

    window.addEventListener("catalog:variant:saved", onVariantSaved);
    window.addEventListener("catalog:variant:deleted", onVariantDeleted);
    return () => {
      window.removeEventListener("catalog:variant:saved", onVariantSaved);
      window.removeEventListener("catalog:variant:deleted", onVariantDeleted);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch expanded rows when variant order changes
  React.useEffect(() => {
    // re-fetch detail for every expanded product using the new variant order
    const ids = Object.keys(expanded).filter((k) => expanded[k as any]);
    ids.forEach(async (id) => {
      try {
        setLoadingRow((s) => ({ ...s, [id]: true }));
        const [vk, vdir] = variantOrder.split(":") as ["name" | "price" | "on_hand" | "active", "asc" | "desc"];
        const d = await getProduct(Number(id), { vsort: vk, vdirection: vdir, store_id: storeId || undefined });
        setDetails((s) => ({ ...s, [id]: d }));
      } finally {
        setLoadingRow((s) => ({ ...s, [id]: false }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantOrder, storeId]);

  React.useEffect(() => {
    if (!bootstrapped) return;
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrapped, query, category, page, pageSize, productOrder, storeId]);

  // Refresh after a successful import apply
  React.useEffect(() => {
    function onApplied() {
      // reset to first page to make results obvious
      setPage(1);
      load();
    }
    window.addEventListener("catalog:import:applied", onApplied);
    return () => window.removeEventListener("catalog:import:applied", onApplied);
  }, []);


  const filtered = React.useMemo(
    () => (onlyLow ? rows.filter((p) => p.on_hand_sum <= 5) : rows),
    [rows, onlyLow]
  );



  const lastPage = Math.max(1, Math.ceil(totalCount / pageSize));

  async function toggleExpand(p: ProductListItem) {
    const next = !expanded[p.id];
    setExpanded((s) => ({ ...s, [p.id]: next }));
    if (next && !details[p.id] && !loadingRow[p.id]) {
      try {
        setLoadingRow((s) => ({ ...s, [p.id]: true }));
        // const d = await getProduct(p.id);
        const [vk, vdir] = variantOrder.split(":") as ["name" | "price" | "on_hand" | "active", "asc" | "desc"];
        const d = await getProduct(p.id, { vsort: vk, vdirection: vdir, store_id: storeId || undefined });
        setDetails((s) => ({ ...s, [p.id]: d }));
      } finally {
        setLoadingRow((s) => ({ ...s, [p.id]: false }));
      }
    }
  }

  async function toggleVariantActive(p: ProductListItem | ProductDetail, v: Variant) {
    try {
      await updateVariant(v.id, { active: !(v as any).active });
      success((v as any).active ? "Variant deactivated" : "Variant activated");
      window.dispatchEvent(new CustomEvent("catalog:variant:saved", { detail: { productId: p.id } }));
    } catch (e) {
      console.error(e);
      error("Failed to update variant status.");
    }
  }

  async function hardDeleteVariant(p: ProductListItem | ProductDetail, v: Variant) {
    try {
      await deleteVariant(v.id);
      success("Variant deleted");
      window.dispatchEvent(new CustomEvent("catalog:variant:deleted", { detail: { productId: p.id } }));
    } catch (e) {
      console.error(e);
      const msg = e?.message || e?.detail || "Failed to delete variant.";
      error(msg);
    }
  }

  async function toggleProductActive(p: ProductListItem | ProductDetail) {
    try {
      await updateProduct(p.id, { active: !(p as any).active });
      success((p as any).active ? "Product deactivated" : "Product activated");
      // let listeners reload list & badges
      window.dispatchEvent(new CustomEvent("catalog:product:saved", { detail: { id: p.id } }));
    } catch (e) {
      console.error(e);
      error("Failed to update product status.");
    }
  }



  function VariantRow({ v }: { v: Variant }) {
    const pid = (v as any).product || ""; // detail payload includes product id in your VariantPublicSerializer
    // we need the product row object to pass to handlers; we can derive from details
    // locate the product detail using pid
    // In this scope we can close over p via the render below; so we won't use pid here.
    return (
      <div className="relative grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm">

        {/* Image */}
        <div className="w-10">
          <div className="h-10 w-10 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-800">
            {(v as any).image_url ? (
              <img
                src={(v as any).image_url}
                className="h-full w-full object-cover"
                alt={v.name || "Variant"}
              />
            ) : null}
          </div>
        </div>


        {/* Name + SKU stacked on left */}
        <div className="min-w-0">
          <div className="truncate font-medium text-zinc-100" title={v.name}>
            {v.name}
          </div>
          <div className="truncate text-xs text-zinc-400" title={v.sku}>
            {v.sku}
          </div>
        </div>

        {/* Price */}
        <div className="justify-self-end text-zinc-200">{currency(v.price)}</div>

        {/* On-hand count */}
        <div
          className={`justify-self-end rounded-full px-2 py-0.5 text-xs ${v.on_hand === 0
              ? "bg-red-500/15 text-red-300"
              : v.on_hand < 5
                ? "bg-amber-500/15 text-amber-300"
                : "bg-emerald-500/15 text-emerald-300"
            }`}
        >
          {v.on_hand}
        </div>

        {/* Status */}
        <div className="justify-self-end">
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${(v as any).active ? "bg-indigo-500/15 text-indigo-300" : "bg-zinc-600/20 text-zinc-300"
              }`}
          >
            {(v as any).active ? "Active" : "Inactive"}
          </span>
        </div>

        {/* Kebab */}
        <div className="relative justify-self-end">
          <button
            className="rounded-md px-2 py-1 text-xs text-zinc-300 hover:bg-white/5"
            onClick={() => setOpenMenu((m) => (m === v.id ? null : v.id))}
            aria-haspopup="menu"
            aria-expanded={openMenu === v.id}
          >
            ⋯
          </button>
          {openMenu === v.id && (
            <div
              className="absolute right-0 z-30 mt-2 w-40 rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl"
              role="menu"
            >
              {/* View Details */}
              <button
                className="block w-full px-3 py-1 text-left text-sm text-zinc-200 hover:bg-white/5"
                onClick={() => { setOpenMenu(null); }}
                data-action="view"
              >
                View Details
              </button>

              <div className="my-1 h-px bg-zinc-800" />

              {/* Edit */}
              <button
                className="block w-full px-3 py-1 text-left text-sm text-zinc-200"
                onClick={() => { setOpenMenu(null); }}
                data-action="edit"
              >
                Edit
              </button>

              {/* Activate / Deactivate (variant) */}
              <button
                className="block w-full px-3 py-1 text-left text-sm text-zinc-200 hover:bg-white/5"
                onClick={() => { setOpenMenu(null); }}
                data-action={(v as any).active ? "deactivate" : "activate"}
              >
                {(v as any).active ? "Deactivate" : "Activate"}
              </button>

              {/* Show Delete ONLY when inactive (variant) */}
              {!(v as any).active && (
                <>
                  <div className="my-1 h-px bg-zinc-800" />
                  <button
                    className="block w-full px-3 py-1 text-left text-sm text-red-300 hover:bg-red-500/10"
                    onClick={() => { setOpenMenu(null); }}
                    data-action="delete"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          )}

        </div>
      </div>
    );
  }




  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div className="grid w-full grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto]">
          <input
            className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-indigo-500/50"
            placeholder="Search name, code, SKU, category…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
          />
          <input
            className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-indigo-500/50"
            placeholder="Category"
            value={category}
            onChange={(e) => { setCategory(e.target.value); setPage(1); }}
          />
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={onlyLow}
              onChange={(e) => { setOnlyLow(e.target.checked); setPage(1); }}
            />
            Low / OOS
          </label>

          {/* Product order */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-300">Product&nbsp;order</label>
            <select
              className="rounded-md border border-zinc-700 bg-zinc-900 text-xs text-zinc-100 px-2 py-1"
              value={productOrder}
              onChange={(e) => { setProductOrder(e.target.value as any); setPage(1); }}
            >
              <option value="name:asc">Name ↑</option>
              <option value="name:desc">Name ↓</option>
              <option value="price_min:asc">Price ↑</option>
              <option value="price_max:desc">Price ↓</option>
              <option value="on_hand:asc">On&nbsp;hand ↑</option>
              <option value="on_hand:desc">On&nbsp;hand ↓</option>
              <option value="active:desc">Active ↑</option>
              <option value="active:asc">Active ↓</option>
            </select>
          </div>
          {/* Variant order */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-300">Variant&nbsp;order</label>
            <select
              className="rounded-md border border-zinc-700 bg-zinc-900 text-xs text-zinc-100 px-2 py-1"
              value={variantOrder}
              onChange={(e) => setVariantOrder(e.target.value as any)}
            >
              <option value="name:asc">Name ↑</option>
              <option value="name:desc">Name ↓</option>
              <option value="price:asc">Price ↑</option>
              <option value="price:desc">Price ↓</option>
              <option value="on_hand:asc">On&nbsp;hand ↑</option>
              <option value="on_hand:desc">On&nbsp;hand ↓</option>
              <option value="active:desc">Active ↑</option>
              <option value="active:asc">Active ↓</option>
            </select>
          </div>

          {/* Store selector */}

          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-300">Store</label>
            <select
              className="rounded-md border border-zinc-700 bg-zinc-900 text-xs text-zinc-100 px-2 py-1"
              value={storeId}
              onChange={(e) => { setStoreId(e.target.value); setPage(1); }}
            >
              <option value="">All stores</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="rounded-xl border border-zinc-700 px-2 py-1 text-sm text-zinc-100 hover:bg-white/5"
              onClick={() => setShowExport(true)}
            >
              Export
            </button>
            <button
              className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-100 hover:bg-white/5"
              onClick={() => setShowImport(true)}
            >
              Import
            </button>
          </div>


        </div>
        <div className="flex gap-2">
          <button
            className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-100 hover:bg-white/5"
            onClick={() => onNewVariant(undefined)}
          >
            + New Variant
          </button>
          <button
            className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            onClick={onNewProduct}
          >
            + New Product
          </button>
        </div>
      </div>

      {/* Table */}
      {/* <div ref={tableRef} className="overflow-hidden rounded-2xl border border-zinc-800 relative"> */}
      <div ref={tableRef} className="relative overflow-visible rounded-2xl border border-zinc-800">
        <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] gap-3 bg-zinc-800 px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-300">
          <div className="w-12">Image</div>
          <div>Product</div>
          <div>Category</div>
          <div>Code</div>
          <div className="justify-self-end">Price</div>
          <div className="justify-self-end">On Hand</div>
          <div className="justify-self-end">Status</div>
        </div>

        <div className="divide-y divide-zinc-800">
          {loading && <div className="p-6 text-sm text-zinc-500">Loading…</div>}
          {!loading &&
            filtered.map((p) => {
              const isOpen = !!expanded[p.id];
              const d = details[p.id];
              return (
                <div key={p.id} className="bg-zinc-950">
                  {/* master row */}
                  <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] items-center gap-3 px-3 py-3 text-sm hover:bg-white/5 transition-colors">
                    <div className="w-12">
                      <div className="h-12 w-12 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800">
                        {p.cover_image ? <img src={p.cover_image} className="h-full w-full object-cover" /> : null}
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <button
                          className="rounded-lg px-1 text-left font-medium text-zinc-100 hover:bg-white/5"
                          onClick={() => toggleExpand(p)}
                        >
                          {p.name}
                        </button>
                        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                          {(details[p.id]?.variants?.length ?? p.variant_count)} variants
                        </span>
                      </div>
                    </div>

                    <div className="truncate text-zinc-400" title={p.category}>
                      {p.category}
                    </div>
                    <div className="truncate text-zinc-400" title={p.code}>
                      {p.code}
                    </div>
                    <div className="justify-self-end text-zinc-200">
                      {currency(p.price_min)} – {currency(p.price_max)}
                    </div>
                    <div
                      className={`justify-self-end rounded-full px-2 py-0.5 text-xs ${p.on_hand_sum === 0
                          ? "bg-red-500/15 text-red-300"
                          : p.on_hand_sum < 5
                            ? "bg-amber-500/15 text-amber-300"
                            : "bg-emerald-500/15 text-emerald-300"
                        }`}
                    >
                      {p.on_hand_sum}
                    </div>
                    <div className="justify-self-end flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${p.active ? "bg-indigo-500/15 text-indigo-300" : "bg-zinc-600/20 text-zinc-300"
                          }`}
                      >
                        {p.active ? "Active" : "Inactive"}
                      </span>
                      <div className="relative">
                        <button
                          className="rounded-md px-2 py-1 text-xs text-zinc-300 hover:bg-white/5"
                          onClick={(e) => {
                            const buttonRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            const containerRect = tableRef.current?.getBoundingClientRect();
                            const spaceBelow = containerRect
                              ? containerRect.bottom - buttonRect.bottom
                              : window.innerHeight - buttonRect.bottom;
                            const estimatedMenuHeight = 150; // approx menu height
                            setMenuDirection(spaceBelow < estimatedMenuHeight ? "up" : "down");
                            setOpenProdMenu((m) => (m === p.id ? null : p.id));
                          }}
                          aria-haspopup="menu"
                          aria-expanded={openProdMenu === p.id}
                        >
                          ⋯
                        </button>
                        {openProdMenu === p.id && (
                          <div
                            className={`absolute right-0 z-30 w-40 rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl ${menuDirection === "up" ? "-translate-y-2 bottom-full" : "translate-y-2 top-full"
                              }`}
                            role="menu"
                          >
                            {/* View Details */}
                            <button
                              className="block w-full px-3 py-1 text-left text-sm text-zinc-200 hover:bg-white/5"
                              onClick={() => { setOpenProdMenu(null); onViewProduct(d ?? (p as any)); }}
                            >
                              View Details
                            </button>

                            {/* Edit */}
                            <button
                              className="block w-full px-3 py-1 text-left text-sm text-zinc-200 hover:bg-white/5"
                              onClick={() => { setOpenProdMenu(null); onEditProduct(d ?? (p as any)); }}
                            >
                              Edit
                            </button>

                            {/* Activate / Deactivate (product) */}
                            <button
                              className="block w-full px-3 py-1 text-left text-sm text-zinc-200 hover:bg-white/5"
                              onClick={() => { setOpenProdMenu(null); toggleProductActive(d ?? (p as any)); }}
                            >
                              {(p as any).active ? "Deactivate" : "Activate"}
                            </button>

                            {/* Show Delete ONLY when inactive (product) */}
                            {!(p as any).active && (
                              <>
                                <div className="my-1 h-px bg-zinc-800" />
                                <button
                                  className="block w-full px-3 py-1 text-left text-sm text-red-300 hover:bg-red-500/10"
                                  title="Only allowed if not used in sales"
                                  onClick={async () => {
                                    setOpenProdMenu(null);
                                    try {
                                      await deleteProduct(p.id);
                                      success("Product deleted");
                                      await load(); // refresh list
                                    } catch (e: any) {
                                      const msg = e?.message || e?.detail || "Failed to delete product.";
                                      error(msg);
                                    }
                                  }}
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* expanded area */}
                  {isOpen && (
                    <div className="space-y-3 bg-zinc-900/40 px-3 pb-4 pt-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs text-zinc-400">
                          Price range {currency(p.price_min)} – {currency(p.price_max)} • {p.on_hand_sum} units on hand
                        </div>
                        <div className="flex gap-2">
                          <button
                            className="rounded-xl border border-zinc-700 px-3 py-1.5 text-xs text-zinc-100 hover:bg-white/5"
                            onClick={() => onNewVariant(d ?? (p as any))}
                          >
                            + New Variant
                          </button>
                          <button
                            className="rounded-xl border border-zinc-700 px-3 py-1.5 text-xs text-zinc-100 hover:bg-white/5"
                            onClick={() => window.alert("Open Media Gallery")}
                          >
                            Media
                          </button>
                        </div>
                      </div>

                      {loadingRow[p.id] && <div className="text-xs text-zinc-500">Loading variants…</div>}

                      {d?.variants && (
                        <div className="grid gap-2">
                          {d?.variants && (
                            <div className="grid gap-2">
                              {d.variants.map((v) => (
                                <div key={v.id}
                                  onClick={(e) => {
                                    // delegate clicks from the menu to correct action with product context
                                    const t = e.target as HTMLElement;
                                    const action = t?.closest("[data-action]")?.getAttribute("data-action");
                                    if (!action) return;
                                    if (action === "edit") {
                                      onEditVariant(d ?? (p as any), v);
                                    } else if (action === "view") {
                                      // open in read-only mode with correct signature (product, variant)
                                      onViewVariant(d ?? (p as any), v);
                                    } else if (action === "activate" || action === "deactivate") {
                                      toggleVariantActive(d ?? (p as any), v);
                                    } else if (action === "delete") {
                                      hardDeleteVariant(d ?? (p as any), v);
                                    }
                                  }}
                                >
                                  <VariantRow v={v} />
                                </div>
                              ))}
                            </div>
                          )}

                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

          {!loading && filtered.length === 0 && (
            <div className="p-6 text-sm text-zinc-500">No products found.</div>
          )}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-zinc-800 bg-zinc-900/40">
          <div className="text-xs text-zinc-400">
            {totalCount === 0
              ? "No results"
              : `Showing ${Math.min((page - 1) * pageSize + 1, totalCount)}–${Math.min(page * pageSize, totalCount)} of ${totalCount}`}
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs text-zinc-300">
              Rows per page:&nbsp;
              <select
                className="rounded-md border border-zinc-700 bg-zinc-900 text-xs text-zinc-100 px-2 py-1"
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              >
                {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>

            <div className="flex items-center gap-1">
              <button
                className="rounded-md px-2 py-1 text-xs text-zinc-200 hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Prev
              </button>
              <div className="min-w-[7rem] text-center text-xs text-zinc-300">
                Page {page} of {lastPage}
              </div>
              <button
                className="rounded-md px-2 py-1 text-xs text-zinc-200 hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => {
                  const last = Math.max(1, Math.ceil(totalCount / pageSize));
                  setPage((p) => Math.min(last, p + 1));
                }}
                disabled={page >= lastPage}
              >
                Next
              </button>
            </div>
          </div>
        </div>

      </div>
      {/* Export modal */}
      <ExportModal
        open={showExport}
        onClose={() => setShowExport(false)}
        initialQuery={query}
        initialStoreId={storeId}
      />
      <ImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
      />

    </div>
  );
}
