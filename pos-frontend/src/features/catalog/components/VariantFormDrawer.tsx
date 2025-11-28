// pos-frontend/src/features/catalog/components/VariantFormDrawer.tsx
import React from "react";
import { listProducts, createVariant, updateVariant, getProduct, uploadVariantImage, generateVariantSku, generateBarcode } from "../api";
import type { CreateVariantDto, UpdateVariantDto, ID } from "../types";
import { apiFetchJSON } from "@/lib/auth";
import type { ProductListItem } from "../types";
import { useNotify } from "@/lib/notify";
import { DebouncedInput } from "./DebouncedInput";
// import bwipjs from "bwip-js"; // npm i bwip-js
import bwipjs from "bwip-js/browser"; // ✅ ensures it uses the browser bundle

type TaxCategory = { id: ID; name: string; code: string };

function productOptionLabel(p: ProductListItem) {
  return p.code ? `${p.name} (${p.code})` : p.name;
}

function fmt(dt?: string) {
  if (!dt) return "";
  const d = new Date(dt);
  if (isNaN(d as any)) return dt;
  return d.toLocaleString();
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
    margin_percentage: null as number | null,
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
  mode: initialMode = "edit",
}: {
  open: boolean;
  onClose: () => void;
  productId?: ID;
  variant?: { id: ID } & Partial<CreateVariantDto>;
  mode?: "view" | "edit";
}) {
  const lockedProductId = productId ?? (variant as any)?.product;
  const isEdit = !!variant?.id;
  const isCreate = !isEdit;
  const [mode, setMode] = React.useState<"view" | "edit">(initialMode);
  React.useEffect(() => setMode(initialMode), [initialMode]);
  const isView = mode === "view";

  const { error, success, info, warn } = useNotify(); // destructure what you expose in /lib/notify
  const [errors, setErrors] = React.useState<{ [k: string]: string | undefined }>({});
  const [lastDriver, setLastDriver] = React.useState<"margin" | "price" | null>(null);


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
        margin_percentage: (variant as any)?.margin_percentage != null ? Number((variant as any)?.margin_percentage) : null,
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

  function quant(val: number | string, places = 2) {
    const num = Number(val);
    if (!isFinite(num)) return 0;
    return Number(num.toFixed(places));
  }

  function recomputePrice(cost?: number | null, margin?: number | null) {
    if (cost == null || margin == null) return form.price;
    return quant(cost * (1 + margin / 100));
  }

  function recomputeMargin(cost?: number | null, price?: number | null) {
    if (cost == null || cost === 0 || price == null) return null;
    return quant(((price - cost) / cost) * 100, 4);
  }

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
    setErrors({});
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
      margin_percentage: (variant as any)?.margin_percentage != null ? Number((variant as any)?.margin_percentage) : null,
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

// If margin is missing but cost/price are set, back-compute margin for display
React.useEffect(() => {
  setForm((s) => {
    if ((s.margin_percentage == null || isNaN(Number(s.margin_percentage))) && s.cost && s.cost !== 0 && s.price != null) {
      const m = recomputeMargin(s.cost, s.price);
      return { ...s, margin_percentage: m };
    }
    return s;
  });
}, [variant]);

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
      if (!lockedProductId) {
        setProductLabel("");
        return;
      }
      const d = await getProduct(lockedProductId);
      if (!cancelled) {
        const label = d?.code ? `${d.name} (${d.code})` : d?.name ?? `Product ID: ${String(lockedProductId)}`;
        setProductLabel(label);
      }
    } catch {
      if (!cancelled) setProductLabel(`Product ID: ${String(productId)}`);
    }
  }

  loadProductLabel();
  return () => { cancelled = true; };
}, [lockedProductId]);


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


// Clear any prior field errors when switching into view mode
React.useEffect(() => {
  if (initialMode === "view") setErrors({});
}, [initialMode]);


const barcodeCanvasRef = React.useRef<HTMLCanvasElement | null>(null);


React.useEffect(() => {
  const canvas = barcodeCanvasRef.current;
  const value = (form.barcode || "").trim();

  if (!open || !value || !canvas) return;

  // Wait for next frame to ensure canvas is in DOM and has size
  const renderBarcode = () => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      // Still not ready — try again
      requestAnimationFrame(renderBarcode);
      return;
    }

    const bctype = value.length === 13 && /^\d+$/.test(value) ? "ean13" : "code128";
    try {
      bwipjs.toCanvas(canvas, {
        bcid: bctype,
        text: value,
        scale: 3,
        height: 15,
        includetext: true,
        textxalign: 'center',
        barcolor: '000000',        // Use hex for reliability
        backgroundcolor: 'FFFFFF'  // Use hex
      });
    } catch (e) {
      console.error('Barcode rendering error:', e);
    }
  };

  // Small delay to allow DOM to settle
  const timeoutId = setTimeout(() => {
    requestAnimationFrame(renderBarcode);
  }, 10);

  return () => clearTimeout(timeoutId);
}, [open, form.barcode]);




  async function parseApiError(err: any) {
    // 1) preferred: data attached by fetch helper
    if (err?.data) return err.data;
    if (err?.payload) return err.payload;
    if (err?.response?.data) return err.response.data;

    // 2) native Response-like
    if (typeof err?.json === "function") {
      try { return await err.json(); } catch {}
    }
    if (typeof err?.response?.json === "function") {
      try { return await err.response.json(); } catch {}
    }

    // 3) stringified JSON in message/body
    const maybe = err?.message || err?.body || err?.responseText;
    if (typeof maybe === "string") {
      try { return JSON.parse(maybe); } catch {}
    }

    // 4) give up: return whatever we have
    return null;
  }


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (!form.product) {
        // alert("Please select a product for this variant.");
        setErrors((e) => ({ ...e, _non_field: "Please select a product for this variant." }));
        error("Please select a product."); // global, non-blocking
        return;
      }
      const localErrors: Record<string, string | undefined> = {};
      if (form.cost != null && form.cost < 0) {
        localErrors.cost = "Cost cannot be negative.";
      }
      if (form.margin_percentage != null) {
        if (form.cost == null) {
          localErrors.margin_percentage = "Enter cost before applying margin.";
        } else if (form.margin_percentage < -99 || form.margin_percentage > 1000) {
          localErrors.margin_percentage = "Margin must be between -99% and 1000%.";
        }
      }
      if (Object.values(localErrors).some(Boolean)) {
        setErrors((e) => ({ ...e, ...localErrors }));
        return;
      }
      const payload: UpdateVariantDto & any = {
        ...form,
        margin_percentage: form.margin_percentage ?? null,
        image_file: newImage || null,
      };
      let savedId: ID;
      if (isEdit) {
        await updateVariant(variant!.id, payload);
        // PATCH returns {ok: true}, so reuse the existing id for upload:
        savedId = variant!.id as ID;
      } else {
        const saved = await createVariant(payload);   // returns full VariantPublicSerializer
        savedId = (saved as any).id as ID;           // use server id on create
      }

      if (newImage) {
        const r = await uploadVariantImage(savedId, newImage);
        // update local preview immediately
        setForm((s) => ({ ...s, image_url: r?.image_url || s.image_url }));
        setNewImage(null);
      }
      // Refresh the expanded product's variants inline (no collapse)
      window.dispatchEvent(new CustomEvent("catalog:variant:saved", { detail: { productId: form.product } }));
      success(
        isEdit
          ? (newImage ? "Variant updated and image uploaded" : "Variant updated")
          : (newImage ? "Variant created and image uploaded" : "Variant created")
      );
      handleClose();
        } catch (err: any) {
          console.error("Save failed", err);
          const data = await parseApiError(err);

          // Field-level errors → inline
          if (data && typeof data === "object") {
            const nf = Array.isArray(data.non_field_errors) ? data.non_field_errors[0] : data.non_field_errors;

            const skuMsg = Array.isArray(data.sku) ? data.sku[0] : data.sku;
            const nameMsg = Array.isArray(data.name) ? data.name[0] : data.name;
            const barcodeMsg = Array.isArray(data.barcode) ? data.barcode[0] : data.barcode;
            const marginMsg = Array.isArray(data.margin_percentage) ? data.margin_percentage[0] : data.margin_percentage;
            const costMsg = Array.isArray(data.cost) ? data.cost[0] : data.cost;

            // Infer field messages from set-level errors (DB/DRF unique-together text)
            const inferredSkuMsg =
              !skuMsg && nf && /(sku|product[^,]*,?\s*sku)/i.test(String(nf))
                ? "This SKU already exists for this product."
                : undefined;

            const inferredNameMsg =
              !nameMsg && nf && /(name|product[^,]*,?\s*name)/i.test(String(nf))
                ? "A variant with this name already exists for this product."
                : undefined;

            const inferredBarcodeMsg =
              !barcodeMsg && nf && /(barcode|tenant[^,]*,?\s*barcode)/i.test(String(nf))
                ? "This barcode already exists within your tenant."
                : undefined;

            setErrors({
              sku: skuMsg || inferredSkuMsg,
              name: nameMsg || inferredNameMsg,
              barcode: barcodeMsg || inferredBarcodeMsg,
              margin_percentage: marginMsg,
              cost: costMsg,
              _non_field: data.detail || (!inferredSkuMsg && !inferredNameMsg && !inferredBarcodeMsg && nf) || undefined,
            });

            // Global notify summary (prefer first specific field message)
            error(
              (data && (
                data.detail ||
                skuMsg || nameMsg || barcodeMsg || marginMsg || costMsg ||
                (Array.isArray(data.sku) && data.sku[0]) ||
                (Array.isArray(data.name) && data.name[0]) ||
                (Array.isArray(data.barcode) && data.barcode[0]) ||
                (Array.isArray(data.margin_percentage) && data.margin_percentage[0]) ||
                (Array.isArray(data.cost) && data.cost[0])
              )) || "Could not save variant."
            );
          } else {
            error("Failed to save variant.");
          }

        }


  }

  function handleClose() {
    setForm(emptyVariantForm(productId));
    setNewImage(null);
    setPreviewUrl("");
    setProductQuery("");
    setErrors({});
    onClose();
  }


  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "hidden"}`}>
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      <div className="absolute right-0 top-0 h-full w-[560px] bg-zinc-900 text-zinc-100 shadow-2xl border-l border-zinc-800">
        <div className="flex items-center justify-between border-b border-zinc-800 p-4">
          <h3 className="text-lg font-semibold">
            {isView ? "Variant Details" : isEdit ? "Edit Variant" : "New Variant"}
          </h3>
          <div className="flex gap-2">
            {isView && (
              <button
                className="rounded-lg px-3 py-1 text-sm text-indigo-300 hover:bg-indigo-600/10"
                onClick={() => setMode("edit")}
              >
                Edit
              </button>
            )}
            <button className="rounded-lg px-3 py-1 text-sm hover:bg-white/5" onClick={handleClose}>
              Close
            </button>
          </div>
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

              {lockedProductId ? (
                // Locked: show read-only selected product ID
                <input
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-400"
                  value={productLabel || `Product ID: ${String(lockedProductId)}`}
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
                className={`w-full rounded-xl border px-3 py-2 text-sm bg-zinc-900 text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-indigo-500/50 ${
                  errors.name ? "border-red-500" : "border-zinc-700"
                }`}
                value={form.name}
                onChange={(e) => {
                  setForm((s) => ({ ...s, name: e.target.value }));
                  setErrors((e2) => ({ ...e2, name: undefined, _non_field: undefined }));
                }}
                disabled={isView}
              />
              {errors.name && <div className="mt-1 text-xs text-red-400">{errors.name}</div>}
            </div>

            <div>
              {/* <label className="mb-1 block text-sm font-medium">SKU</label> */}
               <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium">SKU</span>
                {!isView && (
                  <button
                    type="button"
                    className="text-xs text-indigo-300 hover:text-indigo-200"
                    onClick={async () => {
                      try {
                        const r = await generateVariantSku(form.product as any, form.name || "");
                        setForm((s) => ({ ...s, sku: r.code || s.sku }));
                      } catch (e) { error("Failed to generate SKU"); }
                    }}
                  >
                    Generate
                  </button>
                )}
              </div>
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
                disabled={isView}
              />
              {errors.sku && <div className="mt-1 text-xs text-red-400">{errors.sku}</div>}
            </div>

            <div>
              {/* <label className="mb-1 block text-sm font-medium">Barcode</label> */}
               <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium">Barcode</span>
                {!isView && (
                  <button
                    type="button"
                    className="text-xs text-indigo-300 hover:text-indigo-200"
                    onClick={async () => {
                      try {
                        const r = await generateBarcode(); // backend decides type by tenant config
                        setForm((s) => ({ ...s, barcode: r.barcode || s.barcode }));
                      } catch (e) { error("Failed to generate barcode"); }
                    }}
                  >
                    Generate
                  </button>
                )}
              </div>
              <input
                className={`w-full rounded-xl border px-3 py-2 text-sm bg-zinc-900 text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-indigo-500/50 ${
                  errors.barcode ? "border-red-500" : "border-zinc-700"
                }`}
                value={form.barcode || ""}
                onChange={(e) => {
                  setForm((s) => ({ ...s, barcode: e.target.value }));
                  setErrors((e2) => ({ ...e2, barcode: undefined, _non_field: undefined }));
                }}
                disabled={isView}
              />
              {errors.barcode && <div className="mt-1 text-xs text-red-400">{errors.barcode}</div>}
              {/* {form.barcode ? (
                // <div className="mt-2 inline-block rounded-md bg-white/90 p-2 shadow-md">
                //   <canvas ref={barcodeCanvasRef}/>
                // </div>
                  <div className="mt-2 inline-block rounded-md bg-white/90 p-2 shadow-md">
                    <canvas
                      ref={barcodeCanvasRef}
                      width={240}
                      height={80}
                      style={{ display: "block", width: "240px", height: "80px" }}
                    />
                  </div>
              ) : null} */}
              {/* ----------- BARCODE (full-width, responsive) ----------- */}
              {form.barcode ? (
                <div className="mt-2 w-full rounded-md bg-white/90 p-2 shadow-md">
                  {/* Canvas wrapper – 100% of parent, fixed aspect ratio */}
                  <div
                    className="relative w-full"
                    style={{ aspectRatio: "3 / 1" }}   // 3:1 keeps barcode shape nice
                  >
                    <canvas
                      ref={barcodeCanvasRef}
                      // The *drawing buffer* is set to a high-resolution size
                      width={720}      // 3 × 240  (scale-friendly)
                      height={240}     // 3 × 80
                      className="absolute inset-0 h-full w-full object-contain"
                    />
                  </div>
                </div>
              ) : null}

            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Cost</label>
              <input
                type="number"
                step="0.01"
                className={`w-full rounded-xl border px-3 py-2 text-sm bg-zinc-900 text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-indigo-500/50 ${
                  errors.cost ? "border-red-500" : "border-zinc-700"
                }`}
                value={form.cost ?? 0}
                onChange={(e) => {
                  const val = parseFloat(e.target.value || "0");
                  setErrors((e2) => ({ ...e2, cost: undefined, margin_percentage: undefined, _non_field: undefined }));
                  setForm((s) => {
                    let nextMargin = s.margin_percentage ?? null;
                    let nextPrice = s.price;
                    if (nextMargin != null) {
                      nextPrice = recomputePrice(val, nextMargin);
                    } else if (lastDriver === "price" && s.price != null && val > 0) {
                      nextMargin = recomputeMargin(val, s.price);
                    }
                    return { ...s, cost: val, price: nextPrice, margin_percentage: nextMargin };
                  });
                }}
                disabled={isView}
              />
              {errors.cost && <div className="mt-1 text-xs text-red-400">{errors.cost}</div>}
              <p className="mt-1 text-xs text-zinc-400">Enter cost first; margin % is optional.</p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Margin % (optional)</label>
              <input
                type="number"
                step="0.01"
                className={`w-full rounded-xl border px-3 py-2 text-sm bg-zinc-900 text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-indigo-500/50 ${
                  errors.margin_percentage ? "border-red-500" : "border-zinc-700"
                }`}
                value={form.margin_percentage ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  const val = raw === "" ? null : parseFloat(raw);
                  setLastDriver("margin");
                  setErrors((e2) => ({ ...e2, margin_percentage: undefined, _non_field: undefined }));
                  setForm((s) => {
                    if (val === null) {
                      return { ...s, margin_percentage: null };
                    }
                    if (s.cost == null || isNaN(Number(s.cost))) {
                      setErrors((e2) => ({ ...e2, margin_percentage: "Enter cost to apply a margin." }));
                      return { ...s, margin_percentage: val };
                    }
                    const nextPrice = recomputePrice(s.cost, val);
                    return { ...s, margin_percentage: val, price: nextPrice };
                  });
                }}
                disabled={isView}
              />
              {errors.margin_percentage && <div className="mt-1 text-xs text-red-400">{errors.margin_percentage}</div>}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Price</label>
              <input
                type="number"
                step="0.01"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-indigo-500/50"
                value={form.price}
                onChange={(e) => {
                  const val = parseFloat(e.target.value || "0");
                  setLastDriver("price");
                  setErrors((e2) => ({ ...e2, margin_percentage: undefined, _non_field: undefined }));
                  setForm((s) => {
                    let nextMargin = s.margin_percentage;
                    if (s.cost && s.cost !== 0) {
                      nextMargin = recomputeMargin(s.cost, val);
                    }
                    return { ...s, price: val, margin_percentage: nextMargin };
                  });
                }}
                disabled={isView}
              />
              <p className="mt-1 text-xs text-zinc-400">If you edit price directly, margin will auto-update when cost is set.</p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Unit of Measure (UOM)</label>
              <input
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500"
                value={form.uom || "each"}
                onChange={(e) => setForm((s) => ({ ...s, uom: e.target.value }))}
                placeholder="each, case, lb, etc."
                disabled={isView}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Tax Category</label>
              {taxes ? (
                <select
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                  value={String(form.tax_category || "")}
                  onChange={(e) => setForm((s) => ({ ...s, tax_category: e.target.value || "" }))}
                  disabled={isView}
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
                    disabled={isView}
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
                  disabled={isView}
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
                    disabled={isView}
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

            {/* <div>
              <label className="mb-1 block text-sm font-medium">Initial On Hand</label>
              <input
                type="number"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-indigo-500/50"
                value={form.on_hand || 0}
                onChange={(e) => setForm((s) => ({ ...s, on_hand: parseInt(e.target.value || "0") }))}
                disabled={isView || isCreate}
              />
              {isCreate && (
                <p className="mt-1 text-xs text-zinc-500">
                  Set on-hand after creating the variant via inventory adjustments or counts.
                </p>
              )}
            </div> */}

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

          {isView && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-sm">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <div className="text-zinc-400">
                  <div className="text-xs uppercase tracking-wide">Created</div>
                  <div className="text-zinc-200">
                    {fmt((variant as any)?.created_at)}
                  </div>
                </div>
                <div className="text-zinc-400">
                  <div className="text-xs uppercase tracking-wide">Updated</div>
                  <div className="text-zinc-200">
                    {fmt((variant as any)?.updated_at)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {!isView && (
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
          )}
        </form>
      </div>
    </div>
  );
}
