// pos-frontend/src/lib/auth.ts
// Auth helpers: token storage, auto-refresh, and a single apiFetch wrapper.

const API_BASE = import.meta.env.VITE_API_BASE || ""; // use Vite proxy if ""

/* ---------------- storage ---------------- */

const ACCESS_KEY = "access_token";
const REFRESH_KEY = "refresh_token";
const TENANT_CODE_KEY = "tenant_code";
const TENANT_ID_KEY = "tenant_id";

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
  // keep tenant hints if you like; or clear them here as well.
  // localStorage.removeItem(TENANT_CODE_KEY);
  // localStorage.removeItem(TENANT_ID_KEY);
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

/* ---------------- token refresh (single-flight) ---------------- */

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
    throw new Error("Refresh failed");
  }

  const data = (await res.json()) as { access: string; refresh?: string };
  setAuthTokens(data.access, data.refresh ?? null);
}

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

/* ---------------- JWT helpers & role/user ---------------- */

function b64urlToB64(input: string) {
  let s = input.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return s;
}
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
function getAccessTokenFromStorage(): string | null {
  try {
    const packed =
      localStorage.getItem("auth_tokens") ||
      localStorage.getItem("tokens") ||
      localStorage.getItem("pos_tokens");
    if (packed) {
      const obj = JSON.parse(packed);
      if (obj?.access) return String(obj.access);
      if (obj?.access_token) return String(obj.access_token);
    }
  } catch { /* ignore */ }
  return (
    localStorage.getItem("access_token") ||
    localStorage.getItem("access") ||
    null
  );
}

export function getRole(): string | null {
  const access = getAccessTokenFromStorage();
  if (!access) return null;
  const payload = decodeJwt<any>(access);
  if (!payload) return null;

  const fromString =
    payload.role ||
    payload.user_role ||
    payload["https://example.com/role"] ||
    payload["x-role"];
  if (fromString) return String(fromString);

  if (payload.is_owner === true) return "owner";
  if (payload.is_cashier === true) return "cashier";
  if (payload.is_manager === true) return "manager";
  return null;
}

export type AuthUser = {
  id?: number | string;
  username?: string;
  email?: string;
  role?: string | null;
  tenant_code?: string | null;
  tenant_id?: number | string | null;
};
export function getUser(): AuthUser | null {
  const access = getAccessToken() || getAccessTokenFromStorage();
  if (!access) return null;
  const payload = decodeJwt<any>(access);
  if (!payload) return null;

  const id = payload.user_id ?? payload.id ?? payload.uid ?? payload.sub ?? null;
  const username =
    payload.username ??
    payload.user_name ??
    payload.preferred_username ??
    (typeof payload.sub === "string" ? payload.sub : undefined);
  const email = payload.email ?? payload.user_email ?? undefined;
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

/* ---------------- apiFetch (auto-refresh + retry once) ---------------- */

function needsRefresh(status: number, bodyText?: string) {
  if (status === 401 || status === 403) return true;
  if (status === 400 && bodyText) {
    const t = bodyText.toLowerCase();
    return t.includes("invalid token") || t.includes("authentication required");
  }
  return false;
}

/**
 * apiFetch prefixes relative URLs with API_BASE, injects auth headers,
 * and if it sees a 401/403 (or 400 "Invalid token"), refreshes once and retries.
 */
export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url =
    typeof input === "string" && !/^https?:\/\//i.test(input)
      ? `${API_BASE}${input}`
      : input;

  // Build headers (preserve any caller-provided headers)
  const hdrs = new Headers(init.headers || {});
  // Add Authorization / tenant hints
  const auth = authHeaders(Object.fromEntries(hdrs as any));
  for (const [k, v] of Object.entries(auth)) hdrs.set(k, v);

  // Set JSON content-type automatically for non-FormData bodies if caller didn't set it
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (!isForm && init.body && !hdrs.has("Content-Type")) {
    hdrs.set("Content-Type", "application/json");
  }

  async function once(): Promise<Response> {
    return fetch(url as any, { ...init, headers: hdrs });
  }

  // first attempt
  let res = await once();
  if (res.ok) return res;

  // maybe refresh and retry
  let text: string | undefined;
  try { text = await res.clone().text(); } catch { /* ignore */ }

  if (needsRefresh(res.status, text)) {
    try {
      await refreshAccessIfNeeded();
      // rebuild auth header after refresh
      const refreshed = authHeaders(Object.fromEntries(hdrs as any));
      for (const [k, v] of Object.entries(refreshed)) hdrs.set(k, v);
      res = await once();
      if (res.ok) return res;
    } catch {
      // fall through to logout below
    }
  }

  if (res.status === 401 || res.status === 403) {
    // token truly bad → logout
    logout();
  }
  return res; // let caller read body/error
}

/** Convenience: fetch + JSON parse + throw on !ok */
export async function apiFetchJSON<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || res.statusText);
  }
  return res.json() as Promise<T>;
}
