import React from "react";
import { ProductTable } from "./components/ProductTable";
import { ProductFormDrawer } from "./components/ProductFormDrawer";
import { VariantFormDrawer } from "./components/VariantFormDrawer";
import type { ProductListItem, ID } from "./types";

export default function CatalogPage() {
  const [openProductForm, setOpenProductForm] = React.useState(false);
  const [openVariantForm, setOpenVariantForm] = React.useState<null | { productId?: ID }>(null);
  const [focusedProduct, setFocusedProduct] = React.useState<ProductListItem | null>(null);

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Catalog</h1>
        <p className="text-sm text-zinc-600">Browse products, manage variants, and upload photos.</p>
      </div>

      <ProductTable
        onOpenProduct={(p) => setFocusedProduct(p)}
        onNewProduct={() => setOpenProductForm(true)}
        onNewVariant={(p?: ProductListItem) => setOpenVariantForm({ productId: p?.id })}
      />

      <ProductFormDrawer open={openProductForm} onClose={() => setOpenProductForm(false)} product={focusedProduct ? { id: focusedProduct.id, name: focusedProduct.name, code: focusedProduct.code, category: focusedProduct.category, active: focusedProduct.active } : undefined} />
      <VariantFormDrawer open={!!openVariantForm} onClose={() => setOpenVariantForm(null)} productId={openVariantForm?.productId ?? focusedProduct?.id} />
    </div>
  );
}
