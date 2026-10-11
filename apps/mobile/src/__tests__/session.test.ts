import { ApiError, AuthExpiredError, SessionChangedError, StorageError, UnexpectedResponseError } from '../api/errors';
import { parseUser } from '../api/types';
import { authenticate, deferred, harness, nextTurn, response, tokenResponse, user } from './helpers';

const expired = () => response({ error: { code: 'invalid_token', message: 'Expired' } }, 401);

test('successful sign-in persists tokens and calls /me with bearer authentication', async () => {
  const h = harness();
  await authenticate(h);
  expect(h.session.getState()).toEqual({ status: 'authorized', user });
  expect(h.saved()).toMatchObject({ accessToken: 'test-access', refreshToken: 'test-refresh' });
  expect(h.fetcher.mock.calls[0]?.[1]?.headers).not.toHaveProperty('Authorization');
  expect(h.fetcher.mock.calls[1]).toEqual(['https://api.example.test/v1/me', expect.objectContaining({
    headers: { Accept: 'application/json', Authorization: 'Bearer test-access' },
  })]);
});

test('failed login leaves no session and never attempts refresh', async () => {
  const h = harness();
  await h.session.restore();
  h.fetcher.mockResolvedValue(response({ error: { code: 'invalid_credentials', message: 'Wrong' } }, 401));
  await expect(h.session.signIn('staff@example.test', 'wrong')).rejects.toBeInstanceOf(ApiError);
  expect(h.session.getState().status).toBe('signedOut');
  expect(h.saved()).toBeNull();
  expect(h.fetcher).toHaveBeenCalledTimes(1);
});

test.each([['attendee'], ['organizer'], ['platform_admin'], ['attendee', 'organizer', 'platform_admin']])
('uses /me and denies roles without event_admin: %j', async (...roles) => {
  const h = harness();
  await h.session.restore();
  h.fetcher.mockResolvedValueOnce(response(tokenResponse)).mockResolvedValueOnce(response({ ...user, roles }));
  await h.session.signIn('staff@example.test', 'test-password');
  expect(h.session.getState().status).toBe('denied');
});

test('a multi-role Event Admin is allowed; an unverified account is denied', async () => {
  const h = harness(tokenResponse);
  h.fetcher.mockResolvedValueOnce(response({ ...user, roles: ['organizer', 'event_admin'] }));
  await h.session.restore();
  expect(h.session.getState().status).toBe('authorized');
  h.fetcher.mockResolvedValueOnce(response({ ...user, emailVerified: false }));
  await h.session.restore();
  expect(h.session.getState().status).toBe('denied');
});

test('restores from secure storage and verifies the user online', async () => {
  const h = harness(tokenResponse);
  h.fetcher.mockResolvedValueOnce(response(user));
  const first = h.session.restore();
  expect(h.session.getState().status).toBe('restoring');
  await Promise.all([first, h.session.restore()]);
  expect(h.storage.read).toHaveBeenCalledTimes(1);
  expect(h.fetcher).toHaveBeenCalledTimes(1);
  expect(h.session.getState().status).toBe('authorized');
});

test('restore failure does not grant offline access and can be retried', async () => {
  const h = harness(tokenResponse);
  h.fetcher.mockRejectedValueOnce(new Error('unreachable'));
  await h.session.restore();
  expect(h.session.getState()).toMatchObject({ status: 'unavailable', action: 'restore' });
  h.fetcher.mockResolvedValueOnce(response(user));
  await h.session.restore();
  expect(h.session.getState().status).toBe('authorized');
});

test('logout removes local tokens and protected state after HTTP 204', async () => {
  const h = harness();
  await authenticate(h);
  h.fetcher.mockResolvedValueOnce(response(undefined, 204));
  await h.session.signOut();
  expect(h.saved()).toBeNull();
  expect(h.session.getState().status).toBe('signedOut');
  await expect(h.session.request('/me', parseUser)).rejects.toBeInstanceOf(AuthExpiredError);
});

test('logout clears local tokens even when the server is unreachable', async () => {
  const h = harness();
  await authenticate(h);
  h.fetcher.mockRejectedValueOnce(new Error('unreachable'));
  await h.session.signOut();
  expect(h.saved()).toBeNull();
  expect(h.session.getState()).toMatchObject({ status: 'signedOut', message: expect.stringContaining('could not be confirmed') });
});

test('logout renews an expired access token before server revocation', async () => {
  const h = harness({ accessToken: 'old', refreshToken: 'old-refresh', expiresAt: 1 });
  h.fetcher.mockResolvedValueOnce(response(user));
  await h.session.restore();
  h.fetcher.mockResolvedValueOnce(response(tokenResponse)).mockResolvedValueOnce(response(undefined, 204));
  await h.session.signOut();
  expect(h.fetcher.mock.calls[1]?.[0]).toContain('/auth/refresh');
  expect(h.fetcher.mock.calls[2]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer test-access' });
  expect(h.saved()).toBeNull();
});

test('concurrent expired requests share a single refresh and persist both rotated tokens', async () => {
  const h = harness();
  await authenticate(h);
  h.fetcher.mockClear();
  const rotation = deferred<Response>();
  h.fetcher.mockImplementation(async (url, options) => {
    if (String(url).endsWith('/auth/refresh')) return rotation.promise;
    return (options?.headers as Record<string, string>).Authorization === 'Bearer test-access' ? expired() : response(user);
  });
  const first = h.session.request('/me', parseUser);
  const second = h.session.request('/me', parseUser);
  await nextTurn();
  expect(h.fetcher.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'))).toHaveLength(1);
  rotation.resolve(response({ ...tokenResponse, accessToken: 'rotated-access', refreshToken: 'rotated-refresh' }));
  await expect(Promise.all([first, second])).resolves.toEqual([user, user]);
  expect(h.saved()).toMatchObject({ accessToken: 'rotated-access', refreshToken: 'rotated-refresh' });
  expect(h.storage.write).toHaveBeenCalledTimes(2);
});

test('a delayed 401 reuses the completed rotation even if the JWT string is unchanged', async () => {
  const h = harness();
  await authenticate(h);
  const delayed = deferred<Response>();
  h.fetcher.mockResolvedValueOnce(expired()).mockReturnValueOnce(delayed.promise)
    .mockResolvedValueOnce(response({ ...tokenResponse, refreshToken: 'rotated-refresh' }))
    .mockResolvedValueOnce(response(user));
  const first = h.session.request('/me', parseUser);
  const second = h.session.request('/me', parseUser);
  await first;
  h.fetcher.mockResolvedValueOnce(response(user));
  delayed.resolve(expired());
  await second;
  expect(h.fetcher.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'))).toHaveLength(1);
});

test.each([401, 500])('refresh failure (%i) clears the session', async (status) => {
  const h = harness();
  await authenticate(h);
  h.fetcher.mockResolvedValueOnce(expired()).mockResolvedValueOnce(response({ error: { code: 'invalid_refresh_token' } }, status));
  await expect(h.session.request('/me', parseUser)).rejects.toBeInstanceOf(AuthExpiredError);
  expect(h.saved()).toBeNull();
  expect(h.session.getState().status).toBe('signedOut');
});

test('a refresh network failure clears the session', async () => {
  const h = harness();
  await authenticate(h);
  h.fetcher.mockResolvedValueOnce(expired()).mockRejectedValueOnce(new Error('network'));
  await expect(h.session.request('/me', parseUser)).rejects.toBeInstanceOf(AuthExpiredError);
  expect(h.saved()).toBeNull();
});

test('malformed rotated tokens never replace the saved session', async () => {
  const h = harness();
  await authenticate(h);
  h.fetcher.mockResolvedValueOnce(expired()).mockResolvedValueOnce(response({ accessToken: 'missing-refresh-token' }));
  await expect(h.session.request('/me', parseUser)).rejects.toBeInstanceOf(AuthExpiredError);
  expect(h.saved()).toBeNull();
});

test('a second 401 ends the session without a refresh loop', async () => {
  const h = harness();
  await authenticate(h);
  h.fetcher.mockClear();
  h.fetcher.mockResolvedValueOnce(expired()).mockResolvedValueOnce(response(tokenResponse)).mockResolvedValueOnce(expired());
  await expect(h.session.request('/me', parseUser)).rejects.toBeInstanceOf(AuthExpiredError);
  expect(h.fetcher).toHaveBeenCalledTimes(3);
  expect(h.session.getState().status).toBe('signedOut');
});

test('ordinary forbidden responses do not refresh or end the session', async () => {
  const h = harness();
  await authenticate(h);
  h.fetcher.mockResolvedValueOnce(response({ error: { code: 'not_event_staff' } }, 403));
  await expect(h.session.request('/me', parseUser)).rejects.toBeInstanceOf(ApiError);
  expect(h.session.getState().status).toBe('authorized');
  expect(h.fetcher).toHaveBeenCalledTimes(3);
});

test.each([[401, 'session_ended'], [403, 'account_suspended']])('revoked or suspended sessions are cleared (%s)', async (status, code) => {
  const h = harness();
  await authenticate(h);
  h.fetcher.mockResolvedValueOnce(response({ error: { code } }, status));
  await expect(h.session.request('/me', parseUser)).rejects.toBeInstanceOf(AuthExpiredError);
  expect(h.saved()).toBeNull();
  expect(h.fetcher).toHaveBeenCalledTimes(3);
});

test('logout during rotation cannot restore credentials or protected UI', async () => {
  const h = harness();
  await authenticate(h);
  const rotation = deferred<Response>();
  h.fetcher.mockResolvedValueOnce(expired()).mockReturnValueOnce(rotation.promise).mockResolvedValueOnce(response(undefined, 204));
  const request = h.session.request('/me', parseUser);
  const assertion = expect(request).rejects.toBeInstanceOf(SessionChangedError);
  await nextTurn();
  const logout = h.session.signOut();
  expect(h.session.getState().status).toBe('signingOut');
  rotation.resolve(response({ ...tokenResponse, accessToken: 'rotated-access', refreshToken: 'rotated-refresh' }));
  await Promise.all([logout, assertion]);
  expect(h.saved()).toBeNull();
  expect(h.storage.write).toHaveBeenCalledTimes(1);
  expect(h.session.getState().status).toBe('signedOut');
  expect(h.fetcher.mock.calls.at(-1)?.[1]?.headers).toMatchObject({ Authorization: 'Bearer rotated-access' });
});

test('logout during restoration cannot reopen protected UI', async () => {
  const h = harness(tokenResponse);
  const profile = deferred<Response>();
  h.fetcher.mockReturnValueOnce(profile.promise).mockResolvedValueOnce(response(tokenResponse)).mockResolvedValueOnce(response(undefined, 204));
  const restore = h.session.restore();
  await nextTurn();
  await h.session.signOut();
  profile.resolve(response(user));
  await restore;
  expect(h.session.getState().status).toBe('signedOut');
  expect(h.saved()).toBeNull();
});

test('secure-storage save failure does not allow authenticated access', async () => {
  const h = harness();
  await h.session.restore();
  h.storage.write.mockRejectedValueOnce(new StorageError());
  h.fetcher.mockResolvedValueOnce(response(tokenResponse)).mockResolvedValueOnce(response(undefined, 204));
  await expect(h.session.signIn('staff@example.test', 'test-password')).rejects.toBeInstanceOf(StorageError);
  expect(h.session.getState()).toMatchObject({ status: 'signedOut', message: expect.stringContaining('Secure storage') });
  expect(h.saved()).toBeNull();
});

test('failed local cleanup blocks access until deletion is retried successfully', async () => {
  const h = harness();
  await authenticate(h);
  h.storage.clear.mockRejectedValueOnce(new StorageError());
  h.fetcher.mockResolvedValueOnce(response(undefined, 204));
  await h.session.signOut();
  expect(h.session.getState()).toMatchObject({ status: 'unavailable', action: 'clear' });
  await h.session.signOut();
  expect(h.session.getState().status).toBe('signedOut');
  expect(h.saved()).toBeNull();
});

test('malformed /me response cannot grant access after login', async () => {
  const h = harness();
  await h.session.restore();
  h.fetcher.mockResolvedValueOnce(response(tokenResponse)).mockResolvedValueOnce(response({ roles: ['event_admin'] }))
    .mockResolvedValueOnce(response(undefined, 204));
  await expect(h.session.signIn('staff@example.test', 'test-password')).rejects.toBeInstanceOf(UnexpectedResponseError);
  expect(h.session.getState().status).toBe('signedOut');
  expect(h.saved()).toBeNull();
});
