import { AttendeeMatches, AttendeeSearchApi } from '../api/attendeeSearch';
import { ApiError, AuthExpiredError, NetworkError, UnexpectedResponseError } from '../api/errors';
import { AdmissionResult, verificationStatuses } from '../api/ticketCheckin';
import { resultCopy } from '../features/checkin/resultCopy';
import { AttendeeSearchSession } from '../features/search/AttendeeSearchSession';
import { deferred } from './helpers';
import { confirmedCheckIn, scanEvent } from './scanFixtures';
import { checkedRow, matches, searchRow } from './searchFixtures';

function setup(data = matches()) {
  const api: jest.Mocked<AttendeeSearchApi> = {
    search: jest.fn().mockResolvedValue(data),
    admit: jest.fn().mockResolvedValue({ kind: 'admitted', checkIn: confirmedCheckIn }),
    reverse: jest.fn().mockResolvedValue(undefined),
  };
  const totals = jest.fn();
  const accessLost = jest.fn();
  const flow = new AttendeeSearchSession(scanEvent.id, api, totals, accessLost);
  flow.setQuery('Test');
  return { api, totals, accessLost, flow };
}

test('typing clears old rows and does not request; invalid submission stays local', async () => {
  const h = setup();
  await h.flow.search();
  h.flow.setQuery('a');
  expect(h.flow.getState().data).toBeNull();
  expect(h.api.search).toHaveBeenCalledTimes(1);
  await h.flow.search();
  expect(h.flow.getState().error).toMatch(/at least 2/);
  expect(h.api.search).toHaveBeenCalledTimes(1);
});

test('repeated submissions share the pending query; editing still permits a new query', async () => {
  const h = setup();
  const first = deferred<AttendeeMatches>();
  h.api.search.mockReturnValueOnce(first.promise);
  const pending = h.flow.search();
  await h.flow.search();
  expect(h.api.search).toHaveBeenCalledTimes(1);
  h.flow.setQuery('New query');
  await h.flow.search();
  expect(h.api.search).toHaveBeenCalledTimes(2);
  first.resolve(matches(checkedRow));
  await pending;
  expect(h.flow.getState()).toMatchObject({ query: 'New query', data: matches(), fresh: true });
});

test.each(['success', 'error', 'forbidden'] as const)('old-query %s cannot overwrite a newer query or revoke its access', async (result) => {
  const h = setup();
  const old = deferred<AttendeeMatches>();
  h.api.search.mockReturnValueOnce(old.promise);
  const pending = h.flow.search();
  h.flow.setQuery(' new query ');
  await h.flow.search();
  if (result === 'success') old.resolve(matches(checkedRow));
  else old.reject(result === 'forbidden' ? new ApiError(403, 'not_event_staff', {}) : new NetworkError());
  await pending;
  expect(h.flow.getState()).toMatchObject({ query: 'new query', data: matches(), fresh: true, error: null });
  expect(h.accessLost).not.toHaveBeenCalled();
});

test('failed same-query refresh keeps useful rows but blocks mutations until a successful read', async () => {
  const h = setup();
  await h.flow.search();
  h.api.search.mockRejectedValueOnce(new NetworkError());
  await h.flow.search();
  expect(h.flow.getState()).toMatchObject({ data: matches(), fresh: false });
  await h.flow.admit(searchRow);
  expect(h.api.admit).not.toHaveBeenCalled();
  await h.flow.search();
  expect(h.flow.getState().fresh).toBe(true);
});

test('same-frame taps and concurrent rows cannot send two mutations; post-admission reads supply active ID', async () => {
  const other = { ...searchRow, ticketId: 'other' };
  const h = setup({ ...matches(), data: [searchRow, other] });
  await h.flow.search();
  const admission = deferred<AdmissionResult>();
  h.api.admit.mockReturnValueOnce(admission.promise);
  h.api.search.mockResolvedValueOnce(matches(checkedRow));
  const pending = h.flow.admit(searchRow);
  await h.flow.admit(searchRow);
  await h.flow.admit(other);
  h.flow.setQuery('different');
  await h.flow.search();
  expect(h.api.admit).toHaveBeenCalledTimes(1);
  expect(h.flow.getState().query).toBe('Test');
  admission.resolve({ kind: 'admitted', checkIn: confirmedCheckIn });
  await pending;
  expect(h.totals).toHaveBeenCalledTimes(1);
  expect(h.api.search).toHaveBeenCalledTimes(2);
  expect(h.flow.getState()).toMatchObject({ data: matches(checkedRow), mutation: { kind: 'outcome', title: 'Check-in confirmed' } });
});

test('a stale row reference cannot admit after refreshing the same ticket or changing query', async () => {
  const h = setup();
  await h.flow.search();
  h.api.search.mockResolvedValueOnce(matches({ ...searchRow }));
  await h.flow.search();
  await h.flow.admit(searchRow);
  h.flow.setQuery('New');
  await h.flow.admit(searchRow);
  expect(h.api.admit).not.toHaveBeenCalled();
});

test.each(['checked_in', 'cancelled', 'refunded'] as const)('never offers admission for %s rows', async (status) => {
  const row = { ...searchRow, status };
  const h = setup(matches(row));
  await h.flow.search();
  await h.flow.admit(row);
  expect(h.api.admit).not.toHaveBeenCalled();
});

test.each(verificationStatuses.filter((status) => status !== 'valid'))('manual refusal %s reuses scanner language and refetches state', async (status) => {
  const h = setup();
  await h.flow.search();
  h.api.admit.mockResolvedValueOnce({ kind: 'refused', verification: { result: status } });
  await h.flow.admit(searchRow);
  expect(h.flow.getState().mutation).toMatchObject({ title: resultCopy[status].title, detail: expect.stringContaining('Check-in was refused.') });
  expect(h.totals).toHaveBeenCalledTimes(1);
  expect(h.api.search).toHaveBeenCalledTimes(2);
});

test('successful admission survives result-refresh failure without locally changing validity', async () => {
  const h = setup();
  await h.flow.search();
  h.api.search.mockRejectedValueOnce(new NetworkError());
  await h.flow.admit(searchRow);
  expect(h.flow.getState()).toMatchObject({ fresh: false, data: matches(), mutation: { title: 'Check-in confirmed' } });
  await h.flow.admit(searchRow);
  expect(h.api.admit).toHaveBeenCalledTimes(1);
});

test.each([matches(searchRow, true), matches(checkedRow, false)])('reversal requires both an active ID and true server capability (%j)', async (data) => {
  const h = setup(data);
  await h.flow.search();
  h.flow.requestReversal(data.data[0]!);
  await h.flow.confirmReversal();
  expect(h.flow.getState().mutation).toBeNull();
  expect(h.api.reverse).not.toHaveBeenCalled();
});

test('reversal requires confirmation, supports cancellation, uses active ID and guards repeated confirmations', async () => {
  const h = setup(matches(checkedRow));
  await h.flow.search();
  await h.flow.confirmReversal();
  h.flow.requestReversal(checkedRow);
  expect(h.api.reverse).not.toHaveBeenCalled();
  h.flow.cancelReversal();
  await h.flow.confirmReversal();
  expect(h.api.reverse).not.toHaveBeenCalled();
  h.flow.requestReversal(checkedRow);
  const reversal = deferred<void>();
  h.api.reverse.mockReturnValueOnce(reversal.promise);
  h.api.search.mockResolvedValueOnce(matches(searchRow));
  const pending = h.flow.confirmReversal();
  await h.flow.confirmReversal();
  expect(h.api.reverse).toHaveBeenCalledTimes(1);
  expect(h.api.reverse).toHaveBeenCalledWith(checkedRow.checkInId);
  reversal.resolve();
  await pending;
  expect(h.totals).toHaveBeenCalledTimes(1);
  expect(h.flow.getState()).toMatchObject({ data: matches(searchRow), mutation: { title: 'Reversal confirmed' } });
  expect(h.flow.getState().data?.data[0]?.checkInId).toBeUndefined();
});

test('refresh cancels a confirmation and does not let it target an older active ID', async () => {
  const h = setup(matches(checkedRow));
  await h.flow.search();
  h.flow.requestReversal(checkedRow);
  h.api.search.mockResolvedValueOnce(matches({ ...checkedRow, checkInId: 'new-active-id' }));
  await h.flow.search();
  await h.flow.confirmReversal();
  h.flow.requestReversal(checkedRow);
  await h.flow.confirmReversal();
  expect(h.api.reverse).not.toHaveBeenCalled();
});

test('reversal confirmation does not infer valid status: refreshed cancelled ticket stays ineligible', async () => {
  const h = setup(matches(checkedRow));
  await h.flow.search();
  const cancelled = { ...searchRow, status: 'cancelled' as const };
  h.api.search.mockResolvedValueOnce(matches(cancelled));
  h.flow.requestReversal(checkedRow);
  await h.flow.confirmReversal();
  await h.flow.admit(cancelled);
  expect(h.flow.getState().data?.data[0]).toEqual(cancelled);
  expect(h.api.admit).not.toHaveBeenCalled();
});

test('permission-specific 403 hides Undo, retains checked-in state, and does not falsely revoke assignment', async () => {
  const h = setup(matches(checkedRow));
  await h.flow.search();
  h.api.reverse.mockRejectedValueOnce(new ApiError(403, 'cannot_reverse_check_in', {}));
  h.api.search.mockRejectedValueOnce(new NetworkError());
  h.flow.requestReversal(checkedRow);
  await h.flow.confirmReversal();
  expect(h.flow.getState()).toMatchObject({ fresh: false, data: matches(checkedRow, false), mutation: { title: 'Reversal not permitted' } });
  expect(h.accessLost).not.toHaveBeenCalled();
});

test.each([new NetworkError(), new UnexpectedResponseError(), new ApiError(500, undefined, {}), new ApiError(408, undefined, {})])(
  'uncertain reversal never claims success or retries DELETE (%s)', async (error) => {
    const h = setup(matches(checkedRow));
    await h.flow.search();
    h.api.reverse.mockRejectedValueOnce(error);
    h.api.search.mockRejectedValueOnce(new NetworkError());
    h.flow.requestReversal(checkedRow);
    await h.flow.confirmReversal();
    expect(h.flow.getState()).toMatchObject({ data: matches(checkedRow), fresh: false, mutation: { title: 'Reversal outcome unknown' } });
    expect(h.api.reverse).toHaveBeenCalledTimes(1);
  },
);

test('unavailable check-in 404 reconciles rather than claiming reversal or removing event access', async () => {
  const h = setup(matches(checkedRow));
  await h.flow.search();
  h.api.reverse.mockRejectedValueOnce(new ApiError(404, 'not_found', {}));
  h.api.search.mockResolvedValueOnce(matches(searchRow));
  h.flow.requestReversal(checkedRow);
  await h.flow.confirmReversal();
  expect(h.flow.getState().mutation).toMatchObject({ title: 'Ticket or check-in unavailable' });
  expect(h.accessLost).not.toHaveBeenCalled();
  expect(h.flow.getState().data).toEqual(matches(searchRow));
});

test('a mismatched manual confirmation is uncertain and triggers read reconciliation', async () => {
  const h = setup();
  await h.flow.search();
  h.api.admit.mockResolvedValueOnce({ kind: 'admitted', checkIn: { ...confirmedCheckIn, ticketId: 'different' } });
  await h.flow.admit(searchRow);
  expect(h.flow.getState().mutation).toMatchObject({ title: 'Check-in outcome unknown' });
});

test.each(['search', 'admit', 'reverse'] as const)('dispose clears protected data and discards late %s', async (operation) => {
  const h = setup(matches(operation === 'reverse' ? checkedRow : searchRow));
  await h.flow.search();
  const read = deferred<AttendeeMatches>();
  const admission = deferred<AdmissionResult>();
  const reversal = deferred<void>();
  h.api.search.mockReturnValueOnce(read.promise);
  h.api.admit.mockReturnValueOnce(admission.promise);
  h.api.reverse.mockReturnValueOnce(reversal.promise);
  h.flow.requestReversal(checkedRow);
  const pending = operation === 'search' ? h.flow.search() : operation === 'admit' ? h.flow.admit(searchRow) : h.flow.confirmReversal();
  h.flow.dispose();
  read.resolve(matches(checkedRow));
  admission.resolve({ kind: 'admitted', checkIn: confirmedCheckIn });
  reversal.resolve();
  await pending;
  expect(h.flow.getState()).toMatchObject({ query: '', data: null, mutation: null, fresh: false });
  expect(h.totals).not.toHaveBeenCalled();
});

test.each([new AuthExpiredError(), new ApiError(403, 'not_event_staff', {})])('reversal access errors clear protected state (%s)', async (error) => {
  const h = setup(matches(checkedRow));
  await h.flow.search();
  h.api.reverse.mockRejectedValueOnce(error);
  h.flow.requestReversal(checkedRow);
  await h.flow.confirmReversal();
  expect(h.flow.getState().data).toBeNull();
  expect(h.accessLost).toHaveBeenCalledTimes(error instanceof ApiError ? 1 : 0);
});
