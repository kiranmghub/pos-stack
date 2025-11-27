const API_BASE = import.meta?.env?.VITE_API_BASE || "";

async function handleJson(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request(path: string, options: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const data = await handleJson(res);
    const detail = (data && (data.detail || data.error || data.message)) || res.statusText;
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return handleJson(res);
}

export function startSignup(payload: { email: string; country_code?: string; preferred_currency?: string }) {
  return request("/api/v1/signup/start", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getGeoMeta() {
  return request("/api/v1/meta/geo", {
    method: "GET",
  });
}

export function verifySignupOtp(payload: { email: string; code: string }) {
  return request("/api/v1/signup/verify-otp", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function completeSignupProfile(payload: {
  email: string;
  tenant_name: string;
  admin_first_name: string;
  admin_last_name?: string;
  admin_password: string;
}) {
  return request("/api/v1/signup/complete-profile", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listPlans(params: { country?: string; currency?: string }) {
  const q = new URLSearchParams();
  if (params.country) q.append("country", params.country);
  if (params.currency) q.append("currency", params.currency);
  const qs = q.toString();
  return request(`/api/v1/subscriptions/plans${qs ? `?${qs}` : ""}`, {
    method: "GET",
  });
}

export function createTrialSubscription(payload: {
  tenant_id: number;
  plan_code: string;
  country?: string;
  currency?: string;
  coupon_code?: string;
}) {
  return request("/api/v1/subscriptions/tenants/create-trial", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
