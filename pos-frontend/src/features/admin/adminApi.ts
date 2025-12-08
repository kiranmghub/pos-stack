// pos-frontend/src/features/admin/adminApi.ts
import { ensureAuthedFetch } from "@/components/AppShell";

export async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = "";
    try { 
      const j = await res.json();
      // Handle DRF ValidationError responses with field-specific errors
      if (j && typeof j === "object") {
        // Check for detail first (general error)
        if (j.detail) {
          detail = Array.isArray(j.detail) ? j.detail[0] : j.detail;
        } 
        // Check for field-specific errors (e.g., {"username": ["error message"]})
        else if (typeof j === "object" && !Array.isArray(j)) {
          const fieldErrors: string[] = [];
          for (const [key, value] of Object.entries(j)) {
            if (Array.isArray(value) && value.length > 0) {
              fieldErrors.push(value[0] as string);
            } else if (typeof value === "string") {
              fieldErrors.push(value);
            }
          }
          if (fieldErrors.length > 0) {
            detail = fieldErrors[0]; // Use first error message
          } else {
            detail = JSON.stringify(j);
          }
        } else {
          detail = JSON.stringify(j);
        }
      } else {
        detail = String(j);
      }
    } catch {
      detail = `${res.status} ${res.statusText}`;
    }
    throw new Error(detail || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

const BASE = "/api/v1/tenant-admin";

export type Page<T> = { count?: number; results?: T[] } | T[];

// --- typed shapes (minimal, for table columns) ---
export type AdminUser = {
  id: number; role: string; is_active: boolean;
  user: { id: number; username: string; email: string; first_name?: string; last_name?: string };
  stores: number[];
};
export type Store     = { id: number; code: string; name: string; is_active: boolean };
export type Register  = { id: number; code: string; is_active: boolean; store: number };
export type TaxCategory = { id: number; code: string; name: string; rate: string };
export type TaxRule = {
  id:number; code:string; name:string; is_active:boolean; scope:string; basis:string;
  apply_scope:string; priority:number; rate?:string|null; amount?:string|null;
};
export type DiscountRule = {
  id:number; code:string; name:string; is_active:boolean; scope:string; basis:string;
  apply_scope:string; target:string; stackable:boolean; priority:number; rate?:string|null; amount?:string|null;
};
export type Coupon = {
  id:number; code:string; name?:string; is_active:boolean; rule: { id:number; name:string; code:string };
  min_subtotal?:string|null; max_uses?:number|null; used_count?:number; remaining_uses?:number|null;
};

export type RoleOption = { value: string; label: string };

export type Query = {
  search?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
  [k: string]: any; // pass-through for extra filters
};

function qs(q?: Query) {
  const p = new URLSearchParams();
  if (!q) return "";
  Object.entries(q).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : "";
}

// Generic GET
async function getList<T>(path: string, query?: Query): Promise<Page<T>> {
  const res = await ensureAuthedFetch(`${BASE}/${path}${qs(query)}`);
  return jsonOrThrow<Page<T>>(res);
}

export const AdminAPI = {
  // NOTE: Users endpoints have moved to UsersAPI (api/users.ts)
  stores:     (q?: Query) => getList<Store>("stores/", q),
  registers:  (q?: Query) => getList<Register>("registers/", q),
  taxCats:    (q?: Query) => getList<TaxCategory>("tax-categories/", q),
  taxRules:   (q?: Query) => getList<TaxRule>("tax-rules/", q),
  discRules:  (q?: Query) => getList<DiscountRule>("discount-rules/", q),
  coupons:    (q?: Query) => getList<Coupon>("coupons/", q),
};
