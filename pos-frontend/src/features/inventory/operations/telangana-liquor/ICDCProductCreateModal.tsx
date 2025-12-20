// pos-frontend/src/features/inventory/operations/telangana-liquor/ICDCProductCreateModal.tsx
import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNotify } from "@/lib/notify";
import { createProduct, createVariant } from "@/features/catalog/api";
import { Loader2 } from "lucide-react";

export interface ICDCProductCreateModalProps {
  open: boolean;
  onClose: () => void;
  lineData: {
    brand_number: string;
    brand_name: string;
    product_type: string;
    size_ml: number;
    btl_rate?: string;
  } | null;
  onSuccess?: (productId: number, variantId: number) => void;
}

/**
 * ICDCProductCreateModal - Create product and variant from ICDC line data
 */
export function ICDCProductCreateModal({
  open,
  onClose,
  lineData,
  onSuccess,
}: ICDCProductCreateModalProps) {
  const notify = useNotify();
  const [busy, setBusy] = useState(false);
  
  const [productName, setProductName] = useState("");
  const [productCode, setProductCode] = useState("");
  const [category, setCategory] = useState("");
  const [variantName, setVariantName] = useState("");
  const [variantSku, setVariantSku] = useState("");
  const [variantCost, setVariantCost] = useState("");
  const [variantPrice, setVariantPrice] = useState("");

  // Pre-fill form when lineData changes
  useEffect(() => {
    if (lineData && open) {
      setProductName(lineData.brand_name || "");
      setProductCode(lineData.brand_number || "");
      setCategory(lineData.product_type || "");
      
      // Variant name pattern: <brand_name>-<size_ml>ml
      const variantNamePattern = lineData.brand_name && lineData.size_ml
        ? `${lineData.brand_name}-${lineData.size_ml}ml`
        : "";
      setVariantName(variantNamePattern);
      
      // SKU pattern: <brand_number>-<size_ml>
      const skuPattern = lineData.brand_number && lineData.size_ml
        ? `${lineData.brand_number}-${lineData.size_ml}`
        : "";
      setVariantSku(skuPattern);
      
      // Pre-fill cost from btl_rate if available
      if (lineData.btl_rate) {
        setVariantCost(lineData.btl_rate);
        // Set price as cost * 1.5 (default markup)
        const costNum = parseFloat(lineData.btl_rate);
        if (!isNaN(costNum)) {
          setVariantPrice((costNum * 1.5).toFixed(2));
        }
      } else {
        setVariantCost("");
        setVariantPrice("");
      }
    }
  }, [lineData, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!productName.trim()) {
      notify.error("Product name is required");
      return;
    }
    
    if (!variantName.trim()) {
      notify.error("Variant name is required");
      return;
    }

    setBusy(true);
    try {
      // Create product first
      const product = await createProduct({
        name: productName,
        code: productCode || undefined,
        category: category || undefined,
        active: true,
      });

      // Create variant
      const variant = await createVariant({
        product: product.id,
        name: variantName,
        sku: variantSku || undefined,
        cost: variantCost ? parseFloat(variantCost) : 0,
        price: variantPrice ? parseFloat(variantPrice) : 0,
        active: true,
      });

      notify.success("Product and variant created successfully");
      
      if (onSuccess) {
        onSuccess(product.id, variant.id);
      }
      
      onClose();
    } catch (err: any) {
      notify.error(err.message || "Failed to create product/variant");
      console.error("Product creation error:", err);
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = () => {
    if (!busy) {
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Create Product & Variant</DialogTitle>
          <DialogDescription>
            Create a new product and variant from ICDC line data
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* Product Fields */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Product Information</h3>
              
              <div>
                <Label htmlFor="product-name">Product Name *</Label>
                <Input
                  id="product-name"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="Enter product name"
                  required
                  disabled={busy}
                />
              </div>

              <div>
                <Label htmlFor="product-code">Product Code (Brand Number)</Label>
                <Input
                  id="product-code"
                  value={productCode}
                  onChange={(e) => setProductCode(e.target.value)}
                  placeholder="Enter product code"
                  disabled={busy}
                />
              </div>

              <div>
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Enter category (e.g., Beer, IML)"
                  disabled={busy}
                />
              </div>
            </div>

            {/* Variant Fields */}
            <div className="space-y-2 border-t pt-4">
              <h3 className="text-sm font-semibold">Variant Information</h3>
              
              <div>
                <Label htmlFor="variant-name">Variant Name *</Label>
                <Input
                  id="variant-name"
                  value={variantName}
                  onChange={(e) => setVariantName(e.target.value)}
                  placeholder="Enter variant name (e.g., Brand Name-750ml)"
                  required
                  disabled={busy}
                />
              </div>

              <div>
                <Label htmlFor="variant-sku">SKU</Label>
                <Input
                  id="variant-sku"
                  value={variantSku}
                  onChange={(e) => setVariantSku(e.target.value)}
                  placeholder="Enter SKU"
                  disabled={busy}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="variant-cost">Cost</Label>
                  <Input
                    id="variant-cost"
                    type="number"
                    step="0.01"
                    value={variantCost}
                    onChange={(e) => setVariantCost(e.target.value)}
                    placeholder="0.00"
                    disabled={busy}
                  />
                </div>

                <div>
                  <Label htmlFor="variant-price">Price</Label>
                  <Input
                    id="variant-price"
                    type="number"
                    step="0.01"
                    value={variantPrice}
                    onChange={(e) => setVariantPrice(e.target.value)}
                    placeholder="0.00"
                    disabled={busy}
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Product & Variant"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

