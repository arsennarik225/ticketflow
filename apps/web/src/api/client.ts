// src/api/client.ts
//
// Thin fetch wrapper for the BiletFlow API. Covers the "easy to get wrong"
// points from README.md: auth token refresh, error codes, idempotency keys,
// tiyin money formatting, and authed image (QR) fetches.
//
// Once the OpenAPI contract is available, generate typed models with:
//   npx openapi-typescript ../../docs/api/openapi.yaml -o src/api/schema.d.ts
// and replace the `unknown`/inline types below with those.

const API_BASE = (import.meta as any).env?.VITE_API_URL ?? "http://localhost:8000/v1";

// Backend language codes (ISO). The UI's own Lang type (see LangContext/i18n)
// uses "kz" for Kazakh for historical reasons — always convert at the boundary
// with toApiLanguage() below, never send "kz" to the API.
export type Language = "kk" | "ru" | "en";

export function toApiLanguage(uiLang: "kz" | "ru" | "en"): Language {
  return uiLang === "kz" ? "kk" : uiLang;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export interface ApiErrorBody {
  error: {
    code: string;
    /** English fallback only — never show this directly, map `code` instead. */
    message: string;
    details?: Record<string, unknown>;
  };
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(status: number, body: ApiErrorBody) {
    super(body?.error?.message ?? "Request failed");
    this.status = status;
    this.code = body?.error?.code ?? "unknown_error";
    this.details = body?.error?.details;
  }
}

// ---------------------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------------------
//
// Access token: short-lived (15 min) — kept in memory/sessionStorage, fine to
// lose on tab close. Refresh token: rotates on every use — must persist across
// tabs/reloads, so it lives in localStorage. Both are cleared together.

const ACCESS_KEY = "bf_access_token";
const REFRESH_KEY = "bf_refresh_token";

export const tokenStore = {
  getAccess: (): string | null => sessionStorage.getItem(ACCESS_KEY),
  getRefresh: (): string | null => localStorage.getItem(REFRESH_KEY),
  set: (access: string, refresh: string) => {
    sessionStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear: () => {
    sessionStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

// ---------------------------------------------------------------------------
// Language (sent as Accept-Language; see api/auth.ts for the PATCH /me sync)
// ---------------------------------------------------------------------------

let currentLanguage: Language = "kk";
export function setApiLanguage(lang: Language) {
  currentLanguage = lang;
}
export function getApiLanguage(): Language {
  return currentLanguage;
}

// ---------------------------------------------------------------------------
// Core request, with automatic refresh-and-retry on 401
// ---------------------------------------------------------------------------

let refreshing: Promise<void> | null = null;

async function doRefresh(): Promise<void> {
  const refresh = tokenStore.getRefresh();
  if (!refresh) {
    throw new ApiError(401, { error: { code: "no_refresh_token", message: "Not signed in" } });
  }
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: refresh }),
  });
  if (!res.ok) {
    tokenStore.clear();
    throw new ApiError(res.status, await res.json().catch(() => ({ error: { code: "refresh_failed", message: res.statusText } })));
  }
  const data = await res.json();
  // The refresh token rotates on every use — always store the new one.
  tokenStore.set(data.accessToken, data.refreshToken);
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Attach the access token (default true). Set false for /auth/login, /auth/register, etc. */
  auth?: boolean;
  /** Pass for mutating requests that must be safe to retry (e.g. checkout confirm). */
  idempotencyKey?: string;
  /** Internal flag — prevents an infinite refresh loop. Don't set this yourself. */
  skipRetry?: boolean;
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { body, auth = true, idempotencyKey, skipRetry, headers, ...rest } = opts;

  const h = new Headers(headers);
  if (body !== undefined) h.set("Content-Type", "application/json");
  h.set("Accept-Language", currentLanguage);
  if (idempotencyKey) h.set("Idempotency-Key", idempotencyKey);
  if (auth) {
    const token = tokenStore.getAccess();
    if (token) h.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // Access token expired mid-session: refresh once, then retry the original call.
  if (res.status === 401 && auth && !skipRetry) {
    refreshing ??= doRefresh().finally(() => {
      refreshing = null;
    });
    try {
      await refreshing;
    } catch (e) {
      tokenStore.clear();
      if (typeof window !== "undefined") window.location.assign("/login");
      throw e;
    }
    return apiRequest<T>(path, { ...opts, skipRetry: true });
  }

  if (res.status === 204) return undefined as T;

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json as ApiErrorBody);
  return json as T;
}

// ---------------------------------------------------------------------------
// Helpers called out in README.md's "easy to get wrong" section
// ---------------------------------------------------------------------------

/** Money comes back from the API as an integer count of tiyin — never send
 *  a computed price/discount back to the server, only display this. */
export function formatKZT(amountTiyin: number): string {
  return `${(amountTiyin / 100).toLocaleString("ru-RU")} ₸`;
}

/** Create once per "Pay" click; reuse the SAME key if that exact request is retried. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

/** Campaign QR / ticket QR PNGs require the auth header, so they can't be used
 *  as a plain <img src="..."> — fetch them and hand back a blob URL instead.
 *  Call URL.revokeObjectURL(url) when the <img> unmounts. */
export async function fetchAuthedImage(path: string): Promise<string> {
  const token = tokenStore.getAccess();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { code: "image_fetch_failed", message: res.statusText } }));
    throw new ApiError(res.status, body);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
