import { createAttendeeSearchApi } from '../api/attendeeSearch';
import { ApiError, AuthExpiredError, UnexpectedResponseError } from '../api/errors';
import { verificationStatuses } from '../api/ticketCheckin';
import { authenticate, harness, response } from './helpers';
import { confirmedCheckIn, scanEvent, verificationBody } from './scanFixtures';
import { checkedRow, matches, searchRow } from './searchFixtures';

async function setup() {
  const h = harness();
  await authenticate(h);
  h.fetcher.mockClear();
  return { ...h, api: createAttendeeSearchApi(h.session) };
}

test('search trims and encodes the selected event and query, using the existing authenticated client', async () => {
  const h = await setup();
  h.fetcher.mockResolvedValueOnce(response(matches()));
  await expect(h.api.search('selected/event', '  Ай & name+mail@example.test  ')).resolves.toEqual(matches());
  expect(h.fetcher).toHaveBeenCalledWith('https://api.example.test/v1/checkin/events/selected%2Fevent/attendees?q=%D0%90%D0%B9%20%26%20name%2Bmail%40example.test',
    expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer test-access' }) }));
});

test.each(['', ' ', ' a ', 'x'.repeat(101)])('rejects invalid query length before any request (%j)', async (query) => {
  const h = await setup();
  await expect(h.api.search(scanEvent.id, query)).rejects.toThrow(/characters/);
  expect(h.fetcher).not.toHaveBeenCalled();
});

test.each(['ab', '🙂'.repeat(100)])('accepts backend character boundaries (%s)', async (query) => {
  const h = await setup();
  h.fetcher.mockResolvedValueOnce(response(matches()));
  await h.api.search(scanEvent.id, query);
  expect(h.fetcher).toHaveBeenCalledTimes(1);
});

test.each(['valid', 'checked_in', 'cancelled', 'refunded'] as const)('maps operational status %s and strips unrelated fields', async (status) => {
  const h = await setup();
  const row = { ...checkedRow, status };
  h.fetcher.mockResolvedValueOnce(response({ ...matches(row), data: [{ ...row, orderId: 'private-order', qrPayload: 'private-qr' }] }));
  await expect(h.api.search(scanEvent.id, 'Test')).resolves.toEqual(matches(row));
});

test('null optional fields normalize to absence and empty matches are valid', async () => {
  const h = await setup();
  const { seatLabel: _seat, ...withoutSeat } = searchRow;
  h.fetcher.mockResolvedValueOnce(response({ ...matches(), data: [{ ...withoutSeat, seatLabel: null, checkedInAt: null, checkInId: null }] }))
    .mockResolvedValueOnce(response({ ...matches(), data: [] }));
  expect((await h.api.search(scanEvent.id, 'Test')).data).toEqual([withoutSeat]);
  expect((await h.api.search(scanEvent.id, 'absent')).data).toEqual([]);
});

test.each([
  {}, { ...matches(), canReverseCheckIn: undefined }, { ...matches(), canReverseCheckIn: 'true' },
  { ...matches(), data: [{ ...searchRow, status: 'future-status' }] },
  { ...matches(), data: [{ ...searchRow, status: ['valid'] }] },
  { ...matches(), data: [{ ...searchRow, ticketId: '' }] },
  { ...matches(), data: [{ ...checkedRow, checkInId: 123 }] },
  { ...matches(), data: [{ ...checkedRow, checkedInAt: 'bad' }] },
  { ...matches(), data: [{ ...searchRow, seatLabel: {} }] },
  { ...matches(), data: [searchRow, searchRow] },
  { ...matches(), data: Array.from({ length: 51 }, (_, i) => ({ ...searchRow, ticketId: String(i) })) },
])('rejects malformed/ambiguous search responses (%j)', async (body: unknown) => {
  const h = await setup();
  h.fetcher.mockResolvedValueOnce(response(body));
  await expect(h.api.search(scanEvent.id, 'Test')).rejects.toBeInstanceOf(UnexpectedResponseError);
});

test('manual admission submits only the server ticketId and returns the confirmed active checkInId', async () => {
  const h = await setup();
  h.fetcher.mockResolvedValueOnce(response({ ...confirmedCheckIn, method: 'manual' }, 201));
  await expect(h.api.admit(scanEvent.id, searchRow.ticketId)).resolves.toMatchObject({ kind: 'admitted', checkIn: { id: confirmedCheckIn.id } });
  expect(h.fetcher).toHaveBeenCalledWith(`https://api.example.test/v1/checkin/events/${scanEvent.id}/check-ins`,
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ ticketId: searchRow.ticketId }) }));
});

test.each(verificationStatuses.filter((status) => status !== 'valid'))('manual 409 uses shared refusal decoding for %s', async (status) => {
  const h = await setup();
  h.fetcher.mockResolvedValueOnce(response(verificationBody(status), 409));
  await expect(h.api.admit(scanEvent.id, searchRow.ticketId)).resolves.toMatchObject({ kind: 'refused', verification: { result: status } });
});

test('DELETE uses the active check-in identity, no body, and accepts confirmed 204 (including already reversed)', async () => {
  const h = await setup();
  h.fetcher.mockResolvedValueOnce(response(undefined, 204));
  await expect(h.api.reverse('active/check-in')).resolves.toBeUndefined();
  expect(h.fetcher).toHaveBeenCalledWith('https://api.example.test/v1/checkin/check-ins/active%2Fcheck-in',
    expect.objectContaining({ method: 'DELETE' }));
  expect(h.fetcher.mock.calls[0]?.[1]?.body).toBeUndefined();
});

test('reversal preserves permission errors and the existing session-expiry handling', async () => {
  const h = await setup();
  h.fetcher.mockResolvedValueOnce(response({ error: { code: 'cannot_reverse_check_in' } }, 403));
  await expect(h.api.reverse(confirmedCheckIn.id)).rejects.toMatchObject(new ApiError(403, 'cannot_reverse_check_in', { error: { code: 'cannot_reverse_check_in' } }));
  h.fetcher.mockResolvedValueOnce(response({ error: { code: 'session_ended' } }, 401));
  await expect(h.api.reverse(confirmedCheckIn.id)).rejects.toBeInstanceOf(AuthExpiredError);
  expect(h.session.getState().status).toBe('signedOut');
});
