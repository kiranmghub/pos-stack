// pos-frontend/src/features/inventory/api/ledger.ts
import { apiFetchJSON } from "@/lib/auth";

export interface LedgerEntry {
  id: number;
  created_at: string; // ISO datetime string
  store_id: number;
  store_name?: string | null;
  store_code?: string | null;
  variant_id: number;
  product_name: string | null;
  sku: string | null;
  qty_delta: number; // signed integer
  balance_after: number | null;
  ref_type: string;
  ref_id: number | null;
  note: string;
  created_by: string | null;
}

export interface LedgerListResponse {
  results: LedgerEntry[];
  count: number;
}

export interface LedgerListParams {
  store_id?: number | null; // null = "All Stores"
  variant_id?: number;
  q?: string; // search query
  ref_type?: string;
  ref_id?: number;
  date_from?: string; // ISO date or datetime string
  date_to?: string; // ISO date or datetime string
  page?: number;
  page_size?: number;
}

/**
 * Fetch ledger entries with filters
 * Security: Tenant-scoped via API
 */
export async function getLedgerList(params: LedgerListParams): Promise<LedgerListResponse> {
  const searchParams = new URLSearchParams();
  
  if (params.store_id !== undefined && params.store_id !== null) {
    searchParams.append("store_id", params.store_id.toString());
  }
  if (params.variant_id !== undefined) {
    searchParams.append("variant_id", params.variant_id.toString());
  }
  if (params.q) {
    searchParams.append("q", params.q);
  }
  if (params.ref_type) {
    searchParams.append("ref_type", params.ref_type);
  }
  if (params.ref_id !== undefined) {
    searchParams.append("ref_id", params.ref_id.toString());
  }
  if (params.date_from) {
    searchParams.append("date_from", params.date_from);
  }
  if (params.date_to) {
    searchParams.append("date_to", params.date_to);
  }
  if (params.page !== undefined) {
    searchParams.append("page", params.page.toString());
  }
  if (params.page_size !== undefined) {
    searchParams.append("page_size", params.page_size.toString());
  }

  return apiFetchJSON(`/api/v1/inventory/ledger?${searchParams.toString()}`);
}

/**
 * Export ledger entries to CSV
 * Security: Tenant-scoped via API
 */
export async function exportLedgerToCSV(params: LedgerListParams): Promise<Blob> {
  // Fetch all entries (no pagination for export)
  const allParams = { ...params, page: 1, page_size: 10000 };
  const data = await getLedgerList(allParams);

  // Convert to CSV
  const headers = [
    "Date",
    "Store",
    "Product",
    "SKU",
    "Quantity Delta",
    "Balance After",
    "Type",
    "Reference ID",
    "Note",
    "Created By",
  ];

  const rows = data.results.map((entry) => [
    new Date(entry.created_at).toLocaleString(),
    entry.store_name || entry.store_code || `Store ${entry.store_id}`,
    entry.product_name || "N/A",
    entry.sku || "N/A",
    entry.qty_delta.toString(),
    entry.balance_after?.toString() || "N/A",
    entry.ref_type,
    entry.ref_id?.toString() || "N/A",
    entry.note || "",
    entry.created_by || "N/A",
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
  ].join("\n");

  return new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
}

/**
 * Export ledger entries to JSON
 * Security: Tenant-scoped via API
 */
export async function exportLedgerToJSON(params: LedgerListParams): Promise<Blob> {
  const allParams = { ...params, page: 1, page_size: 10000 };
  const data = await getLedgerList(allParams);

  const jsonContent = JSON.stringify(data.results, null, 2);
  return new Blob([jsonContent], { type: "application/json;charset=utf-8;" });
}

/**
 * Ref type options for filtering
 */
export const REF_TYPE_OPTIONS = [
  { value: "ADJUSTMENT", label: "Adjustment" },
  { value: "SALE", label: "POS Sale" },
  { value: "RETURN", label: "Return" },
  { value: "TRANSFER_OUT", label: "Transfer Out" },
  { value: "TRANSFER_IN", label: "Transfer In" },
  { value: "COUNT_RECONCILE", label: "Count Reconcile" },
  { value: "PURCHASE_ORDER_RECEIPT", label: "Purchase Order Receipt" },
  { value: "WASTE", label: "Waste" },
  { value: "RESERVATION", label: "Reservation" },
  { value: "RESERVATION_COMMIT", label: "Reservation Commit" },
  { value: "RESERVATION_RELEASE", label: "Reservation Release" },
] as const;

