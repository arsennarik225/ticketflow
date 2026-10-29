import type { components } from './api-schema';

export type Model<K extends keyof components['schemas']> = components['schemas'][K];
export type User = Model<'User'>;
export type Tokens = Model<'Tokens'>;
export type Event = Model<'Event'>;
export type Order = Model<'Order'>;
export type Ticket = Model<'Ticket'>;
export type Page<T> = { data: T[]; total?: number };

const KEY = 'biletflow.session';
export function session(): Tokens | null {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}
export function saveSession(value: Tokens | null) {
  if (value) sessionStorage.setItem(KEY, JSON.stringify(value));
  else sessionStorage.removeItem(KEY);
  window.dispatchEvent(new window.Event('sessionchange'));
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

let refreshing: Promise<void> | null = null;
async function refresh() {
  if (!refreshing)
    refreshing = (async () => {
      const token = session()?.refreshToken;
      if (!token) throw new ApiError(401, 'not_authenticated', 'Sign in again');
      const response = await fetch('/v1/auth/refresh', {
        method: 'POST',
        signal: AbortSignal.timeout(20000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: token }),
      });
      if (!response.ok) {
        saveSession(null);
        throw new ApiError(401, 'session_ended', 'Sign in again');
      }
      saveSession(await response.json());
    })().finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function request(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = session()?.accessToken;
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData))
    headers.set('Content-Type', 'application/json');
  let response: Response;
  try {
    response = await fetch(`/v1${path}`, { signal: AbortSignal.timeout(20000), ...init, headers });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'network_error', 'Cannot reach the API');
  }
  if (
    response.status === 401 &&
    retry &&
    token &&
    (!path.startsWith('/auth/') || path === '/auth/logout')
  ) {
    await refresh();
    return request(path, init, false);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      body.error?.code || body.result || 'unknown_error',
      body.error?.message || body.message || response.statusText,
    );
  }
  return response;
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await request(path, init);
  return response.status === 204 ? (undefined as T) : response.json();
}
export function send<T>(path: string, body?: unknown, method = 'POST', key?: string) {
  return api<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: key ? { 'Idempotency-Key': key } : undefined,
  });
}
export async function download(path: string, filename: string) {
  const blob = await (await request(path)).blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function query(values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined && value !== '') params.set(key, String(value));
  return params.size ? `?${params}` : '';
}

export function idempotencyKey() {
  return (
    crypto.randomUUID?.() ||
    Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) =>
      value.toString(16).padStart(2, '0'),
    ).join('')
  );
}
