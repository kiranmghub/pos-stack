// pos-frontend/src/features/inventory/api/stock.ts
import { apiFetchJSON, apiFetch } from "@/lib/auth";

export interface StockItem {
  id: number;
  product_name: string;
  sku: string | null;
  barcode: string | null;
  price: string;
  on_hand: number;
  low_stock: boolean;
  low_stock_threshold: number;
  reorder_point: number | null;
}

export interface StockListResponse {
  results: StockItem[];
  count: number;
  page: number;
  page_size: number;
  currency: {
    code: string;
    symbol?: string;
    precision?: number;
  };
}

export interface StockAcrossStoresResponse {
  variant_id: number;
  variant_name: string;
  variant_sku: string | null;
  stores: Array<{
    store_id: number;
    store_name: string;
    store_code: string;
    on_hand: number;
    low_stock: boolean;
    low_stock_threshold: number;
  }>;
}

export interface StockListParams {
  store_id: number;
  q?: string; // search query
  category?: string;
  page?: number;
  page_size?: number;
}

/**
 * Fetch stock list for a store
 * Security: Tenant-scoped, requires authentication
 */
export async function getStockList(
  params: StockListParams
): Promise<StockListResponse> {
  const searchParams = new URLSearchParams();
  searchParams.append("store_id", params.store_id.toString());
  if (params.q) {
    searchParams.append("q", params.q);
  }
  if (params.category) {
    searchParams.append("category", params.category);
  }
  if (params.page) {
    searchParams.append("page", params.page.toString());
  }
  if (params.page_size) {
    searchParams.append("page_size", params.page_size.toString());
  }

  const url = `/api/v1/inventory/stock?${searchParams.toString()}`;
  return apiFetchJSON<StockListResponse>(url);
}

/**
 * Fetch stock across all stores for a variant
 * Security: Tenant-scoped, requires authentication
 */
export async function getStockAcrossStores(
  variantId: number
): Promise<StockAcrossStoresResponse> {
  const url = `/api/v1/inventory/stock-across-stores?variant_id=${variantId}`;
  return apiFetchJSON<StockAcrossStoresResponse>(url);
}

/**
 * Export stock list to CSV
 * Security: Tenant-scoped, requires authentication
 */
export async function exportStockToCSV(
  params: StockListParams
): Promise<Blob> {
  const searchParams = new URLSearchParams();
  searchParams.append("store_id", params.store_id.toString());
  if (params.q) {
    searchParams.append("q", params.q);
  }
  if (params.category) {
    searchParams.append("category", params.category);
  }

  // Fetch all pages of data for export
  const allItems: StockItem[] = [];
  let currentPage = 1;
  const pageSize = 100; // Reasonable page size
  let hasMore = true;

  while (hasMore) {
    const pageParams = new URLSearchParams(searchParams);
    pageParams.append("page", currentPage.toString());
    pageParams.append("page_size", pageSize.toString());
    
    const url = `/api/v1/inventory/stock?${pageParams.toString()}`;
    const response = await apiFetch(url);

    if (!response.ok) {
      throw new Error("Failed to export stock");
    }

    const data: StockListResponse = await response.json();
    allItems.push(...data.results);
    
    hasMore = data.results.length === pageSize && allItems.length < data.count;
    currentPage++;
  }

  // Convert to CSV
  const headers = ["SKU", "Product Name", "Barcode", "Price", "On Hand", "Low Stock", "Reorder Point"];
  const rows = allItems.map((item) => [
    item.sku || "",
    item.product_name,
    item.barcode || "",
    item.price,
    item.on_hand.toString(),
    item.low_stock ? "Yes" : "No",
    item.reorder_point?.toString() || "",
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
  ].join("\n");

  return new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
}

