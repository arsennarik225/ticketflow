import { ApiClient } from '../api/client';
import { ApiError, errorMessage, NetworkError, UnexpectedResponseError } from '../api/errors';
import { parseEmpty, parseUser } from '../api/types';
import { response, user } from './helpers';

const identity = (value: unknown) => value;

test('builds the URL, JSON body, and bearer header', async () => {
  const fetcher: jest.MockedFunction<typeof fetch> = jest.fn().mockResolvedValue(response(user));
  const client = new ApiClient('https://api.example.test/v1', fetcher);
  await expect(client.request('/me', parseUser, { method: 'POST', token: 'test-token', body: { example: true } }))
    .resolves.toEqual(user);
  expect(fetcher).toHaveBeenCalledWith('https://api.example.test/v1/me', expect.objectContaining({
    method: 'POST', body: '{"example":true}', redirect: 'error',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
  }));
});

test('handles 204 without trying to parse JSON', async () => {
  const fetcher: jest.MockedFunction<typeof fetch> = jest.fn().mockResolvedValue(response(undefined, 204));
  await expect(new ApiClient('https://api.example.test/v1', fetcher).request('/auth/logout', parseEmpty))
    .resolves.toBeUndefined();
  expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({ Accept: 'application/json' });
});

test('parses standard API errors without exposing server internals in messages', async () => {
  const body = { error: { code: 'invalid_credentials', message: 'Internal server detail' } };
  const fetcher: jest.MockedFunction<typeof fetch> = jest.fn().mockResolvedValue(response(body, 401));
  try { await new ApiClient('https://api.example.test/v1', fetcher).request('/auth/login', identity); }
  catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: 'invalid_credentials', body });
    expect(errorMessage(error)).toBe('The email or password is incorrect.');
    expect(String(error)).not.toContain('Internal server detail');
    return;
  }
  throw new Error('Expected an API error');
});

test('retains a nonstandard 409 body for future endpoint-specific handling', async () => {
  const body = { result: 'already_used', previousCheckIn: { id: 'example-check-in' } };
  const fetcher: jest.MockedFunction<typeof fetch> = jest.fn().mockResolvedValue(response(body, 409));
  await expect(new ApiClient('https://api.example.test/v1', fetcher).request('/example', identity))
    .rejects.toMatchObject({ status: 409, code: undefined, body });
});

test.each(['not-json', ''])('rejects malformed or empty successful responses: %s', async (text) => {
  const fetcher: jest.MockedFunction<typeof fetch> = jest.fn().mockResolvedValue(new Response(text, { status: 200 }));
  await expect(new ApiClient('https://api.example.test/v1', fetcher).request('/me', parseUser))
    .rejects.toBeInstanceOf(UnexpectedResponseError);
});

test('an HTML server error remains a safe API error', async () => {
  const fetcher: jest.MockedFunction<typeof fetch> = jest.fn().mockResolvedValue(new Response('<html>trace</html>', { status: 502 }));
  await expect(new ApiClient('https://api.example.test/v1', fetcher).request('/me', parseUser))
    .rejects.toMatchObject({ status: 502, body: undefined });
});

test('network failure is distinguished from an API refusal', async () => {
  const fetcher: jest.MockedFunction<typeof fetch> = jest.fn().mockRejectedValue(new TypeError('Network detail'));
  await expect(new ApiClient('https://api.example.test/v1', fetcher).request('/me', parseUser))
    .rejects.toBeInstanceOf(NetworkError);
});

test('times out stalled requests', async () => {
  jest.useFakeTimers();
  try {
    const fetcher: jest.MockedFunction<typeof fetch> = jest.fn((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const result = new ApiClient('https://api.example.test/v1', fetcher, 100).request('/me', parseUser);
    const assertion = expect(result).rejects.toBeInstanceOf(NetworkError);
    await jest.advanceTimersByTimeAsync(101);
    await assertion;
  } finally { jest.useRealTimers(); }
});

test('rejects absolute URLs before attaching credentials', async () => {
  const fetcher: jest.MockedFunction<typeof fetch> = jest.fn();
  await expect(new ApiClient('https://api.example.test/v1', fetcher).request('https://elsewhere.test', identity))
    .rejects.toThrow('relative');
  expect(fetcher).not.toHaveBeenCalled();
});

test('rejects a user response with missing authorization fields', () => {
  expect(() => parseUser({ id: 'staff', email: 'staff@example.test' })).toThrow(UnexpectedResponseError);
});
