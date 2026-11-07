import { COPY } from "@/copy.js";

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error ?? COPY.COMMON.ERROR);
    this.status = status;
    this.fields = body?.fields ?? null;
  }
}

export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: method === "GET" ? {} : { "content-type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });
  if (res.status === 204) return null;
  const type = res.headers.get("content-type") ?? "";
  const data = type.includes("json") ? await res.json() : await res.text();
  if (!res.ok) {
    if (res.status === 401 && path !== "/auth/login") window.dispatchEvent(new Event("crm:signed-out"));
    throw new ApiError(res.status, typeof data === "string" ? { error: data } : data);
  }
  return data;
}

export const qs = (params) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    s.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  const out = s.toString();
  return out ? `?${out}` : "";
};
