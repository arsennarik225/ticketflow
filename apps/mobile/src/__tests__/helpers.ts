import { ApiClient } from '../api/client';
import { Tokens, User } from '../api/types';
import { AuthSession } from '../auth/AuthSession';

export const user: User = {
  id: 'staff-id', email: 'staff@example.test', emailVerified: true,
  fullName: 'Test Staff', roles: ['attendee', 'event_admin'],
};
export const tokenResponse = { accessToken: 'test-access', refreshToken: 'test-refresh', expiresIn: 900, user };

export function response(body?: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export function harness(initial: Tokens | null = null) {
  let saved = initial;
  const storage = {
    read: jest.fn(async () => saved),
    write: jest.fn(async (value: Tokens) => { saved = value; }),
    clear: jest.fn(async () => { saved = null; }),
  };
  const fetcher: jest.MockedFunction<typeof fetch> = jest.fn();
  const client = new ApiClient('https://api.example.test/v1', fetcher);
  const session = new AuthSession(client, storage);
  return { storage, fetcher, client, session, saved: () => saved };
}

export async function authenticate(h: ReturnType<typeof harness>) {
  await h.session.restore();
  h.fetcher.mockResolvedValueOnce(response(tokenResponse)).mockResolvedValueOnce(response(user));
  await h.session.signIn('staff@example.test', 'test-password');
}

export const nextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
