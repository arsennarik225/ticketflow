import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, idempotencyKey, query, saveSession, type Tokens } from './api';
import { tiyin } from './organizer';

const storage = new Map<string, string>();
const user = {
  id: 'user-1',
  email: 'a@example.kz',
  emailVerified: true,
  roles: ['attendee'] as const,
};
const tokens = { accessToken: 'old', refreshToken: 'refresh-old', user } as unknown as Tokens;
beforeEach(() => {
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal('window', { Event, dispatchEvent: vi.fn() });
});
afterEach(() => {
  storage.clear();
  vi.unstubAllGlobals();
});
describe('API client', () => {
  it('rotates one refresh token for concurrent expired requests, then retries with the new access token', async () => {
    saveSession(tokens);
    let refreshes = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, init?: RequestInit) => {
        if (path === '/v1/auth/refresh') {
          refreshes++;
          await new Promise((resolve) => setTimeout(resolve, 10));
          return Response.json({ ...tokens, accessToken: 'new', refreshToken: 'refresh-new' });
        }
        return new Headers(init?.headers).get('Authorization') === 'Bearer new'
          ? Response.json({ ok: true })
          : Response.json({}, { status: 401 });
      }),
    );
    expect(await Promise.all([api('/me'), api('/me/orders')])).toEqual([
      { ok: true },
      { ok: true },
    ]);
    expect(refreshes).toBe(1);
    expect(JSON.parse(storage.get('biletflow.session')!).refreshToken).toBe('refresh-new');
  });
  it('preserves the idempotency key when retrying after refresh', async () => {
    saveSession(tokens);
    const keys: (string | null)[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, init?: RequestInit) => {
        if (path.endsWith('/auth/refresh')) return Response.json({ ...tokens, accessToken: 'new' });
        const headers = new Headers(init?.headers);
        keys.push(headers.get('Idempotency-Key'));
        return headers.get('Authorization') === 'Bearer new'
          ? Response.json({ id: 'order-1' })
          : Response.json({}, { status: 401 });
      }),
    );
    await api('/checkout/sessions/1/confirm', {
      method: 'POST',
      body: '{}',
      headers: { 'Idempotency-Key': 'same-attempt' },
    });
    expect(keys).toEqual(['same-attempt', 'same-attempt']);
  });
  it('clears a rejected session instead of retrying indefinitely', async () => {
    saveSession(tokens);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({}, { status: 401 })),
    );
    await expect(api('/me')).rejects.toMatchObject({ code: 'session_ended' });
    expect(storage.size).toBe(0);
  });
  it('keeps a stable failure code for a connection failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(api('/events')).rejects.toMatchObject({ code: 'network_error', status: 0 });
  });
  it('does not turn aborted reads into connection errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('Aborted', 'AbortError');
      }),
    );
    await expect(api('/events')).rejects.not.toBeInstanceOf(ApiError);
  });
});
describe('form values', () => {
  it('creates retry keys on local HTTP networks where randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (value: Uint8Array) => {
        value.fill(6);
        return value;
      },
    });
    expect(idempotencyKey()).toBe('06'.repeat(16));
  });
  it('converts decimal KZT to exact integer tiyin and rejects excess precision', () => {
    expect(tiyin('1250.29')).toEqual({ amount: 125029, currency: 'KZT' });
    expect(tiyin('0.01').amount).toBe(1);
    expect(() => tiyin('1.001')).toThrow();
    expect(() => tiyin('-1')).toThrow();
  });
  it('omits empty filters and encodes literal query characters', () => {
    expect(query({ q: 'A&B', status: '', page: 2 })).toBe('?q=A%26B&page=2');
  });
});
