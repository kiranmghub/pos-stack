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

export function fetchMetricsOverview(params?: { start?: string; end?: string }) {
  const q = new URLSearchParams();
  if (params?.start) q.append("start", params.start);
  if (params?.end) q.append("end", params.end);
  const qs = q.toString();
  return request(`/api/v1/analytics/metrics/overview${qs ? `?${qs}` : ""}`, { method: "GET" });
}
