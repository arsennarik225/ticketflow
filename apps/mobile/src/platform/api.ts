import { randomUUID } from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { components } from '../../../web/src/api-schema';
import { AuthSession } from '../auth/AuthSession';
import { ApiError as SessionApiError, NetworkError } from '../api/errors';
import type { RequestOptions } from '../api/client';
import { FormValues } from './forms';
import { flowStorage } from './storage';

export type Model<K extends keyof components['schemas']> = components['schemas'][K];
export type User = Model<'User'>;
export type Event = Model<'Event'>;
export type Order = Model<'Order'>;
export type Ticket = Model<'Ticket'>;
export type Page<T> = { data: T[]; total?: number };
export type Tokens = { user: User };

let activeSession: AuthSession;
export function bindSession(value: AuthSession) {
  activeSession = value;
}
export function session(): Tokens | null {
  const state = activeSession.getState();
  return state.status === 'authorized' || state.status === 'denied'
    ? { user: state.user as User }
    : null;
}
export function saveSession(value: Tokens | null) {
  if (value) activeSession.updateProfile(value.user);
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
export interface NativeRequest {
  method?: RequestOptions['method'];
  body?: string | FormValues;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}
export async function api<T>(path: string, init: NativeRequest = {}): Promise<T> {
  try {
    if (path === '/auth/login' && init.method === 'POST') {
      const body = JSON.parse(String(init.body));
      await activeSession.signIn(body.email, body.password);
      return session() as T;
    }
    if (path === '/auth/verify-email' && init.method === 'POST') {
      if (session()) await activeSession.signOut();
      await activeSession.verifyEmail(JSON.parse(String(init.body)).token);
      return session() as T;
    }
    if (path === '/auth/logout' && init.method === 'POST') {
      await activeSession.signOut();
      flowStorage.clear();
      return undefined as T;
    }
    const result = await activeSession.requestOptional(path, (value) => value as T, {
      method: init.method,
      headers: init.headers,
      signal: init.signal,
      ...(init.body instanceof FormValues
        ? { multipart: init.body.multipart() }
        : init.body === undefined
          ? {}
          : { body: JSON.parse(init.body) }),
    });
    if (path === '/auth/password/reset') {
      await activeSession.signOut();
      flowStorage.clear();
    }
    return result;
  } catch (error) {
    if (error instanceof SessionApiError)
      throw new ApiError(
        error.status,
        error.code || 'unknown_error',
        'The request could not be completed.',
      );
    if (error instanceof NetworkError) throw new ApiError(0, 'network_error', error.message);
    throw error;
  }
}
export function send<T>(
  path: string,
  body?: unknown,
  method: RequestOptions['method'] = 'POST',
  key?: string,
) {
  return api<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: key ? { 'Idempotency-Key': key } : undefined,
  });
}
export async function download(path: string, filename: string) {
  const bytes = await activeSession.requestOptional(path, (value) => value as Uint8Array, {
    binary: true,
  });
  if (!(await Sharing.isAvailableAsync()))
    throw new Error('File sharing is unavailable on this device.');
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '') || 'download';
  const file = new File(Paths.cache, `${idempotencyKey()}-${safeName}`);
  try {
    file.write(bytes);
    await Sharing.shareAsync(file.uri);
  } finally {
    if (file.exists) file.delete();
  }
}
export function query(values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined && value !== '') params.set(key, String(value));
  return params.size ? `?${params}` : '';
}
export function idempotencyKey() {
  return randomUUID();
}
