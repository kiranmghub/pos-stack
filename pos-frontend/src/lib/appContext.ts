// src/lib/appContext.ts
const STORE_KEY = "pos_active_store";

// Pull username/tenant code from your auth token helpers if you have them.
// If your auth.ts exposes getUsername/getTenantCode, import those here.
// Otherwise, keep these as optional/manual.
export function getActiveStoreNameFromCache(): string | null {
  try {
    const raw = localStorage.getItem("stores_cache"); // if you cache list
    const activeId = Number(localStorage.getItem(STORE_KEY) || "");
    if (!raw || !activeId) return null;
    const arr = JSON.parse(raw);
    const found = Array.isArray(arr) ? arr.find((s: any) => s.id === activeId) : null;
    return found ? (found.name || null) : null;
  } catch {
    return null;
  }
}
