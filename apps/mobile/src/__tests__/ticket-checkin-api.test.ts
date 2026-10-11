import { ApiError, AuthExpiredError, NetworkError, UnexpectedResponseError } from '../api/errors';
import { createTicketCheckinApi, verificationStatuses } from '../api/ticketCheckin';
import { authenticate, harness, response, tokenResponse } from './helpers';
import { confirmedCheckIn, scannedTicket, scanEvent, verificationBody } from './scanFixtures';

async function setup() {
  const h = harness();
  await authenticate(h);
  h.fetcher.mockClear();
  return { ...h, api: createTicketCheckinApi(h.session) };
}

test('verification uses the selected event and sends the opaque QR unchanged with the existing bearer client', async () => {
  const h = await setup();
  const payload = '  untrusted://content?value=Ө&price=anything  ';
  h.fetcher.mockResolvedValueOnce(response(verificationBody()));
  await h.api.verify(scanEvent.id, payload);
  expect(h.fetcher).toHaveBeenCalledTimes(1);
  expect(h.fetcher).toHaveBeenCalledWith(`https://api.example.test/v1/checkin/events/${scanEvent.id}/verify`,
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ qrPayload: payload }),
      headers: expect.objectContaining({ Authorization: 'Bearer test-access', 'Content-Type': 'application/json' }) }));
});

test('admission uses a separate POST with qrPayload and decodes the authoritative check-in', async () => {
  const h = await setup();
  h.fetcher.mockResolvedValueOnce(response(confirmedCheckIn, 201));
  await expect(h.api.admit(scanEvent.id, 'opaque-test-qr')).resolves.toEqual({ kind: 'admitted', checkIn: confirmedCheckIn });
  expect(h.fetcher).toHaveBeenCalledWith(`https://api.example.test/v1/checkin/events/${scanEvent.id}/check-ins`,
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ qrPayload: 'opaque-test-qr' }),
      headers: expect.objectContaining({ Authorization: 'Bearer test-access' }) }));
});

test.each(verificationStatuses)('maps the server verification status %s', async (status) => {
  const h = await setup();
  h.fetcher.mockResolvedValueOnce(response(verificationBody(status)));
  await expect(h.api.verify(scanEvent.id, 'opaque-test-qr')).resolves.toMatchObject({ result: status });
});

test.each(verificationStatuses.filter((status) => status !== 'valid'))('maps structured 409 refusal %s', async (status) => {
  const h = await setup();
  h.fetcher.mockResolvedValueOnce(response(verificationBody(status), 409));
  await expect(h.api.admit(scanEvent.id, 'opaque-test-qr')).resolves.toMatchObject({
    kind: 'refused', verification: { result: status },
  });
  expect(h.fetcher).toHaveBeenCalledTimes(1);
});

test('409 decoding is endpoint-specific; unrelated requests keep generic ApiError behavior', async () => {
  const h = await setup();
  h.fetcher.mockResolvedValueOnce(response(verificationBody('already_used'), 409));
  await expect(h.session.request('/unrelated', (value) => value)).rejects.toBeInstanceOf(ApiError);
});

test('optional ticket/previousCheckIn/seat fields tolerate omission or null, and only displayed fields are retained', async () => {
  const h = await setup();
  h.fetcher.mockResolvedValueOnce(response({ result: 'invalid', message: 'Invalid', ticket: null, previousCheckIn: null }))
    .mockResolvedValueOnce(response({ ...verificationBody(), ticket: { ...scannedTicket, seat: null, qrPayload: 'do-not-retain', pdfUrl: 'private-url' } }));
  await expect(h.api.verify(scanEvent.id, 'opaque-test-qr')).resolves.toEqual({ result: 'invalid' });
  await expect(h.api.verify(scanEvent.id, 'opaque-test-qr')).resolves.toEqual({ result: 'valid', ticket: scannedTicket });
});

test.each([
  {}, { result: 'future_status', message: 'Do not render this' }, { result: 'valid', message: 'No ticket' },
  { ...verificationBody(), ticket: { ...scannedTicket, eventId: 'different-event' } },
  { ...verificationBody(), ticket: { ...scannedTicket, attendee: { fullName: 1 } } },
  { ...verificationBody(), ticket: { ...scannedTicket, seat: { section: 'A' } } },
  { ...verificationBody('already_used'), previousCheckIn: { ...confirmedCheckIn, ticketId: 'different-ticket' } },
])('rejects malformed verification responses safely (%j)', async (body: unknown) => {
  const h = await setup();
  h.fetcher.mockResolvedValueOnce(response(body));
  await expect(h.api.verify(scanEvent.id, 'opaque-test-qr')).rejects.toBeInstanceOf(UnexpectedResponseError);
});

test.each([verificationBody(), { error: { code: 'conflict' } }, { result: 'invented', message: 'Private' }])(
  'rejects malformed or contradictory 409 bodies (%j)', async (body: unknown) => {
    const h = await setup();
    h.fetcher.mockResolvedValueOnce(response(body, 409));
    await expect(h.api.admit(scanEvent.id, 'opaque-test-qr')).rejects.toBeInstanceOf(UnexpectedResponseError);
  },
);

test.each([{}, { ...confirmedCheckIn, checkedInAt: 'bad-date' }, { ...confirmedCheckIn, ticketId: null }])(
  'rejects malformed admission confirmations (%j)', async (body: unknown) => {
    const h = await setup();
    h.fetcher.mockResolvedValueOnce(response(body, 201));
    await expect(h.api.admit(scanEvent.id, 'opaque-test-qr')).rejects.toBeInstanceOf(UnexpectedResponseError);
  },
);

test('network response loss never automatically repeats admission', async () => {
  const h = await setup();
  h.fetcher.mockRejectedValueOnce(new Error('private transport details'));
  await expect(h.api.admit(scanEvent.id, 'opaque-test-qr')).rejects.toBeInstanceOf(NetworkError);
  expect(h.fetcher).toHaveBeenCalledTimes(1);
});

test('verification reuses coordinated refresh and session expiry behavior', async () => {
  const h = await setup();
  h.fetcher.mockResolvedValueOnce(response({ error: { code: 'invalid_token' } }, 401))
    .mockResolvedValueOnce(response({ ...tokenResponse, accessToken: 'new-access' }))
    .mockResolvedValueOnce(response(verificationBody()));
  await expect(h.api.verify(scanEvent.id, 'opaque-test-qr')).resolves.toMatchObject({ result: 'valid' });
  expect(h.fetcher.mock.calls[2]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer new-access' });
  h.fetcher.mockResolvedValueOnce(response({ error: { code: 'session_ended' } }, 401));
  await expect(h.api.admit(scanEvent.id, 'opaque-test-qr')).rejects.toBeInstanceOf(AuthExpiredError);
  expect(h.session.getState().status).toBe('signedOut');
});
