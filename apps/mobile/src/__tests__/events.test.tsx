import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as ReactNative from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../auth/AuthProvider';
import { RootNavigator } from '../navigation/RootNavigator';
import { deferred, harness, response, tokenResponse, user } from './helpers';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

// Warm React Native's lazy exports before the first render on a cold Babel cache.
for (const name of ['ActivityIndicator', 'KeyboardAvoidingView', 'Pressable', 'ScrollView', 'Text', 'TextInput', 'View'] as const) {
  void ReactNative[name];
}

const firstEvent = {
  id: '41c1abcf-5d65-46b4-a345-6398cf5b7562',
  organizerId: 'organizer-id',
  title: 'Evening concert at the central hall',
  venueName: 'Central Hall',
  city: 'Almaty',
  address: '12 Main Street',
  startsAt: '2026-10-09T13:00:00Z',
  endsAt: '2026-10-09T16:00:00Z',
  timeZone: 'Asia/Almaty',
  visibility: 'private',
  status: 'active',
  paidSalesActive: false,
};
const secondEvent = {
  ...firstEvent,
  id: 'e026920f-15c4-4510-9514-dc85666ed7b5',
  title: 'Morning community gathering',
  venueName: 'Riverside Theatre',
};
const eventsBody = (data = [firstEvent, secondEvent]) => ({ data, total: data.length });
const totalsBody = (registered = 120, checkedIn = 30) => ({ data: [], registered, checkedIn, canReverseCheckIn: true });
const eventsPath = '/v1/checkin/events?assignedOnly=true';
const totalsPath = (id: string) => `/v1/checkin/events/${id}/attendees`;
type Reply = () => Response | Promise<Response>;

function scenario() {
  const h = harness({ ...tokenResponse, expiresAt: Date.now() + 900_000 });
  const events = jest.fn<ReturnType<Reply>, []>(() => response(eventsBody()));
  const firstTotals = jest.fn<ReturnType<Reply>, []>(() => response(totalsBody()));
  const secondTotals = jest.fn<ReturnType<Reply>, []>(() => response(totalsBody(80, 60)));
  h.fetcher.mockImplementation(async (input) => {
    const url = new URL(String(input));
    const path = url.pathname + url.search;
    if (path === '/v1/me') return response(user);
    if (path === '/v1/auth/login') return response(tokenResponse);
    if (path === '/v1/auth/logout') return response(undefined, 204);
    if (path === eventsPath) return events();
    if (path === totalsPath(firstEvent.id)) return firstTotals();
    if (path === totalsPath(secondEvent.id)) return secondTotals();
    throw new Error(`Unexpected request in assigned-event workflow: ${path}`);
  });
  return { ...h, events, firstTotals, secondTotals };
}

function show(h: ReturnType<typeof scenario>) {
  return render(<SafeAreaProvider><AuthProvider session={h.session}><RootNavigator /></AuthProvider></SafeAreaProvider>);
}

async function openFirst(h: ReturnType<typeof scenario>) {
  const screen = await show(h);
  await fireEvent.press(await screen.findByRole('button', { name: `Open ${firstEvent.title}` }));
  return screen;
}

async function resolveRequest(pending: ReturnType<typeof deferred<Response>>, body: unknown, status = 200) {
  await act(async () => { pending.resolve(response(body, status)); });
}

test('loads assigned events with the existing authenticated client and displays server context', async () => {
  const h = scenario();
  const pending = deferred<Response>();
  h.events.mockReturnValueOnce(pending.promise);
  const screen = await show(h);
  await screen.findByText('Loading assigned events…');
  expect(screen.queryByText('No assigned events are currently available.')).toBeNull();
  await resolveRequest(pending, eventsBody());
  expect(await screen.findByRole('button', { name: `Open ${firstEvent.title}` })).toBeEnabled();
  expect(screen.getByRole('button', { name: `Open ${secondEvent.title}` })).toBeEnabled();
  expect(screen.getByText(`${firstEvent.venueName} · ${firstEvent.city}`)).toBeTruthy();
  const requests = h.fetcher.mock.calls.filter(([url]) => String(url).includes('/checkin/events'));
  expect(requests).toHaveLength(1);
  expect(requests[0]?.[0]).toBe(`https://api.example.test${eventsPath}`);
  expect(requests[0]?.[1]).toMatchObject({ method: 'GET', headers: { Authorization: 'Bearer test-access' } });
});

test('no assigned events is a successful empty state with a refresh action', async () => {
  const h = scenario();
  h.events.mockImplementation(() => response(eventsBody([])));
  const screen = await show(h);
  await screen.findByText('No assigned events are currently available.');
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Refresh events' })).toBeEnabled();
  expect(h.firstTotals).not.toHaveBeenCalled();
});

test.each(['network', 'server', 'forbidden', 'malformed'] as const)('assigned-events %s failure is safe and retryable', async (failure) => {
  const h = scenario();
  h.events.mockImplementationOnce(() => {
    if (failure === 'network') throw new Error('Internal database connection string');
    if (failure === 'malformed') return response({ data: [{ title: 'Unusable event without an ID' }], total: 1 });
    return response({ error: { code: 'internal', message: 'Internal database connection string' } }, failure === 'forbidden' ? 403 : 503);
  });
  const screen = await show(h);
  const retry = await screen.findByRole('button', { name: 'Try again' });
  expect(screen.queryByText(/Internal database/)).toBeNull();
  expect(screen.queryByText('No assigned events are currently available.')).toBeNull();
  await fireEvent.press(retry);
  await screen.findByRole('button', { name: `Open ${firstEvent.title}` });
  expect(h.events).toHaveBeenCalledTimes(2);
});

test('manual list refresh retains events while pending and after a network failure', async () => {
  const h = scenario();
  const screen = await show(h);
  await screen.findByRole('button', { name: `Open ${firstEvent.title}` });
  const pending = deferred<Response>();
  h.events.mockReturnValueOnce(pending.promise);
  await fireEvent.press(screen.getByRole('button', { name: 'Refresh events' }));
  expect(screen.getByRole('button', { name: `Open ${firstEvent.title}` })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Refresh events' })).toHaveProp('accessibilityState',
    expect.objectContaining({ busy: true, disabled: true }));
  expect(h.firstTotals).not.toHaveBeenCalled();
  await act(async () => { pending.reject(new Error('Network unavailable')); });
  await screen.findByRole('button', { name: 'Try again' });
  expect(screen.getByRole('button', { name: `Open ${firstEvent.title}` })).toBeTruthy();
  h.events.mockReturnValueOnce(response(eventsBody([secondEvent])));
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: `Open ${firstEvent.title}` })).toBeNull());
  expect(screen.getByRole('button', { name: `Open ${secondEvent.title}` })).toBeTruthy();
});

test('selection loads the exact event ID, keeps its context, and maps authoritative totals', async () => {
  const h = scenario();
  const pending = deferred<Response>();
  h.firstTotals.mockReturnValueOnce(pending.promise);
  const screen = await openFirst(h);
  await screen.findByText('Loading attendance…');
  expect(screen.getByText(firstEvent.title)).toBeTruthy();
  expect(screen.queryByText(secondEvent.title)).toBeNull();
  expect(screen.queryByText('25% checked in')).toBeNull();
  await resolveRequest(pending, totalsBody());
  await screen.findByText('25% checked in');
  expect(screen.getByText('Registered')).toBeTruthy();
  expect(screen.getByText('120')).toBeTruthy();
  expect(screen.getByText('Checked in')).toBeTruthy();
  expect(screen.getByText('30')).toBeTruthy();
  expect(h.fetcher).toHaveBeenCalledWith(`https://api.example.test${totalsPath(firstEvent.id)}`, expect.objectContaining({
    method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer test-access' }),
  }));
  expect(h.secondTotals).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: /undo|reverse|^check in$/i })).toBeNull();
  expect(screen.getByRole('button', { name: 'Scan ticket QR' })).toBeEnabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Back to events' }));
  await screen.findByRole('button', { name: `Open ${firstEvent.title}` });
  expect(screen.queryByText('Attendance')).toBeNull();
});

test('zero registered attendees produces finite zero progress', async () => {
  const h = scenario();
  h.firstTotals.mockReturnValueOnce(response(totalsBody(0, 0)));
  const screen = await openFirst(h);
  await screen.findByText('0% checked in');
  expect(screen.queryByText(/NaN|Infinity/)).toBeNull();
  expect(screen.getAllByText('0')).toHaveLength(2);
});

test.each(['network', 'server', 'malformed'] as const)('dashboard %s failure can retry without losing event identity', async (failure) => {
  const h = scenario();
  h.firstTotals.mockImplementationOnce(() => {
    if (failure === 'network') throw new Error('Internal server secret');
    if (failure === 'malformed') return response({ data: [], registered: '120', checkedIn: 30 });
    return response({ error: { code: 'internal', message: 'Internal server secret' } }, 503);
  });
  const screen = await openFirst(h);
  const retry = await screen.findByRole('button', { name: 'Try again' });
  expect(screen.getByText(firstEvent.title)).toBeTruthy();
  expect(screen.queryByText(/Internal server secret/)).toBeNull();
  expect(screen.queryByText('25% checked in')).toBeNull();
  await fireEvent.press(retry);
  await screen.findByText('25% checked in');
  expect(h.firstTotals).toHaveBeenCalledTimes(2);
});

test('totals refresh preserves visible totals and updates independently of assignment revalidation', async () => {
  const h = scenario();
  const screen = await openFirst(h);
  await screen.findByText('25% checked in');
  const totalsPending = deferred<Response>();
  const eventsPending = deferred<Response>();
  h.firstTotals.mockReturnValueOnce(totalsPending.promise);
  h.events.mockReturnValueOnce(eventsPending.promise);
  await fireEvent.press(screen.getByRole('button', { name: 'Refresh totals' }));
  expect(screen.getByText('25% checked in')).toBeTruthy();
  expect(screen.getByText('Updating attendance…')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Refresh totals' })).toBeDisabled();
  await resolveRequest(totalsPending, totalsBody(120, 60));
  await screen.findByText('50% checked in');
  expect(screen.getByRole('button', { name: 'Refresh totals' })).toBeEnabled();
  await resolveRequest(eventsPending, eventsBody());
  expect(screen.getByText('50% checked in')).toBeTruthy();
});

test('a failed totals refresh preserves previous counts and explains that they are stale', async () => {
  const h = scenario();
  const screen = await openFirst(h);
  await screen.findByText('25% checked in');
  h.firstTotals.mockRejectedValueOnce(new Error('Network unavailable'));
  await fireEvent.press(screen.getByRole('button', { name: 'Refresh totals' }));
  await screen.findByRole('button', { name: 'Try again' });
  expect(screen.getByText('25% checked in')).toBeTruthy();
  expect(screen.getByText(/last loaded totals/i)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull());
  expect(screen.getByText('25% checked in')).toBeTruthy();
});

test('assignment revalidation network failure warns without erasing usable attendance totals', async () => {
  const h = scenario();
  const screen = await openFirst(h);
  await screen.findByText('25% checked in');
  h.events.mockRejectedValueOnce(new Error('Internal connection detail'));
  h.firstTotals.mockReturnValueOnce(response(totalsBody(120, 60)));
  await fireEvent.press(screen.getByRole('button', { name: 'Refresh totals' }));
  await screen.findByText('50% checked in');
  await screen.findByText(/assignment could not be refreshed/i);
  expect(screen.queryByText(/Internal connection detail/)).toBeNull();
  expect(screen.getByText(firstEvent.title)).toBeTruthy();
});

test('switching events clears previous totals and ignores a late response from the old event', async () => {
  const h = scenario();
  const screen = await openFirst(h);
  await screen.findByText('25% checked in');
  const oldRefresh = deferred<Response>();
  h.firstTotals.mockReturnValueOnce(oldRefresh.promise);
  await fireEvent.press(screen.getByRole('button', { name: 'Refresh totals' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Back to events' }));
  const newTotals = deferred<Response>();
  h.secondTotals.mockReturnValueOnce(newTotals.promise);
  await fireEvent.press(await screen.findByRole('button', { name: `Open ${secondEvent.title}` }));
  await screen.findByText('Loading attendance…');
  expect(screen.getByText(secondEvent.title)).toBeTruthy();
  expect(screen.queryByText(firstEvent.title)).toBeNull();
  expect(screen.queryByText('25% checked in')).toBeNull();
  await resolveRequest(oldRefresh, totalsBody(120, 120));
  expect(screen.queryByText('100% checked in')).toBeNull();
  await resolveRequest(newTotals, totalsBody(80, 60));
  await screen.findByText('75% checked in');
  expect(screen.queryByText('120')).toBeNull();
});

test.each([403, 404])('selected event %s returns to assigned events and removes operational context', async (status) => {
  const h = scenario();
  const screen = await openFirst(h);
  await screen.findByText('25% checked in');
  const oldAssignmentCheck = deferred<Response>();
  h.firstTotals.mockReturnValueOnce(response({ error: { code: status === 403 ? 'forbidden' : 'not_found', message: 'Sensitive backend detail' } }, status));
  // Keep the concurrent assignment request pending so the totals error itself must close the dashboard.
  h.events.mockReturnValueOnce(oldAssignmentCheck.promise).mockImplementation(() => response(eventsBody([secondEvent])));
  await fireEvent.press(screen.getByRole('button', { name: 'Refresh totals' }));
  await screen.findByText('Assigned events');
  await screen.findByRole('button', { name: `Open ${secondEvent.title}` });
  expect(screen.queryByText('Attendance')).toBeNull();
  expect(screen.queryByText('25% checked in')).toBeNull();
  expect(screen.queryByText('Sensitive backend detail')).toBeNull();
  expect(screen.getByText(/no longer|assignment.*removed|access.*removed/i)).toBeTruthy();
  await resolveRequest(oldAssignmentCheck, eventsBody());
  expect(screen.queryByRole('button', { name: `Open ${firstEvent.title}` })).toBeNull();
});

test('assignment removal evicts a dashboard even when owner access still permits totals', async () => {
  const h = scenario();
  const screen = await openFirst(h);
  await screen.findByText('25% checked in');
  h.events.mockImplementation(() => response(eventsBody([secondEvent])));
  h.firstTotals.mockReturnValueOnce(response(totalsBody(120, 60)));
  await fireEvent.press(screen.getByRole('button', { name: 'Refresh totals' }));
  await screen.findByText('Assigned events');
  expect(screen.queryByText('Attendance')).toBeNull();
  expect(screen.queryByRole('button', { name: `Open ${firstEvent.title}` })).toBeNull();
  expect(screen.getByText(/no longer|assignment.*removed|access.*removed/i)).toBeTruthy();
});

test('selection revalidates assignment before admitting an event removed since the list loaded', async () => {
  const h = scenario();
  const screen = await show(h);
  await screen.findByRole('button', { name: `Open ${firstEvent.title}` });
  h.events.mockImplementation(() => response(eventsBody([secondEvent])));
  await fireEvent.press(screen.getByRole('button', { name: `Open ${firstEvent.title}` }));
  await screen.findByText(/no longer|assignment.*removed|access.*removed/i);
  expect(screen.queryByText('Attendance')).toBeNull();
  expect(screen.queryByRole('button', { name: `Open ${firstEvent.title}` })).toBeNull();
});

test('an older assigned-list response cannot restore an assignment removed by a newer response', async () => {
  const h = scenario();
  const screen = await show(h);
  await screen.findByRole('button', { name: `Open ${firstEvent.title}` });
  const oldRequest = deferred<Response>();
  h.events.mockReturnValueOnce(oldRequest.promise);
  await fireEvent.press(screen.getByRole('button', { name: 'Refresh events' }));
  h.events.mockImplementation(() => response(eventsBody([secondEvent])));
  await fireEvent.press(screen.getByRole('button', { name: `Open ${firstEvent.title}` }));
  await screen.findByText(/no longer available/i);
  await resolveRequest(oldRequest, eventsBody());
  expect(screen.queryByText('Attendance')).toBeNull();
  expect(screen.queryByRole('button', { name: `Open ${firstEvent.title}` })).toBeNull();
  expect(screen.getByRole('button', { name: `Open ${secondEvent.title}` })).toBeTruthy();
});

test('assigned-list 403 closes a selected event even when its totals remain accessible', async () => {
  const h = scenario();
  const screen = await openFirst(h);
  await screen.findByText('25% checked in');
  h.events.mockReturnValueOnce(response({ error: { code: 'forbidden' } }, 403));
  await fireEvent.press(screen.getByRole('button', { name: 'Refresh totals' }));
  await screen.findByText('Assigned events');
  expect(screen.queryByText('Attendance')).toBeNull();
  expect(screen.queryByRole('button', { name: `Open ${firstEvent.title}` })).toBeNull();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
});

test('retrying a forbidden assigned list keeps revoked events hidden until fresh access succeeds', async () => {
  const h = scenario();
  const screen = await show(h);
  await screen.findByRole('button', { name: `Open ${firstEvent.title}` });
  h.events.mockReturnValueOnce(response({ error: { code: 'forbidden' } }, 403));
  await fireEvent.press(screen.getByRole('button', { name: 'Refresh events' }));
  await screen.findByRole('button', { name: 'Try again' });
  expect(screen.queryByRole('button', { name: `Open ${firstEvent.title}` })).toBeNull();
  const retry = deferred<Response>();
  h.events.mockReturnValueOnce(retry.promise);
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  try {
    expect(screen.queryByRole('button', { name: `Open ${firstEvent.title}` })).toBeNull();
  } finally {
    await resolveRequest(retry, eventsBody([secondEvent]));
  }
  await screen.findByRole('button', { name: `Open ${secondEvent.title}` });
  expect(screen.queryByRole('button', { name: `Open ${firstEvent.title}` })).toBeNull();
});

test('logout clears selected event state and late totals cannot reopen the dashboard after sign in', async () => {
  const h = scenario();
  const pending = deferred<Response>();
  h.firstTotals.mockReturnValueOnce(pending.promise);
  const screen = await openFirst(h);
  await screen.findByText('Loading attendance…');
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  await screen.findByText('Staff sign in');
  expect(h.saved()).toBeNull();
  await resolveRequest(pending, totalsBody());
  expect(screen.queryByText(firstEvent.title)).toBeNull();
  expect(screen.queryByText('Attendance')).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('Email'), user.email);
  await fireEvent.changeText(screen.getByLabelText('Password'), 'test-password');
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByRole('button', { name: `Open ${firstEvent.title}` });
  expect(screen.queryByText('Attendance')).toBeNull();
  expect(screen.queryByText('25% checked in')).toBeNull();
});

test('session expiry during totals refresh removes protected state and ignores late assignment data', async () => {
  const h = scenario();
  const screen = await openFirst(h);
  await screen.findByText('25% checked in');
  const pending = deferred<Response>();
  h.events.mockReturnValueOnce(pending.promise);
  h.firstTotals.mockReturnValueOnce(response({ error: { code: 'session_ended' } }, 401));
  await fireEvent.press(screen.getByRole('button', { name: 'Refresh totals' }));
  await screen.findByText('Staff sign in');
  expect(h.saved()).toBeNull();
  await resolveRequest(pending, eventsBody());
  expect(screen.queryByText('Assigned events')).toBeNull();
  expect(screen.queryByText('Attendance')).toBeNull();
  expect(screen.queryByText('25% checked in')).toBeNull();
});

test('an open dashboard revalidates every 30 seconds only while the app is active', async () => {
  jest.useFakeTimers();
  const previousAppState = ReactNative.AppState.currentState;
  ReactNative.AppState.currentState = 'active';
  try {
    const h = scenario();
    const screen = await openFirst(h);
    await screen.findByText('25% checked in');
    ReactNative.AppState.currentState = 'background';
    const previousCalls = h.events.mock.calls.length;
    h.events.mockImplementation(() => response(eventsBody([secondEvent])));
    await act(async () => { await jest.advanceTimersByTimeAsync(30_000); });
    expect(h.events).toHaveBeenCalledTimes(previousCalls);
    expect(screen.getByText('Attendance')).toBeTruthy();
    ReactNative.AppState.currentState = 'active';
    await act(async () => { await jest.advanceTimersByTimeAsync(30_000); });
    await screen.findByText('Assigned events');
    expect(screen.queryByText('Attendance')).toBeNull();
    expect(screen.queryByText('25% checked in')).toBeNull();
    expect(screen.queryByRole('button', { name: `Open ${firstEvent.title}` })).toBeNull();
    await screen.unmount();
  } finally {
    ReactNative.AppState.currentState = previousAppState;
    jest.useRealTimers();
  }
});
