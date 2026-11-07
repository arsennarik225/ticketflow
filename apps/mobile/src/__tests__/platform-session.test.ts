import { ApiClient } from '../api/client';
import { SessionChangedError } from '../api/errors';
import { deferred, harness, response, tokenResponse, user } from './helpers';

test('guest responses cannot complete after the account changes', async () => {
  const h = harness();
  await h.session.restore();
  const pending = deferred<Response>();
  h.fetcher.mockReturnValueOnce(pending.promise);
  const result = h.session.requestOptional('/events', value => value);
  const rejected = expect(result).rejects.toBeInstanceOf(SessionChangedError);
  h.fetcher.mockResolvedValueOnce(response(tokenResponse)).mockResolvedValueOnce(response(user));
  await h.session.signIn('staff@example.test', 'password');
  pending.resolve(response({ data: [] }));
  await rejected;
});

test('email verification securely stores the new session and uses the authoritative profile', async () => {
  const h = harness();
  await h.session.restore();
  h.fetcher.mockResolvedValueOnce(response(tokenResponse)).mockResolvedValueOnce(response(user));
  await h.session.verifyEmail('verification-token');
  expect(h.fetcher.mock.calls[0]?.[0]).toBe('https://api.example.test/v1/auth/verify-email');
  expect(h.session.getState()).toEqual({ status: 'authorized', user });
  expect(h.saved()?.accessToken).toBe(tokenResponse.accessToken);
  h.session.updateProfile({ ...user, id: 'another-account' });
  expect(h.session.getState()).toEqual({ status: 'authorized', user });
});

test('transport preserves file bytes and custom request headers', async () => {
  const bytes = new Uint8Array([0, 255, 17, 128]);
  const fetcher = jest.fn(async () => new Response(bytes));
  const client = new ApiClient('https://api.example.test/v1', fetcher);
  expect(await client.request('/me/tickets/1/pdf', value => value, {
    binary: true, token: 'access', headers: { 'Idempotency-Key': 'attempt-1' },
  })).toEqual(bytes);
  const init = (fetcher.mock.calls as unknown as [string, RequestInit][])[0]![1];
  expect(new Headers(init.headers).get('Authorization')).toBe('Bearer access');
  expect(new Headers(init.headers).get('Idempotency-Key')).toBe('attempt-1');
});

test('multipart uploads preserve the FormData body and let fetch set its boundary', async () => {
  const fetcher = jest.fn(async () => response({ id: 'attachment' }));
  const client = new ApiClient('https://api.example.test/v1', fetcher);
  const multipart = new FormData();
  multipart.append('body', 'Support message');
  await client.request('/support/cases/1/attachments', value => value, { method: 'POST', multipart });
  const init = (fetcher.mock.calls as unknown as [string, RequestInit][])[0]![1];
  expect(init.body).toBe(multipart);
  expect(new Headers(init.headers).has('Content-Type')).toBe(false);
});
