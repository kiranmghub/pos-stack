// src/lib/auth.ts
// Small auth helper: build headers, store tokens, refresh when needed.

const API_BASE = import.meta.env.VITE_API_BASE || ""; // Vite proxy if ""

const ACCESS_KEY = "access_token";
const REFRESH_KEY = "refresh_token";
const TENANT_CODE_KEY = "tenant_code";
const TENANT_ID_KEY = "tenant_id";

/** ---- basic storage helpers ---- */
export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}
export function getTenantCode(): string | null {
  return localStorage.getItem(TENANT_CODE_KEY);
}
export function getTenantId(): string | null {
  return localStorage.getItem(TENANT_ID_KEY);
}
export function setAuthTokens(access: string, refresh?: string | null) {
  localStorage.setItem(ACCESS_KEY, access);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
}
export function setTenantMeta({ code, id }: { code?: string | null; id?: string | number | null }) {
  if (code != null) localStorage.setItem(TENANT_CODE_KEY, String(code));
  if (id != null) localStorage.setItem(TENANT_ID_KEY, String(id));
}

export function logout() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  // keep tenant meta if you want to pre-fill next login, or clear if preferred:
  // localStorage.removeItem(TENANT_CODE_KEY);
  // localStorage.removeItem(TENANT_ID_KEY);
  // A hard reload keeps it simple for now:
  window.location.href = "/login";
}

/** Build headers for an authenticated API call */
export function authHeaders(extra: Record<string, string> = {}) {
  const h: Record<string, string> = { ...extra };
  const access = getAccessToken();
  if (access) h["Authorization"] = `Bearer ${access}`;

  // Tenant hints for middleware
  const tCode = getTenantCode();
  const tId = getTenantId();
  if (tCode) h["X-Tenant-Code"] = tCode;
  if (tId) h["X-Tenant-Id"] = tId;

  return h;
}

/** ---- token refresh (single-flight) ---- */
let refreshInFlight: Promise<void> | null = null;

async function doRefresh(): Promise<void> {
  const refresh = getRefreshToken();
  if (!refresh) throw new Error("No refresh token");

  const res = await fetch(`${API_BASE}/api/v1/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ refresh }),
  });

  if (!res.ok) {
    // refresh token invalid/expired → force logout
    throw new Error("Refresh failed");
  }

  const data = (await res.json()) as { access: string; refresh?: string };
  setAuthTokens(data.access, data.refresh ?? null);
}

/**
 * Ensures a fresh access token:
 * - we optimistically try requests and only refresh on 400/401, OR
 * - you can call this proactively if you want to refresh early.
 */
export async function refreshAccessIfNeeded() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      await doRefresh();
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

// --- add this to src/lib/auth.ts ---

/** Base64URL → Base64 */
function b64urlToB64(input: string) {
  let s = input.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return s;
}

/** Decode a JWT without verifying (client-side routing use only) */
function decodeJwt<T = any>(token: string): T | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const json = atob(b64urlToB64(parts[1]));
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/** Try to read the current access token from the places we use */
function getAccessTokenFromStorage(): string | null {
  // Prefer whatever your auth.ts already uses. We fall back to common keys.
  try {
    // If your auth.ts keeps tokens in localStorage under a single key:
    const packed =
      localStorage.getItem("auth_tokens") ||
      localStorage.getItem("tokens") ||
      localStorage.getItem("pos_tokens");
    if (packed) {
      const obj = JSON.parse(packed);
      if (obj?.access) return String(obj.access);
      if (obj?.access_token) return String(obj.access_token);
    }
  } catch {/* ignore */}
  return (
    localStorage.getItem("access_token") ||
    localStorage.getItem("access") ||
    null
  );
}

/**
 * Exported helper used by main.tsx to route users.
 * Looks for common claim names: role, user_role, or booleans like is_owner/is_cashier.
 */
export function getRole(): string | null {
  const access = getAccessTokenFromStorage();
  if (!access) return null;
  const payload = decodeJwt<any>(access);
  if (!payload) return null;

  // Prefer explicit string claims
  const fromString =
    payload.role ||
    payload.user_role ||
    payload["https://example.com/role"] ||
    payload["x-role"];
  if (fromString) return String(fromString);

  // Fall back to boolean flags
  if (payload.is_owner === true) return "owner";
  if (payload.is_cashier === true) return "cashier";
  if (payload.is_manager === true) return "manager";

  return null;
}


// --- add to src/lib/auth.ts (below getRole) ---

export type AuthUser = {
  id?: number | string;
  username?: string;
  email?: string;
  role?: string | null;
  tenant_code?: string | null;
  tenant_id?: number | string | null;
};

/** Return basic user info parsed from the access token (no network call). */
export function getUser(): AuthUser | null {
  const access = getAccessToken() || getAccessTokenFromStorage();
  if (!access) return null;

  const payload = decodeJwt<any>(access);
  if (!payload) return null;

  // id can be in a few places
  const id =
    payload.user_id ??
    payload.id ??
    payload.uid ??
    payload.sub ??
    null;

  // username can be named differently across providers
  const username =
    payload.username ??
    payload.user_name ??
    payload.preferred_username ??
    (typeof payload.sub === "string" ? payload.sub : undefined);

  const email = payload.email ?? payload.user_email ?? undefined;

  // re-use same role resolution as getRole()
  const role =
    payload.role ??
    payload.user_role ??
    payload["https://example.com/role"] ??
    payload["x-role"] ??
    (payload.is_owner ? "owner" :
     payload.is_cashier ? "cashier" :
     payload.is_manager ? "manager" : null);

  return {
    id: id ?? undefined,
    username: username ?? undefined,
    email,
    role: role ?? null,
    tenant_code: getTenantCode(),
    tenant_id: getTenantId(),
  };
}
