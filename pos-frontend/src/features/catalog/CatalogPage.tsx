// pos-frontend/src/features/catalog/CatalogPage.tsx
import React from "react";
import { ProductTable } from "./components/ProductTable";
import { ProductFormDrawer } from "./components/ProductFormDrawer";
import { VariantFormDrawer } from "./components/VariantFormDrawer";
import type { ProductListItem, ProductDetail, ID } from "./types";

export default function CatalogPage() {
  const [openProductForm, setOpenProductForm] = React.useState(false);
  const [openVariantForm, setOpenVariantForm] = React.useState<null | { productId?: ID, variant?: any, mode?: "view" | "edit" }>(null);
  const [focusedProduct, setFocusedProduct] = React.useState<(ProductListItem | ProductDetail) | null>(null);
  const [productMode, setProductMode] = React.useState<"view" | "edit">("edit");


  return (
    <div className="min-h-[calc(100vh-3rem)] bg-background">
      <div className="mx-auto max-w-7xl p-4 md:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Catalog</h1>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground">
          Browse products, manage variants, and upload photos.
        </p>
      </div>

      <ProductTable
        onEditProduct={(p) => {
          setFocusedProduct(p);
          setProductMode("edit");
          setOpenProductForm(true);
        }}
        onNewProduct={() => {
          setFocusedProduct(null);
          setProductMode("edit");
          setOpenProductForm(true);
        }}
        onNewVariant={(p) => setOpenVariantForm({ productId: p?.id })}
        onEditVariant={(p, v) => setOpenVariantForm({ productId: p.id, variant: v })}
        onViewVariant={(p, v) => setOpenVariantForm({ productId: p.id, variant: v, mode: "view" })}
        onViewProduct={(p) => { setFocusedProduct(p); setOpenProductForm(true); setProductMode("view"); }}
      />


      <ProductFormDrawer
        open={openProductForm}
        onClose={() => { setOpenProductForm(false); setFocusedProduct(null); }}
        mode={productMode}
        product={
          focusedProduct
            ? {
                id: focusedProduct.id,
                name: (focusedProduct as any).name,
                code: (focusedProduct as any).code,
                category: (focusedProduct as any).category,
                active: (focusedProduct as any).active,
                description: (focusedProduct as any).description,
              }
            : undefined
        }
      />

      <VariantFormDrawer
        open={!!openVariantForm}
        onClose={() => setOpenVariantForm(null)}
        productId={openVariantForm?.productId ?? focusedProduct?.id}
        variant={openVariantForm?.variant}
        mode={openVariantForm?.mode ?? "edit"}
      />
      </div>
    </div>
  );
}
