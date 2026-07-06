// Single source of truth for talking to the backend.
// Centralizes API base resolution, query-string building, and error shape so
// no component has to re-implement fetch + error handling boilerplate.

export const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

function buildUrl(path, params) {
  const base = `${API_BASE}${path}`;
  if (!params) return base;
  const search =
    params instanceof URLSearchParams
      ? params
      : new URLSearchParams(
          Object.entries(params)
            .filter(([, value]) => value !== undefined && value !== null && value !== "")
            .map(([key, value]) => [key, String(value)])
        );
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}

async function request(path, { params, ...options } = {}) {
  const response = await fetch(buildUrl(path, params), options);
  if (!response.ok) {
    // Backend errors surface a `detail` field; extract it when present but
    // never let a missing/non-JSON body mask the underlying HTTP failure.
    let detail;
    try {
      detail = (await response.json())?.detail;
    } catch {
      detail = undefined;
    }
    throw new ApiError(detail || `Request failed with status ${response.status}`, response.status, detail);
  }
  if (response.status === 204) return null;
  return response.json();
}

export function apiGet(path, params, { signal } = {}) {
  return request(path, { params, signal });
}

export function apiPost(path, { params, body, signal } = {}) {
  return request(path, {
    method: "POST",
    params,
    signal,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
