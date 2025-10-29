// pos-frontend/src/features/catalog/components/VariantFormDrawer.tsx
import React from "react";
import { listProducts, createVariant, updateVariant, getProduct, uploadVariantImage } from "../api";
import type { CreateVariantDto, UpdateVariantDto, ID } from "../types";
import { apiFetchJSON } from "@/lib/auth";
import type { ProductListItem } from "../types";
import { useNotify } from "@/lib/notify";
import { DebouncedInput } from "./DebouncedInput";

type TaxCategory = { id: ID; name: string; code: string };

function productOptionLabel(p: ProductListItem) {
  return p.code ? `${p.name} (${p.code})` : p.name;
}


// --- fresh form builder ---
function emptyVariantForm(productId?: string | number) {
  return {
    product: productId ?? "",
    name: "",
    sku: "",
    barcode: "",
    price: 0,
    cost: 0,
    on_hand: 0,
    active: true,
    image_file: null as File | null,
    image_url: "",
    tax_category: "" as string | "" | any,
    uom: "each",
  };
}


export function VariantFormDrawer({
  open,
  onClose,
  productId,
  variant,
}: {
  open: boolean;
  onClose: () => void;
  productId?: ID;
  variant?: { id: ID } & Partial<CreateVariantDto>;
}) {
  const isEdit = !!variant?.id;
  const { error, success, info, warn } = useNotify(); // destructure what you expose in /lib/notify
  const [errors, setErrors] = React.useState<{ [k: string]: string | undefined }>({});


// All variant fields from models
const [form, setForm] = React.useState<CreateVariantDto & {
  image_url?: string;
  tax_category?: ID | "";
  uom?: string;
}>(
  variant
    ? {
        product: (variant as any).product ?? (productId ?? ""),
        name: variant?.name || "",
        sku: variant?.sku || "",
        barcode: variant?.barcode || "",
        price: variant?.price ? Number(variant.price) : 0,
        cost: variant?.cost ? Number(variant.cost) : 0,
        on_hand: (variant as any)?.on_hand || 0,
        active: variant?.active ?? true,
        image_file: null,
        image_url: (variant as any)?.image_url || "",
        tax_category: (variant as any)?.tax_category ?? "",
        uom: (variant as any)?.uom || "each",
      }
    : emptyVariantForm(productId)
);


  const [taxes, setTaxes] = React.useState<TaxCategory[] | null>(null);
  const [taxFetchError, setTaxFetchError] = React.useState<string | null>(null);

  // === ADD PRODUCT PICKER STATE HERE ===
  const [productQuery, setProductQuery] = React.useState("");
  const [productOptions, setProductOptions] = React.useState<ProductListItem[]>([]);
  const [loadingProducts, setLoadingProducts] = React.useState(false);
  // === END ADDITION ===
  const [showProductMenu, setShowProductMenu] = React.useState(false);
  const [highlight, setHighlight] = React.useState<number>(-1);

  const productInputRef = React.useRef<HTMLInputElement>(null);
  const nameInputRef = React.useRef<HTMLInputElement>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);




  // Image preview: file > existing variant file/url > image_url text
  // const [newImage, setNewImage] = React.useState<File | null>(null);
  // const previewUrl = newImage ? URL.createObjectURL(newImage) : (variant as any)?.image_file || form.image_url || "";

  // replace the current `previewUrl = ...` line with two lines below
  const [previewUrl, setPreviewUrl] = React.useState<string>("");
  const [newImage, setNewImage] = React.useState<File | null>(null);


  const [productLabel, setProductLabel] = React.useState<string>("");


  // React.useEffect(() => {
  //   setForm((s) => ({ ...s, product: productId! }));
  // }, [productId]);

  // === ADD PRODUCT FETCH EFFECT AFTER STATE ===
  React.useEffect(() => {
    if (productId) return; // locked mode; no need to fetch options
    let cancelled = false;
    (async () => {
      try {
        setLoadingProducts(true);
        const res = await listProducts({ search: productQuery, page_size: 25 });
        if (!cancelled) setProductOptions(res.results ?? res);
      } finally {
        setLoadingProducts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId, productQuery]);
  // === END ADDITION ===

  React.useEffect(() => {
    (async () => {
      try {
        setTaxFetchError(null);
        const res = await apiFetchJSON("/api/v1/catalog/tax_categories");
        setTaxes(Array.isArray(res?.results) ? res.results : res);
      } catch {
        setTaxFetchError("No tax categories endpoint found; use manual ID.");
        setTaxes(null);
      }
    })();
  }, []);

  // 3a) When drawer opens for a NEW variant, start clean
React.useEffect(() => {
  if (open && !variant) {
    setForm(emptyVariantForm(productId));
    setNewImage(null);
    setPreviewUrl("");
    setProductQuery("");
  }
}, [open, variant, productId]);

// 3b) When switching into EDIT mode (variant prop changes), hydrate from variant
React.useEffect(() => {
  if (variant) {
    setForm({
      product: (variant as any).product ?? (productId ?? ""),
      name: variant?.name || "",
      sku: variant?.sku || "",
      barcode: variant?.barcode || "",
      price: variant?.price ? Number(variant.price) : 0,
      cost: variant?.cost ? Number(variant.cost) : 0,
      on_hand: (variant as any)?.on_hand || 0,
      active: variant?.active ?? true,
      image_file: null,
      image_url: (variant as any)?.image_url || "",
      tax_category: (variant as any)?.tax_category ?? "",
      uom: (variant as any)?.uom || "each",
    });
    setNewImage(null);
  }
}, [variant, productId]);

// 3c) If productId changes while creating NEW, lock the product field accordingly
React.useEffect(() => {
  if (!variant && productId) {
    setForm((s) => ({ ...s, product: productId }));
  }
}, [variant, productId]);

// Show "Product Name (CODE)" in locked mode
React.useEffect(() => {
  let cancelled = false;

  async function loadProductLabel() {
    try {
      if (!productId) {
        setProductLabel("");
        return;
      }
      const d = await getProduct(productId);
      if (!cancelled) {
        const label = d?.code ? `${d.name} (${d.code})` : d?.name ?? `Product ID: ${String(productId)}`;
        setProductLabel(label);
      }
    } catch {
      if (!cancelled) setProductLabel(`Product ID: ${String(productId)}`);
    }
  }

  loadProductLabel();
  return () => { cancelled = true; };
}, [productId]);


// Keep a stable object URL for the thumbnail and revoke old ones
React.useEffect(() => {
  // when a new file is chosen, show that
  if (newImage) {
    const url = URL.createObjectURL(newImage);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }
  // otherwise fall back to existing server image (if any) or typed URL
  const fallback =
    (variant as any)?.image_file ||
    (variant as any)?.image_url ||
    (typeof form.image_url === "string" ? form.image_url : "") ||
    "";
  setPreviewUrl(fallback);
  // no cleanup when using a remote URL
}, [newImage, variant, form.image_url]);



  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (!form.product) {
        // alert("Please select a product for this variant.");
        setErrors((e) => ({ ...e, _non_field: "Please select a product for this variant." }));
        error("Please select a product."); // global, non-blocking
        return;
      }
      const payload: UpdateVariantDto & any = {
        ...form,
        image_file: newImage || null,
      };
      let saved: any;
      if (isEdit) {
        saved = await updateVariant(variant!.id, payload);
      } else {
        saved = await createVariant(payload);
      }
      // If user picked a file, upload via the image endpoint
      if (newImage) {
        const r = await uploadVariantImage(saved.id, newImage);
        // update local preview immediately
        setForm((s) => ({ ...s, image_url: r?.image_url || s.image_url }));
        setNewImage(null);
      }
      // Refresh the expanded product's variants inline (no collapse)
      window.dispatchEvent(new CustomEvent("catalog:variant:saved", { detail: { productId: form.product } }));
      success(isEdit ? "Variant updated" : "Variant created");
      if (newImage) success("Image uploaded");
      handleClose();
    } catch (err: any) {
      console.error("Save failed", err);
      let data: any = null;
      try {
        if (err?.json) data = await err.json();
        else if (err?.response?.json) data = await err.response.json();
      } catch {}

      // Field-level errors → inline
      if (data && typeof data === "object") {
        const nf = Array.isArray(data.non_field_errors) ? data.non_field_errors[0] : data.non_field_errors;
        const skuMsg = Array.isArray(data.sku) ? data.sku[0] : data.sku;
        // If DRF/DB sent a set-level error, prefer showing it under the SKU field
        const inferredSkuMsg =
          !skuMsg && nf && /(sku|product[^,]*,?\s*sku)/i.test(String(nf))
            ? "This SKU already exists for this product."
            : undefined;

        setErrors({
          sku: skuMsg || inferredSkuMsg,
          name: Array.isArray(data.name) ? data.name[0] : data.name,
          _non_field: data.detail || (!inferredSkuMsg && nf) || undefined,
        });
      }
      // Global notify summary
      error(data?.detail || data?.sku?.[0] || "Could not save variant.");
    }

  }

  function handleClose() {
    setForm(emptyVariantForm(productId));
    setNewImage(null);
    setPreviewUrl("");
    setProductQuery("");
    onClose();
  }


  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "hidden"}`}>
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      <div className="absolute right-0 top-0 h-full w-[560px] bg-zinc-900 text-zinc-100 shadow-2xl border-l border-zinc-800">
        <div className="flex items-center justify-between border-b border-zinc-800 p-4">
          <h3 className="text-lg font-semibold">{isEdit ? "Edit Variant" : "New Variant"}</h3>
          <button className="rounded-lg px-3 py-1 text-sm hover:bg-white/5" onClick={handleClose}>
            Close
          </button>
        </div>

        <form className="h-[calc(100%-56px)] overflow-y-auto p-4 space-y-6" onSubmit={handleSubmit}>
          {errors._non_field && (
            <div className="rounded-md border border-red-600 bg-red-950/50 p-2 text-sm text-red-200">
              {errors._non_field}
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Product selection */}
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium">Product</label>

              {productId ? (
                // Locked: show read-only selected product ID
                <input
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-400"
                  value={productLabel || `Product ID: ${String(productId)}`}
                  readOnly
                  title="This variant will be created for the selected product."
                />
              ) : (
                <div className="relative">
                  {/* inner wrapper ensures the × centers to the input, not the whole block */}
                  <div className="relative">
                    <input
                      ref={productInputRef}
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 pr-9 text-sm text-zinc-100 placeholder-zinc-500"
                      placeholder="Type to search products by name or code…"
                      value={productQuery}
                      onChange={(e) => {
                        setProductQuery(e.target.value);
                        setShowProductMenu(true);
                        setHighlight(-1);
                        setForm((s) => ({ ...s, product: "" }));
                      }}
                      onFocus={() => { if (productQuery.length > 0) setShowProductMenu(true); }}
                      onKeyDown={(e) => {
                        // Handle Tab first so it doesn't move focus to the clear (×)
                        if (e.key === "Tab") {
                          if (showProductMenu && productOptions.length > 0) {
                            e.preventDefault();
                            const picked = highlight >= 0 ? productOptions[highlight] : productOptions[0];
                            setForm((s) => ({ ...s, product: picked.id }));
                            setProductQuery(productOptionLabel(picked));
                            setShowProductMenu(false);
                            // Move focus to Name after selection
                            setTimeout(() => nameInputRef.current?.focus(), 0);
                          }
                          return;
                        }

                        if (!showProductMenu) return;
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setHighlight((h) => Math.min(h + 1, productOptions.length - 1));
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setHighlight((h) => Math.max(h - 1, 0));
                        } else if (e.key === "Enter") {
                          if (highlight >= 0 && productOptions[highlight]) {
                            const p = productOptions[highlight];
                            setForm((s) => ({ ...s, product: p.id }));
                            setProductQuery(productOptionLabel(p));
                            setShowProductMenu(false);
                            setTimeout(() => nameInputRef.current?.focus(), 0);
                          }
                        } else if (e.key === "Escape") {
                          setShowProductMenu(false);
                        }
                      }}
                      onBlur={() => { setTimeout(() => setShowProductMenu(false), 120); }}
                    />

                    {(productQuery?.length ?? 0) > 0 && (
                      <button
                        type="button"
                        aria-label="Clear product search"
                        className="absolute inset-y-0 right-2 my-auto flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-white/5 leading-none"
                        tabIndex={-1} // ← skip in Tab order
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setProductQuery("");
                          setForm((s) => ({ ...s, product: "" }));
                          setShowProductMenu(false);
                          productInputRef.current?.focus();
                        }}
                      >
                        x
                      </button>
                    )}
                  </div>

                  {/* dropdown */}
                  {showProductMenu && (productOptions.length > 0 || loadingProducts) && (
                    <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl">
                      {loadingProducts && (
                        <div className="px-3 py-2 text-sm text-zinc-400">Searching…</div>
                      )}
                      {!loadingProducts &&
                        productOptions.map((p, i) => {
                          const isActive = i === highlight;
                          return (
                            <div
                              key={String(p.id)}
                              className={`cursor-pointer px-3 py-2 text-sm ${
                                isActive ? "bg-white/10" : "hover:bg-white/5"
                              }`}
                              onMouseEnter={() => setHighlight(i)}
                              onMouseDown={(e) => {
                                // use onMouseDown to run before input blur
                                e.preventDefault();
                                setForm((s) => ({ ...s, product: p.id }));
                                setProductQuery(productOptionLabel(p));
                                setShowProductMenu(false);
                              }}
                            >
                              <div className="text-zinc-100">{p.name}</div>
                              {p.code && <div className="text-xs text-zinc-400">{p.code}</div>}
                            </div>
                          );
                        })}
                      {!loadingProducts && productOptions.length === 0 && (
                        <div className="px-3 py-2 text-sm text-zinc-400">No matches</div>
                      )}
                    </div>
                  )}

                  {/* helper text showing selection status */}
                  <div className="mt-1 text-xs text-zinc-400">
                    {form.product ? "Product selected" : "Select a product to continue"}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Name</label>
              <input
                ref={nameInputRef}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-indigo-500/50"
                value={form.name}
                onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">SKU</label>
              <input
                className={`w-full rounded-xl border px-3 py-2 text-sm bg-zinc-900 text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-indigo-500/50 ${
                  errors.sku ? "border-red-500" : "border-zinc-700"
                }`}
                value={form.sku || ""}
                onChange={(e) => {
                  setForm((s) => ({ ...s, sku: e.target.value }));
                  // setErrors((e2) => ({ ...e2, sku: undefined }));
                  setErrors((e2) => ({ ...e2, sku: undefined, _non_field: undefined }));
                }}
              />
              {errors.sku && <div className="mt-1 text-xs text-red-400">{errors.sku}</div>}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Barcode</label>
              <input
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-indigo-500/50"
                value={form.barcode || ""}
                onChange={(e) => setForm((s) => ({ ...s, barcode: e.target.value }))}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Price</label>
              <input
                type="number"
                step="0.01"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-indigo-500/50"
                value={form.price}
                onChange={(e) => setForm((s) => ({ ...s, price: parseFloat(e.target.value || "0") }))}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Cost</label>
              <input
                type="number"
                step="0.01"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-indigo-500/50"
                value={form.cost || 0}
                onChange={(e) => setForm((s) => ({ ...s, cost: parseFloat(e.target.value || "0") }))}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Unit of Measure (UOM)</label>
              <input
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500"
                value={form.uom || "each"}
                onChange={(e) => setForm((s) => ({ ...s, uom: e.target.value }))}
                placeholder="each, case, lb, etc."
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Tax Category</label>
              {taxes ? (
                <select
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                  value={String(form.tax_category || "")}
                  onChange={(e) => setForm((s) => ({ ...s, tax_category: e.target.value || "" }))}
                >
                  <option value="">— None —</option>
                  {taxes.map((t) => (
                    <option key={String(t.id)} value={String(t.id)}>
                      {t.name} ({t.code})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="space-y-2">
                  <input
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                    placeholder="Tax Category ID (optional)"
                    value={String(form.tax_category || "")}
                    onChange={(e) => setForm((s) => ({ ...s, tax_category: e.target.value }))}
                  />
                  {taxFetchError && <div className="text-xs text-zinc-400">{taxFetchError}</div>}
                </div>
              )}
            </div>

            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Image URL (optional)</label>
                <input
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500"
                  value={form.image_url || ""}
                  onChange={(e) => setForm((s) => ({ ...s, image_url: e.target.value }))}
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Upload Image (file)</label>
                <label className="flex h-28 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-zinc-700 text-sm text-zinc-400 hover:border-zinc-500">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = (e.target.files && e.target.files[0]) || null;
                      setNewImage(f);
                      // allow picking the same file again in the next variant without needing a reload
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  />
                  Drag & drop or click to upload
                </label>
              </div>

              {(previewUrl || newImage) && (
                <div className="md:col-span-2">
                  <div className="mt-2 flex flex-wrap gap-2">
                    <div className="overflow-hidden rounded-xl border border-zinc-800">
                      {/* @ts-ignore */}
                      <img src={previewUrl} className="h-24 w-24 object-cover" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Initial On Hand</label>
              <input
                type="number"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-indigo-500/50"
                value={form.on_hand || 0}
                onChange={(e) => setForm((s) => ({ ...s, on_hand: parseInt(e.target.value || "0") }))}
              />
            </div>

            <div className="flex items-center gap-2 pt-6">
              <input
                id="vactive"
                type="checkbox"
                className="h-4 w-4"
                checked={!!form.active}
                onChange={(e) => setForm((s) => ({ ...s, active: e.target.checked }))}
              />
              <label htmlFor="vactive" className="text-sm text-zinc-200">
                Active
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-100 hover:bg-white/5"
              onClick={handleClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              {isEdit ? "Save Changes" : "Create Variant"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
