import type { AppConfig, CompanyGuess, Content, PhotoId, ReportResponse } from "./types";

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) || "";
const KEY_STORE = "abhay.key";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

function accessKey(): string { try { return localStorage.getItem(KEY_STORE) || ""; } catch { return ""; } }
export function setAccessKey(k: string) { try { localStorage.setItem(KEY_STORE, k); } catch { /* storage blocked */ } }

async function req<T>(path: string, init: RequestInit = {}, timeoutMs = 120000): Promise<T> {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), timeoutMs);
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  const k = accessKey(); if (k) headers["x-abhay-key"] = k;
  try {
    const r = await fetch(BASE + path, { ...init, headers, signal: ctl.signal });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const code = (j && (j.error || j.detail)) || "error";
      const msg = (j && (j.detail || j.error)) || r.statusText;
      throw new ApiError(r.status, String(code), String(msg));
    }
    return j as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, "network", (e as Error).name === "AbortError" ? "The request took too long." : "Could not reach the Abhay server.");
  } finally { clearTimeout(to); }
}

const post = <T,>(path: string, body: unknown, timeoutMs?: number) =>
  req<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, timeoutMs);

export const api = {
  config: () => req<AppConfig>("/api/config"),
  content: () => req<Content>("/api/content"),
  companyCheck: (name: string, domain: string, desc: string) => post<CompanyGuess>("/api/company-check", { name, domain, desc }, 90000),
  entities: (q: string, known: string[]) => post<{ list: { name: string; what: string; industry: string }[] }>("/api/entities", { q, known }, 60000),
  cachedReport: (company: string, domain: string, startupConfirmed: boolean) =>
    req<ReportResponse & { found: boolean }>(`/api/report?company=${encodeURIComponent(company)}&domain=${encodeURIComponent(domain)}&startupConfirmed=${startupConfirmed}`),
  buildReport: (body: { company: string; domain: string; startupConfirmed: boolean; refresh: boolean; ctx: Record<string, string> }) =>
    post<ReportResponse>("/api/report", body, 240000),
  ocr: async (blob: Blob) => {
    const fd = new FormData(); fd.append("image", blob, "photo.jpg");
    return req<{ lines: string[] }>("/api/ocr", { method: "POST", body: fd }, 70000);
  },
  identifyPhoto: async (blob: Blob) => {
    const fd = new FormData(); fd.append("image", blob, "photo.jpg");
    return req<PhotoId>("/api/identify-photo", { method: "POST", body: fd }, 90000);
  },
  saveLog: (body: Record<string, unknown>) => post<{ id: number }>("/api/logs", body),
};

export function isNotConfigured(e: unknown) { return e instanceof ApiError && (e.status === 503 || e.code === "llm_not_configured"); }
