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
  const access = localStorage.getItem("access_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (access) headers.Authorization = `Bearer ${access}`;
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
  if (!res.ok) {
    const data = await handleJson(res);
    const detail = (data && (data.detail || data.error || data.message)) || res.statusText;
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return handleJson(res);
}

export function fetchOnboardingState() {
  return request("/api/v1/onboarding/state", { method: "GET" });
}

export function markOnboardingStep(step: string) {
  return request("/api/v1/onboarding/mark", {
    method: "POST",
    body: JSON.stringify({ step }),
  });
}

export function generateCode(model: string, base?: string) {
  return request("/api/v1/onboarding/generate-code", {
    method: "POST",
    body: JSON.stringify({ model, base }),
  });
}

export function createStoreQuick(payload: any) {
  return request("/api/v1/onboarding/store", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createRegisterQuick(payload: any) {
  return request("/api/v1/onboarding/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createTaxCategoryQuick(payload: any) {
  return request("/api/v1/onboarding/tax-category", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createTaxRuleQuick(payload: any) {
  return request("/api/v1/onboarding/tax-rule", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchTenantMeta() {
  return request("/api/v1/onboarding/tenant", { method: "GET" });
}
