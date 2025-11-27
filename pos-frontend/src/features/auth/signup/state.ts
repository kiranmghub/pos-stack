// Helpers for persisting signup state between steps using sessionStorage.

const KEY_EMAIL = "signup_email";
const KEY_COUNTRY = "signup_country";
const KEY_CURRENCY = "signup_currency";
const KEY_TENANT_ID = "signup_tenant_id";

export function persistSignupStart({
  email,
  country,
  currency,
}: {
  email: string;
  country?: string;
  currency?: string;
}) {
  sessionStorage.setItem(KEY_EMAIL, email);
  sessionStorage.setItem(KEY_COUNTRY, country || "");
  sessionStorage.setItem(KEY_CURRENCY, currency || "");
}

export function getSignupStart() {
  return {
    email: sessionStorage.getItem(KEY_EMAIL) || "",
    country: sessionStorage.getItem(KEY_COUNTRY) || "",
    currency: sessionStorage.getItem(KEY_CURRENCY) || "",
  };
}

export function persistTenantId(id: number) {
  sessionStorage.setItem(KEY_TENANT_ID, String(id));
}

export function getTenantId(): number | null {
  const raw = sessionStorage.getItem(KEY_TENANT_ID);
  if (!raw) return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

export function clearSignupState() {
  sessionStorage.removeItem(KEY_EMAIL);
  sessionStorage.removeItem(KEY_COUNTRY);
  sessionStorage.removeItem(KEY_CURRENCY);
  sessionStorage.removeItem(KEY_TENANT_ID);
}
