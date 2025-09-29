// src/features/catalog/CatalogPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Search, Filter, Package, X, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  listProducts,
  listCategories,
  listTaxCategories,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadImage,
  type ProductListItem,
  type ProductDTO,
  type Category,
  type TaxCategory,
} from "./api";

type VariantDraft = NonNullable<ProductDTO["variants"]>[number];

function toMoney(n: number | string | null | undefined) {
  const x = typeof n === "string" ? parseFloat(n) : typeof n === "number" ? n : 0;
  return (isNaN(x) ? 0 : x).toFixed(2);
}


export default function CatalogPage() {
  // table state
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | "true" | "false">("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);

  // 👉 debounce the search text (minimal change)
  const [debouncedQ, setDebouncedQ] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  // data
  const [rows, setRows] = useState<ProductListItem[]>([]);
  const [count, setCount] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [taxCats, setTaxCats] = useState<TaxCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // selection
  const [selected, setSelected] = useState<number[]>([]);

  // modals
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<ProductDTO | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // load ref data once
  useEffect(() => {
    (async () => {
      try {
        const [cats, taxes] = await Promise.all([listCategories(), listTaxCategories()]);
        setCategories(cats || []);
        setTaxCats(taxes || []);
      } catch (e: any) {
        setMsg(e.message || "Failed to load reference data");
      }
    })();
  }, []);

  // load products
  async function fetchPage() {
    setLoading(true);
    try {
      // ✅ map status to boolean or undefined
//       const activeFilter =
//         status === "" ? undefined : status === "true";
      const activeFilter: "true" | "false" | undefined =
        status === "" ? undefined : status;

      const resp = await listProducts({
        // ✅ send the correct query param name
//         query: debouncedQ,
        q: debouncedQ,
        is_active: activeFilter,
        category_id: categoryId || undefined,
        page,
        page_size: pageSize,
      });
      setRows(resp.results || []);
      setCount(resp.count || 0);
      setSelected([]);
    } catch (e: any) {
      setMsg(e.message || "Failed to load products");
      setRows([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    fetchPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, status, categoryId, page, pageSize]); // 👈 use debouncedQ

  function openCreate() {
    setEditing({
      name: "",
      code: "",
      description: "",
      category_id: categoryId ? Number(categoryId) : null,
      tax_category_id: taxCats[0]?.id ?? null,
      is_active: true,
      image_url: "",
      variants: [
        { sku: "", barcode: "", price: "0.00", uom: "EA", is_active: true, tax_category_id: null },
      ],
    });
    setEditOpen(true);
  }

  function openEdit(row: ProductListItem) {
    // You can fetch full product if needed. For brevity, build a DTO from list row; in real app call getProduct(row.id)
    // Here we’ll open minimal form and let user adjust variants (start with one if unknown).
    setEditing({
      id: row.id,
      name: row.name,
      code: row.code || "",
      description: "",
      category_id: row.category?.id ?? null,
      tax_category_id: row.tax_category?.id ?? null,
      is_active: row.is_active,
      image_url: row.image_url || "",
      variants: [
        { price: row.min_price || "0.00", is_active: true }, // placeholder—replace with getProduct if you want exact variants
      ],
    });
    setEditOpen(true);
  }

  async function onSaveProduct() {
    if (!editing) return;
    setSaving(true);
    try {
      const payload: ProductDTO = {
        ...editing,
        name: (editing.name || "").trim(),
        code: (editing.code || "") || null,
        description: (editing.description || "") || null,
        category_id: editing.category_id || null,
        tax_category_id: editing.tax_category_id || null,
        is_active: editing.is_active !== false,
        image_url: editing.image_url || null,
        variants: (editing.variants || []).map((v) => ({
          id: v.id,
          sku: v.sku || null,
          barcode: v.barcode || null,
          price: toMoney(v.price || "0.00"),
          uom: v.uom || null,
          is_active: v.is_active !== false,
          tax_category_id: v.tax_category_id || null,
        })),
      };

      if (payload.id) {
        await updateProduct(payload.id, payload);
        setMsg("Product updated");
      } else {
        await createProduct(payload);
        setMsg("Product created");
      }
      setEditOpen(false);
      setEditing(null);
      fetchPage();
    } catch (e: any) {
      setMsg(e.message || "Failed to save product");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: number) {
    try {
      await deleteProduct(id);
      setMsg("Product deleted");
      setConfirmDeleteId(null);
      fetchPage();
    } catch (e: any) {
      setMsg(e.message || "Failed to delete product");
    }
  }

  // bulk helpers
  const allChecked = rows.length > 0 && selected.length === rows.length;
  function toggleAll() {
    setSelected(allChecked ? [] : rows.map((r) => r.id));
  }
  function toggleOne(id: number) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <div className="border-b border-slate-800 px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="h-5 w-5 text-slate-300" />
          <h1 className="text-lg font-semibold">Catalog</h1>
          <span className="text-slate-400 text-sm">({count} items)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 font-medium hover:bg-emerald-500"
          >
            <Plus className="h-4 w-4" /> New Product
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-slate-800 flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 flex-1 min-w-[260px]">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            placeholder="Search name / code / SKU / barcode…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            className="bg-transparent outline-none placeholder:text-slate-500 flex-1"
          />
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value as any); setPage(1); }}
            className="bg-transparent outline-none"
          >
            <option value="">All</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2">
          <span className="text-slate-400 text-sm">Category</span>
          <select
            value={categoryId}
            onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}
            className="bg-transparent outline-none"
          >
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c.id} value={String(c.id)}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2">
          <span className="text-slate-400 text-sm">Page size</span>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="bg-transparent outline-none"
          >
            {[12, 24, 48, 96].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      {/* Bulk actions */}
      {selected.length > 0 && (
        <div className="px-4 py-2 border-b border-slate-800 bg-slate-900/60 text-sm flex items-center gap-3">
          <span className="text-slate-300">{selected.length} selected</span>
          <button
            onClick={() => setMsg("TODO: bulk activate")}
            className="rounded bg-slate-800 px-2 py-1 hover:bg-slate-700"
          >
            Activate
          </button>
          <button
            onClick={() => setMsg("TODO: bulk deactivate")}
            className="rounded bg-slate-800 px-2 py-1 hover:bg-slate-700"
          >
            Deactivate
          </button>
          <button
            onClick={() => setMsg("TODO: bulk delete")}
            className="rounded bg-red-700 px-2 py-1 hover:bg-red-600"
          >
            Delete
          </button>
        </div>
      )}

      {/* Table */}
      <div className="px-4 py-3">
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full border-collapse">
            <thead className="bg-slate-900/70">
              <tr className="text-left text-sm text-slate-300">
                <th className="px-3 py-2 w-10">
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                </th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">On hand</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 w-28"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-400">Loading…</td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-400">No products</td>
                </tr>
              )}
              {!loading && rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-900/40">
                  <td className="px-3 py-2 align-top">
                    <input
                      type="checkbox"
                      checked={selected.includes(r.id)}
                      onChange={() => toggleOne(r.id)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 overflow-hidden rounded-lg bg-slate-800 grid place-items-center">
                        {r.image_url ? (
                          <img src={r.image_url} alt={r.name} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-slate-500 text-xs">No image</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{r.name}</div>
                        <div className="text-xs text-slate-400">
                          {r.code || "—"} • {r.variants_count} variant{r.variants_count === 1 ? "" : "s"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">{r.category?.name || "—"}</td>
                  <td className="px-3 py-2">
                    {r.min_price && r.max_price && r.min_price !== r.max_price ? (
                      <span>${toMoney(r.min_price)}–${toMoney(r.max_price)}</span>
                    ) : (
                      <span>${toMoney(r.min_price || r.max_price || 0)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {typeof r.on_hand_total === "number" ? (
                      <span className={`px-2 py-0.5 rounded text-xs ring-1 ring-inset ${
                        (r.low_stock || 0) ? "bg-amber-500/20 text-amber-300 ring-amber-500/30" :
                        r.on_hand_total <= 0 ? "bg-red-600/20 text-red-300 ring-red-600/30" :
                        "bg-emerald-500/20 text-emerald-300 ring-emerald-500/30"
                      }`}>
                        {r.on_hand_total}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {r.is_active ? (
                      <span className="inline-flex items-center gap-1 text-emerald-300">
                        <CheckCircle2 className="h-4 w-4" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-400">
                        <X className="h-4 w-4" /> Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(r)}
                        className="rounded bg-slate-800 px-2 py-1 hover:bg-slate-700"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(r.id)}
                        className="rounded bg-red-700 px-2 py-1 hover:bg-red-600"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-3 py-2 border-t border-slate-800 text-sm">
              <div className="text-slate-400">Page {page} of {totalPages}</div>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded bg-slate-800 px-2 py-1 disabled:opacity-50 hover:bg-slate-700"
                >
                  Prev
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded bg-slate-800 px-2 py-1 disabled:opacity-50 hover:bg-slate-700"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {msg && (
          <div className="mt-3 rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-sm">
            {msg}
          </div>
        )}
      </div>

      {/* Edit/Create Modal */}
      {editOpen && editing && (
        <EditProductModal
          product={editing}
          onChange={setEditing}
          categories={categories}
          taxCategories={taxCats}
          onClose={() => { setEditOpen(false); setEditing(null); }}
          onSave={onSaveProduct}
          saving={saving}
          onUploadImage={async (file) => {
            try {
              const { url } = await uploadImage(file);
              setEditing((p) => p ? { ...p, image_url: url } : p);
              setMsg("Image uploaded");
            } catch (e: any) {
              setMsg(e.message || "Image upload failed");
            }
          }}
        />
      )}

      {/* Delete confirm */}
      {confirmDeleteId !== null && (
        <ConfirmModal
          title="Delete product?"
          message="This will remove the product and its variants. This action cannot be undone."
          confirmLabel="Delete"
          confirmTone="danger"
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={() => onDelete(confirmDeleteId)}
        />
      )}
    </div>
  );
}

/* =================== Edit Product Modal =================== */

function EditProductModal({
  product,
  onChange,
  categories,
  taxCategories,
  onClose,
  onSave,
  saving,
  onUploadImage,
}: {
  product: ProductDTO;
  onChange: (p: ProductDTO) => void;
  categories: Category[];
  taxCategories: TaxCategory[];
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  onUploadImage: (file: File) => Promise<void>;
}) {
  const p = product;

  function update<K extends keyof ProductDTO>(key: K, value: ProductDTO[K]) {
    onChange({ ...p, [key]: value });
  }

//   function updateVariant(i: number, patch: Partial<ProductDTO["variants"][number]>) {
//     const next = [...(p.variants || [])];
//     next[i] = { ...next[i], ...patch };
//     update("variants", next);
//   }
  // AFTER
//     function updateVariant(i: number, patch: Partial<VariantDraft>) {
//       const current = form.variants ?? [];
//       const next = [...current];
//       next[i] = { ...(next[i] as VariantDraft), ...patch };
//       setForm({ ...form, variants: next });
//     }

    function updateVariant(i: number, patch: Partial<VariantDraft>) {
      const next = [...(p.variants || [])] as VariantDraft[];
      next[i] = { ...(next[i] || {} as VariantDraft), ...patch };
      update("variants", next);
    }

  function addVariant() {
    update("variants", [
      ...(p.variants || []),
      { sku: "", barcode: "", price: "0.00", uom: "EA", is_active: true, tax_category_id: null },
    ]);
  }

  function removeVariant(i: number) {
    const next = [...(p.variants || [])];
    next.splice(i, 1);
    update("variants", next);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl rounded-2xl bg-slate-925 bg-slate-900 border border-slate-700 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <div className="font-semibold">{p.id ? "Edit Product" : "New Product"}</div>
          <button onClick={onClose} className="rounded bg-slate-800 px-2 py-1 hover:bg-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-4 space-y-4">
          {/* Basic info */}
          <div className="grid grid-cols-1 md:grid-cols-[160px,1fr] gap-4">
            {/* Image */}
            <div className="space-y-2">
              <div className="h-36 w-36 overflow-hidden rounded-xl bg-slate-800 grid place-items-center">
                {p.image_url ? (
                  <img src={p.image_url} alt="Product" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-slate-500 text-xs">No image</span>
                )}
              </div>
              <label className="block">
                <span className="text-xs text-slate-400">Upload image</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onUploadImage(file);
                  }}
                  className="mt-1 block w-full text-sm"
                />
              </label>
            </div>

            {/* Fields */}
            <div className="grid gap-3">
              <label className="text-sm">
                Name
                <input
                  value={p.name}
                  onChange={(e) => update("name", e.target.value)}
                  className="mt-1 w-full rounded-lg bg-slate-800 px-3 py-2 outline-none"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  Code (SKU root)
                  <input
                    value={p.code || ""}
                    onChange={(e) => update("code", e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-800 px-3 py-2 outline-none"
                  />
                </label>

                <label className="text-sm">
                  Status
                  <select
                    value={p.is_active ? "true" : "false"}
                    onChange={(e) => update("is_active", e.target.value === "true")}
                    className="mt-1 w-full rounded-lg bg-slate-800 px-3 py-2 outline-none"
                  >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  Category
                  <select
                    value={p.category_id || ""}
                    onChange={(e) => update("category_id", e.target.value ? Number(e.target.value) : null)}
                    className="mt-1 w-full rounded-lg bg-slate-800 px-3 py-2 outline-none"
                  >
                    <option value="">—</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>

                <label className="text-sm">
                  Default Tax
                  <select
                    value={p.tax_category_id || ""}
                    onChange={(e) => update("tax_category_id", e.target.value ? Number(e.target.value) : null)}
                    className="mt-1 w-full rounded-lg bg-slate-800 px-3 py-2 outline-none"
                  >
                    <option value="">—</option>
                    {taxCategories.map((t) => (
                      <option key={t.id} value={t.id}>{t.name} ({Number(t.rate) * 100}%)</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="text-sm">
                Description
                <textarea
                  value={p.description || ""}
                  onChange={(e) => update("description", e.target.value)}
                  className="mt-1 w-full rounded-lg bg-slate-800 px-3 py-2 outline-none min-h-[90px]"
                />
              </label>
            </div>
          </div>

          {/* Variants */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium">Variants</div>
              <button onClick={addVariant} className="rounded bg-slate-800 px-2 py-1 hover:bg-slate-700 text-sm">
                <Plus className="h-3.5 w-3.5 inline" /> Add variant
              </button>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-800">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-900/70">
                  <tr className="text-left">
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2">Barcode</th>
                    <th className="px-3 py-2">Price</th>
                    <th className="px-3 py-2">UOM</th>
                    <th className="px-3 py-2">Tax</th>
                    <th className="px-3 py-2">Active</th>
                    <th className="px-3 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {(p.variants || []).map((v, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">
                        <input
                          value={v.sku || ""}
                          onChange={(e) => updateVariant(i, { sku: e.target.value })}
                          className="w-full rounded bg-slate-800 px-2 py-1 outline-none"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={v.barcode || ""}
                          onChange={(e) => updateVariant(i, { barcode: e.target.value })}
                          className="w-full rounded bg-slate-800 px-2 py-1 outline-none"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          inputMode="decimal"
                          value={v.price}
                          onChange={(e) => updateVariant(i, { price: e.target.value })}
                          className="w-28 rounded bg-slate-800 px-2 py-1 outline-none"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={v.uom || "EA"}
                          onChange={(e) => updateVariant(i, { uom: e.target.value })}
                          className="w-20 rounded bg-slate-800 px-2 py-1 outline-none"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={v.tax_category_id || p.tax_category_id || ""}
                          onChange={(e) =>
                            updateVariant(i, { tax_category_id: e.target.value ? Number(e.target.value) : null })
                          }
                          className="rounded bg-slate-800 px-2 py-1 outline-none"
                        >
                          <option value="">Default</option>
                          {taxCategories.map((t) => (
                            <option key={t.id} value={t.id}>{t.name} ({Number(t.rate) * 100}%)</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={v.is_active ? "true" : "false"}
                          onChange={(e) => updateVariant(i, { is_active: e.target.value === "true" })}
                          className="rounded bg-slate-800 px-2 py-1 outline-none"
                        >
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => removeVariant(i)}
                          className="rounded bg-red-700 px-2 py-1 hover:bg-red-600"
                          title="Remove variant"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(p.variants || []).length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-4 text-center text-slate-400">No variants</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="mt-2 text-xs text-slate-400">
              Tip: leave <em>Tax</em> empty to inherit the product’s default tax category.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-800 p-4">
          <button onClick={onClose} className="rounded-lg px-3 py-2 bg-slate-700 hover:bg-slate-600">Cancel</button>
          <button
            onClick={onSave}
            disabled={saving || !p.name?.trim()}
            className="rounded-lg px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* =================== Confirm Modal =================== */

function ConfirmModal({
  title,
  message,
  confirmLabel = "Confirm",
  confirmTone = "default",
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  confirmTone?: "default" | "danger";
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-slate-800 font-semibold">{title}</div>
        <div className="p-4 text-sm text-slate-300">{message}</div>
        <div className="p-4 border-t border-slate-800 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded px-3 py-2 bg-slate-700 hover:bg-slate-600">Cancel</button>
          <button
            onClick={onConfirm}
            className={`rounded px-3 py-2 ${confirmTone === "danger" ? "bg-red-700 hover:bg-red-600" : "bg-indigo-600 hover:bg-indigo-500"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
