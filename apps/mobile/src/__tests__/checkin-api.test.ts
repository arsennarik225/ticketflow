import { AssignedEvent, createCheckinApi } from '../api/checkin';
import { ApiError, AuthExpiredError, NetworkError, UnexpectedResponseError } from '../api/errors';
import { authenticate, deferred, harness, nextTurn, response, tokenResponse } from './helpers';

const event: AssignedEvent = {
  id: 'event-id', title: 'Evening at the Hall', startsAt: '2026-10-09T18:00:00+05:00',
  endsAt: '2026-10-09T21:00:00+05:00', timeZone: 'Asia/Almaty',
  venueName: 'City Hall', city: 'Almaty', status: 'upcoming',
};
const events = { data: [event], total: 1 };
const totals = { data: [], registered: 12, checkedIn: 3, canReverseCheckIn: false };
const expired = () => response({ error: { code: 'invalid_token' } }, 401);

async function authenticatedApi() {
  const h = harness();
  await authenticate(h);
  h.fetcher.mockClear();
  return { ...h, api: createCheckinApi(h.session) };
}

test('lists only assigned events through the existing authenticated session', async () => {
  const h = await authenticatedApi();
  h.fetcher.mockResolvedValueOnce(response({ data: [{ ...event, address: '10 Main Street', organizerId: 'owner' }], total: 1 }));
  await expect(h.api.getAssignedEvents()).resolves.toEqual({
    data: [{ ...event, address: '10 Main Street' }], total: 1,
  });
  expect(h.fetcher).toHaveBeenCalledWith('https://api.example.test/v1/checkin/events?assignedOnly=true',
    expect.objectContaining({ method: 'GET', headers: {
      Accept: 'application/json', Authorization: 'Bearer test-access',
    } }));
});

test('empty assigned events are a successful response', async () => {
  const h = await authenticatedApi();
  h.fetcher.mockResolvedValueOnce(response({ data: [], total: 0 }));
  await expect(h.api.getAssignedEvents()).resolves.toEqual({ data: [], total: 0 });
});

test.each([undefined, null])('omitted or null event address is safe (%s)', async (address) => {
  const h = await authenticatedApi();
  h.fetcher.mockResolvedValueOnce(response({ data: [{ ...event, address }], total: 1 }));
  await expect(h.api.getAssignedEvents()).resolves.toEqual(events);
});

test('fetches totals without q and encodes the authoritative event ID as one path segment', async () => {
  const h = await authenticatedApi();
  h.fetcher.mockResolvedValueOnce(response(totals));
  await expect(h.api.getAttendance('event/id?x=1')).resolves.toEqual({
    registered: 12, checkedIn: 3, canReverseCheckIn: false,
  });
  expect(h.fetcher).toHaveBeenCalledWith('https://api.example.test/v1/checkin/events/event%2Fid%3Fx%3D1/attendees',
    expect.objectContaining({ method: 'GET', headers: {
      Accept: 'application/json', Authorization: 'Bearer test-access',
    } }));
});

test.each([true, false, undefined, null])('preserves capability only when supplied as a boolean (%s)', async (canReverseCheckIn) => {
  const h = await authenticatedApi();
  h.fetcher.mockResolvedValueOnce(response({ data: [], registered: 0, checkedIn: 0, canReverseCheckIn }));
  await expect(h.api.getAttendance(event.id)).resolves.toEqual({ registered: 0, checkedIn: 0,
    ...(canReverseCheckIn == null ? {} : { canReverseCheckIn }),
  });
});

test('event list and attendance share coordinated refresh and retry with the rotated bearer token', async () => {
  const h = await authenticatedApi();
  const rotation = deferred<Response>();
  h.fetcher.mockImplementation(async (url, options) => {
    if (String(url).endsWith('/auth/refresh')) return rotation.promise;
    if (new Headers(options?.headers).get('Authorization') === 'Bearer test-access') return expired();
    return response(String(url).endsWith('/attendees') ? totals : events);
  });
  const list = h.api.getAssignedEvents();
  const attendance = h.api.getAttendance(event.id);
  await nextTurn();
  expect(h.fetcher.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'))).toHaveLength(1);
  rotation.resolve(response({ ...tokenResponse, accessToken: 'rotated-access', refreshToken: 'rotated-refresh' }));
  await expect(Promise.all([list, attendance])).resolves.toEqual([
    events, { registered: 12, checkedIn: 3, canReverseCheckIn: false },
  ]);
  expect(h.saved()).toMatchObject({ accessToken: 'rotated-access', refreshToken: 'rotated-refresh' });
  const retried = h.fetcher.mock.calls.filter(([, options]) =>
    new Headers(options?.headers).get('Authorization') === 'Bearer rotated-access');
  expect(retried.map(([url]) => url)).toEqual([
    'https://api.example.test/v1/checkin/events?assignedOnly=true',
    `https://api.example.test/v1/checkin/events/${event.id}/attendees`,
  ]);
});

test('failed refresh on a check-in request exits through the existing auth flow', async () => {
  const h = await authenticatedApi();
  h.fetcher.mockResolvedValueOnce(expired()).mockResolvedValueOnce(response({ error: { code: 'invalid_refresh_token' } }, 401));
  await expect(h.api.getAssignedEvents()).rejects.toBeInstanceOf(AuthExpiredError);
  expect(h.session.getState().status).toBe('signedOut');
  expect(h.saved()).toBeNull();
  expect(h.fetcher).toHaveBeenCalledTimes(2);
});

test.each([403, 404, 500])('preserves selected-event HTTP errors for the feature to handle (%i)', async (status) => {
  const h = await authenticatedApi();
  h.fetcher.mockResolvedValueOnce(response({ error: { code: 'event_unavailable' } }, status));
  await expect(h.api.getAttendance(event.id)).rejects.toMatchObject({
    status, code: 'event_unavailable', message: 'The server could not complete the request.',
  });
  expect(h.session.getState().status).toBe('authorized');
  expect(h.fetcher).toHaveBeenCalledTimes(1);
});

test('assigned-event forbidden responses remain API errors without refreshing', async () => {
  const h = await authenticatedApi();
  h.fetcher.mockResolvedValueOnce(response({ error: { code: 'not_event_staff' } }, 403));
  await expect(h.api.getAssignedEvents()).rejects.toBeInstanceOf(ApiError);
  expect(h.fetcher).toHaveBeenCalledTimes(1);
});

test('network failures use the existing safe error and remain retryable', async () => {
  const h = await authenticatedApi();
  h.fetcher.mockRejectedValueOnce(new Error('private internal transport details')).mockResolvedValueOnce(response(totals));
  await expect(h.api.getAttendance(event.id)).rejects.toBeInstanceOf(NetworkError);
  await expect(h.api.getAttendance(event.id)).resolves.toMatchObject({ registered: 12, checkedIn: 3 });
  expect(h.session.getState().status).toBe('authorized');
});

test.each([
  null, {}, { data: {}, total: 0 }, { data: [], total: '0' }, { data: [], total: -1 },
  { data: [], total: 0.5 }, { data: [event], total: 0 }, { data: [null], total: 1 },
  { data: [event, { ...event, title: 'Ambiguous event identity' }], total: 2 },
  ...[
    { id: '' }, { title: null }, { startsAt: 'not-a-date' }, { startsAt: '2026-10-09T18:00:00' },
    { startsAt: '2026-02-31T18:00:00Z' }, { startsAt: '2026-10-08T24:00:00Z' },
    { endsAt: event.startsAt }, { timeZone: 'Not/AZone' }, { venueName: undefined },
    { city: 12 }, { status: 'unknown' }, { address: {} },
  ].map((changes) => ({ data: [{ ...event, ...changes }], total: 1 })),
])('rejects malformed assigned-event responses (%j)', async (payload: unknown) => {
  const h = await authenticatedApi();
  h.fetcher.mockResolvedValueOnce(response(payload));
  await expect(h.api.getAssignedEvents()).rejects.toBeInstanceOf(UnexpectedResponseError);
});

test.each([
  null, {}, { registered: 2, checkedIn: 1 },
  { data: null, registered: 2, checkedIn: 1 }, { data: {}, registered: 2, checkedIn: 1 },
  { data: [], registered: 2 }, { data: [], registered: '2', checkedIn: 1 },
  { data: [], registered: -1, checkedIn: 0 }, { data: [], registered: 2, checkedIn: -1 },
  { data: [], registered: 1.5, checkedIn: 0 }, { data: [], registered: 2, checkedIn: 0.5 },
  { data: [], registered: Number.MAX_SAFE_INTEGER + 1, checkedIn: 0 },
  { data: [], registered: 1, checkedIn: 2 }, { data: [], registered: 2, checkedIn: 1, canReverseCheckIn: 'true' },
])('rejects malformed attendance totals (%j)', async (payload: unknown) => {
  const h = await authenticatedApi();
  h.fetcher.mockResolvedValueOnce(response(payload));
  await expect(h.api.getAttendance(event.id)).rejects.toBeInstanceOf(UnexpectedResponseError);
});

test('malformed JSON and an empty successful response use the standard decoder error', async () => {
  const h = await authenticatedApi();
  h.fetcher.mockResolvedValueOnce(new Response('{invalid', { status: 200 }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  await expect(h.api.getAssignedEvents()).rejects.toBeInstanceOf(UnexpectedResponseError);
  await expect(h.api.getAttendance(event.id)).rejects.toBeInstanceOf(UnexpectedResponseError);
});
