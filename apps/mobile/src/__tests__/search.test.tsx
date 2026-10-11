import { act, fireEvent, render } from '@testing-library/react-native';
import { Camera, PermissionResponse } from 'expo-camera';
import * as ReactNative from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Attendee } from '../api/attendeeSearch';
import { AuthProvider } from '../auth/AuthProvider';
import { RootNavigator } from '../navigation/RootNavigator';
import { deferred, harness, response, tokenResponse, user } from './helpers';
import { confirmedCheckIn, scanEvent, verificationBody } from './scanFixtures';
import { checkedRow, matches, searchRow } from './searchFixtures';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-camera', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  return {
    CameraView: (props: import('expo-camera').CameraViewProps) => React.createElement(View, props),
    Camera: { getCameraPermissionsAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn() },
  };
});
for (const name of ['ActivityIndicator', 'KeyboardAvoidingView', 'Modal', 'Pressable', 'ScrollView', 'Text', 'TextInput', 'View'] as const) {
  void ReactNative[name];
}
const otherEvent = { ...scanEvent, id: 'other-assigned-event', title: 'Other assigned event' };
type Reply = () => Response | Promise<Response>;

function scenario(initial = searchRow, permission = true) {
  const h = harness({ ...tokenResponse, expiresAt: Date.now() + 900_000 });
  let row: Attendee = initial;
  const events = jest.fn<ReturnType<Reply>, []>(() => response({ data: [scanEvent, otherEvent], total: 2 }));
  const totals = jest.fn<ReturnType<Reply>, []>(() => response({ ...matches(row, permission), data: [] }));
  const search = jest.fn<ReturnType<Reply>, []>(() => response(matches(row, permission)));
  const admit = jest.fn<ReturnType<Reply>, []>(() => { row = checkedRow; return response({ ...confirmedCheckIn, method: 'manual' }, 201); });
  const reverse = jest.fn<ReturnType<Reply>, []>(() => { row = searchRow; return response(undefined, 204); });
  const verify = jest.fn<ReturnType<Reply>, []>(() => response(verificationBody(row.status === 'checked_in' ? 'already_used' : 'valid')));
  h.fetcher.mockImplementation(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/v1/me') return response(user);
    if (url.pathname === '/v1/auth/logout') return response(undefined, 204);
    if (url.pathname === '/v1/checkin/events') return events();
    if (url.pathname.endsWith('/attendees')) return url.searchParams.has('q') ? search() : totals();
    if (url.pathname.endsWith('/check-ins')) return admit();
    if (url.pathname.startsWith('/v1/checkin/check-ins/')) return reverse();
    if (url.pathname.endsWith('/verify')) return verify();
    throw new Error('Unexpected test request');
  });
  return { ...h, events, totals, search, admit, reverse, verify };
}

async function openSearch(h: ReturnType<typeof scenario>) {
  const screen = await render(<SafeAreaProvider><AuthProvider session={h.session}><RootNavigator /></AuthProvider></SafeAreaProvider>);
  await fireEvent.press(await screen.findByRole('button', { name: `Open ${scanEvent.title}` }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Search attendee / ticket' }));
  return screen;
}
type TestScreen = Awaited<ReturnType<typeof openSearch>>;
async function search(screen: TestScreen, query = 'Test') {
  await fireEvent.changeText(screen.getByLabelText('Name, email, or ticket number'), query);
  await fireEvent.press(screen.getByRole('button', { name: 'Search' }));
}
async function undo(screen: TestScreen) {
  await fireEvent.press(await screen.findByRole('button', { name: `Undo check-in ${searchRow.ticketNumber}` }));
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm reversal' }));
}

test('empty/short/long input stays local; explicit trimmed search shows operational fields and selected event', async () => {
  const h = scenario();
  const screen = await openSearch(h);
  expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();
  for (const query of ['x', 'x'.repeat(101), '  Test  ']) {
    await fireEvent.changeText(screen.getByLabelText('Name, email, or ticket number'), query);
    expect(h.search).not.toHaveBeenCalled();
    if (query.trim().length === 4) expect(screen.getByRole('button', { name: 'Search' })).toBeEnabled();
    else expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();
  }
  await fireEvent(screen.getByLabelText('Name, email, or ticket number'), 'submitEditing');
  await screen.findByText(searchRow.fullName);
  expect(screen.getByDisplayValue('Test')).toBeTruthy();
  for (const value of [searchRow.email, searchRow.ticketTypeName, `Ticket: ${searchRow.ticketNumber}`, `Seat: ${searchRow.seatLabel}`, 'Status: Valid ticket', scanEvent.title]) {
    expect(screen.getByText(value)).toBeTruthy();
  }
  expect(h.fetcher).toHaveBeenCalledWith(`https://api.example.test/v1/checkin/events/${scanEvent.id}/attendees?q=Test`, expect.anything());
  expect(screen.getByText(/1 search matches.*up to 50 matches/)).toBeTruthy();
  expect(h.admit).not.toHaveBeenCalled();
});

test('loading and no matches are distinct; capped matches ask staff to narrow the query', async () => {
  const h = scenario();
  const pending = deferred<Response>();
  h.search.mockReturnValueOnce(pending.promise);
  const screen = await openSearch(h);
  await search(screen);
  expect(screen.getByText('Searching this event…')).toBeTruthy();
  await act(async () => { pending.resolve(response({ ...matches(), data: [] })); });
  await screen.findByText(/No matching attendees or tickets/);
  h.search.mockReturnValueOnce(response({ ...matches(), data: Array.from({ length: 50 }, (_, i) => ({ ...searchRow, ticketId: String(i), ticketNumber: `MATCH-${i}` })) }));
  await search(screen, 'match');
  await screen.findByText(/50 search matches.*Narrow your search/);
});

test.each(['network', 'malformed'] as const)('%s read errors are safe, with retry and useful old matches preserved', async (failure) => {
  const h = scenario();
  const screen = await openSearch(h);
  await search(screen);
  await screen.findByText(searchRow.fullName);
  if (failure === 'network') h.search.mockRejectedValueOnce(new Error('Private transport detail'));
  else h.search.mockReturnValueOnce(response({ data: [{ secret: 'private' }] }));
  await fireEvent.press(screen.getByRole('button', { name: 'Refresh results' }));
  await screen.findByText(/Showing the last loaded matches/);
  expect(screen.getByText(searchRow.fullName)).toBeTruthy();
  expect(screen.getByRole('button', { name: `Check in ${searchRow.ticketNumber}` })).toBeDisabled();
  expect(screen.queryByText('Private transport detail')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Refresh results' }));
  expect(await screen.findByRole('button', { name: `Check in ${searchRow.ticketNumber}` })).toBeEnabled();
});

test('changing a query clears results immediately and discards an older response', async () => {
  const h = scenario();
  const screen = await openSearch(h);
  await search(screen);
  await screen.findByText(searchRow.fullName);
  const pending = deferred<Response>();
  h.search.mockReturnValueOnce(pending.promise);
  await search(screen, 'Older');
  expect(screen.queryByText(searchRow.fullName)).toBeNull();
  h.search.mockReturnValueOnce(response({ ...matches(), data: [] }));
  await search(screen, 'Newer');
  await screen.findByText(/No matching/);
  await act(async () => { pending.resolve(response(matches(checkedRow))); });
  expect(screen.queryByText(searchRow.fullName)).toBeNull();
  expect(screen.getByDisplayValue('Newer')).toBeTruthy();
});

test('keyboard Search cannot start duplicate requests while the same query is loading', async () => {
  const h = scenario();
  const pending = deferred<Response>();
  h.search.mockReturnValueOnce(pending.promise);
  const screen = await openSearch(h);
  await search(screen);
  const input = screen.getByLabelText('Name, email, or ticket number');
  try {
    await fireEvent(input, 'submitEditing');
    await fireEvent(input, 'submitEditing');
    expect(h.search).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();
  } finally {
    await act(async () => { pending.resolve(response(matches())); });
  }
  await screen.findByText('Status: Valid ticket');
});

test.each([false, true])('manual admission refreshes results and totals; confirmation survives refresh failure=%s', async (fail) => {
  const h = scenario();
  const screen = await openSearch(h);
  await search(screen);
  const button = await screen.findByRole('button', { name: `Check in ${searchRow.ticketNumber}` });
  if (fail) {
    h.search.mockRejectedValueOnce(new Error('Unavailable'));
    h.totals.mockRejectedValueOnce(new Error('Unavailable'));
  }
  await fireEvent.press(button);
  await screen.findByText('Check-in confirmed');
  expect(h.admit).toHaveBeenCalledTimes(1);
  expect(h.search).toHaveBeenCalledTimes(2);
  expect(h.totals).toHaveBeenCalledTimes(2);
  expect(h.fetcher).toHaveBeenCalledWith(`https://api.example.test/v1/checkin/events/${scanEvent.id}/check-ins`,
    expect.objectContaining({ body: JSON.stringify({ ticketId: searchRow.ticketId }) }));
  if (fail) {
    await screen.findByText(/last loaded totals/);
    expect(screen.getByRole('button', { name: `Check in ${searchRow.ticketNumber}` })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Undo check-in/ })).toBeNull();
  } else {
    await screen.findByText('30% checked in');
    expect(screen.getByText('Status: Already checked in')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Undo check-in/ })).toBeEnabled();
    expect(screen.queryByRole('button', { name: `Check in ${searchRow.ticketNumber}` })).toBeNull();
  }
});

test('409 refusal replaces the apparent valid ticket with current server state and scanner language', async () => {
  const h = scenario();
  const screen = await openSearch(h);
  await search(screen);
  h.admit.mockReturnValueOnce(response(verificationBody('already_used'), 409));
  h.search.mockReturnValueOnce(response(matches(checkedRow)));
  await fireEvent.press(await screen.findByRole('button', { name: `Check in ${searchRow.ticketNumber}` }));
  await screen.findByText('Already checked in');
  expect(screen.queryByText('Check-in confirmed')).toBeNull();
  expect(screen.getByText(/Check-in was refused/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: `Check in ${searchRow.ticketNumber}` })).toBeNull();
});

test('pending manual admission shows waiting guidance, then a failed reconciliation shows stale guidance', async () => {
  const h = scenario();
  const screen = await openSearch(h);
  await search(screen);
  const pending = deferred<Response>();
  h.admit.mockReturnValueOnce(pending.promise);
  h.search.mockRejectedValueOnce(new Error('Unavailable'));
  await fireEvent.press(await screen.findByRole('button', { name: `Check in ${searchRow.ticketNumber}` }));
  expect(screen.getByText(/Submitting check-in/)).toBeTruthy();
  expect(screen.queryByText(/Showing the last loaded matches/)).toBeNull();
  expect(screen.getByRole('button', { name: `Check in ${searchRow.ticketNumber}` })).toBeDisabled();
  await act(async () => { pending.resolve(response(confirmedCheckIn, 201)); });
  await screen.findByText('Check-in confirmed');
  expect(screen.getByText(/Showing the last loaded matches/)).toBeTruthy();
  expect(screen.queryByText(/Submitting check-in/)).toBeNull();
});

test.each([200, 401])('a previous account’s delayed search (%s) cannot affect a newly signed-in account', async (status) => {
  const h = scenario();
  const screen = await openSearch(h);
  const pending = deferred<Response>();
  h.search.mockReturnValueOnce(pending.promise);
  await search(screen, 'Old account query');
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  await screen.findByText('Staff sign in');

  const nextUser = { ...user, id: 'second-staff-id', email: 'second@example.test' };
  const nextRow = { ...searchRow, fullName: 'New account attendee', ticketId: 'new-account-ticket' };
  const previousFetcher = h.fetcher.getMockImplementation()!;
  h.fetcher.mockImplementation(async (input, options) => {
    const url = new URL(String(input));
    if (url.pathname === '/v1/auth/login') return response({ ...tokenResponse, user: nextUser });
    if (url.pathname === '/v1/me') return response(nextUser);
    if (url.pathname === '/v1/checkin/events') return response({ data: [otherEvent], total: 1 });
    if (url.pathname.endsWith('/attendees') && url.searchParams.has('q')) return response(matches(nextRow));
    return previousFetcher(input, options);
  });
  await fireEvent.changeText(screen.getByLabelText('Email'), nextUser.email);
  await fireEvent.changeText(screen.getByLabelText('Password'), 'test-password');
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByText(nextUser.email);
  expect(screen.queryByText(scanEvent.title)).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: `Open ${otherEvent.title}` }));
  await fireEvent.press(screen.getByRole('button', { name: 'Search attendee / ticket' }));
  expect(screen.getByDisplayValue('')).toBeTruthy();
  await search(screen, 'New account query');
  await screen.findByText(nextRow.fullName);
  await act(async () => {
    pending.resolve(response(status === 200 ? matches(checkedRow) : { error: { code: 'session_ended' } }, status));
  });
  expect(screen.getByText(nextRow.fullName)).toBeTruthy();
  expect(screen.getByDisplayValue('New account query')).toBeTruthy();
  expect(screen.queryByText(searchRow.fullName)).toBeNull();
  expect(screen.queryByText('Staff sign in')).toBeNull();
  expect(h.session.getState()).toMatchObject({ status: 'authorized', user: nextUser });
});

test.each([false, true])('capability=%s controls Undo for an active check-in, without exposing internal IDs', async (permission) => {
  const h = scenario(checkedRow, permission);
  const screen = await openSearch(h);
  await search(screen);
  await screen.findByText('Status: Already checked in');
  expect(screen.getByText(/Checked in:.*Asia\/Almaty/)).toBeTruthy();
  expect(screen.queryByText(confirmedCheckIn.id)).toBeNull();
  expect(screen.queryByRole('button', { name: /Undo check-in/ }) !== null).toBe(permission);
});

test('Undo opens an explicit identifying confirmation; cancel is harmless, confirm DELETE refreshes both reads', async () => {
  const h = scenario(checkedRow);
  const screen = await openSearch(h);
  await search(screen);
  await fireEvent.press(await screen.findByRole('button', { name: /Undo check-in/ }));
  expect(screen.getByText('Reverse this check-in?')).toBeTruthy();
  expect(screen.getByText(`${searchRow.fullName} · ${searchRow.ticketNumber}`)).toBeTruthy();
  expect(h.reverse).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel reversal' }));
  expect(screen.queryByText('Reverse this check-in?')).toBeNull();
  await undo(screen);
  await screen.findByText('Reversal confirmed');
  expect(h.reverse).toHaveBeenCalledTimes(1);
  expect(h.fetcher).toHaveBeenCalledWith(`https://api.example.test/v1/checkin/check-ins/${checkedRow.checkInId}`,
    expect.objectContaining({ method: 'DELETE' }));
  expect(h.search).toHaveBeenCalledTimes(2);
  expect(h.totals).toHaveBeenCalledTimes(2);
  await screen.findByText('20% checked in');
  expect(screen.getByRole('button', { name: `Check in ${searchRow.ticketNumber}` })).toBeEnabled();
  expect(screen.queryByRole('button', { name: /Undo check-in/ })).toBeNull();
});

test('permission removed after rendering yields a specific refusal and hides Undo after reconciliation', async () => {
  const h = scenario(checkedRow);
  const screen = await openSearch(h);
  await search(screen);
  h.reverse.mockReturnValueOnce(response({ error: { code: 'cannot_reverse_check_in' } }, 403));
  h.search.mockReturnValueOnce(response(matches(checkedRow, false)));
  await undo(screen);
  await screen.findByText('Reversal not permitted');
  expect(screen.getByText('Status: Already checked in')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Undo check-in/ })).toBeNull();
  expect(screen.queryByText('Reversal confirmed')).toBeNull();
  expect(screen.queryByText('Assigned events')).toBeNull();
});

test('lost reversal response never claims success even when the read shows another reversal completed', async () => {
  const h = scenario(checkedRow);
  const screen = await openSearch(h);
  await search(screen);
  h.reverse.mockRejectedValueOnce(new Error('Lost response'));
  h.search.mockReturnValueOnce(response(matches(searchRow)));
  await undo(screen);
  await screen.findByText('Reversal outcome unknown');
  expect(screen.queryByText('Reversal confirmed')).toBeNull();
  expect(screen.getByText('Status: Valid ticket')).toBeTruthy();
  expect(h.reverse).toHaveBeenCalledTimes(1);
});

test('scanner admission is visible in fresh search; search reversal is visible to the next QR verification', async () => {
  jest.mocked(Camera.getCameraPermissionsAsync).mockResolvedValue({ status: 'granted', granted: true, canAskAgain: true, expires: 'never' } as PermissionResponse);
  const h = scenario();
  const screen = await openSearch(h);
  await search(screen);
  await screen.findByText('Status: Valid ticket');
  await fireEvent.press(screen.getByRole('button', { name: 'Back to event' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Scan ticket QR' }));
  const scan = async () => {
    const camera = await screen.findByLabelText('Admission ticket QR camera');
    await fireEvent(camera, 'cameraReady');
    await fireEvent(camera, 'barcodeScanned', { data: 'opaque-test-qr', type: 'qr' });
  };
  await scan();
  await fireEvent.press(await screen.findByRole('button', { name: 'Check in' }));
  await screen.findByText('Check-in confirmed');
  await fireEvent.press(screen.getByRole('button', { name: 'Back to event' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Search attendee / ticket' }));
  expect(screen.getByDisplayValue('')).toBeTruthy();
  expect(screen.queryByText('Status: Valid ticket')).toBeNull();
  await search(screen);
  await screen.findByText('Status: Already checked in');
  await undo(screen);
  await screen.findByText('Reversal confirmed');
  await fireEvent.press(screen.getByRole('button', { name: 'Back to event' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Scan ticket QR' }));
  await scan();
  await screen.findByText('Valid ticket');
  expect(screen.getByRole('button', { name: 'Check in' })).toBeEnabled();
  expect(h.verify).toHaveBeenCalledTimes(2);
  expect(h.admit).toHaveBeenCalledTimes(1);
});

test.each(['search', 'admit', 'reverse'] as const)('event switch clears protected state and ignores late %s response', async (operation) => {
  const h = scenario(operation === 'reverse' ? checkedRow : searchRow);
  const screen = await openSearch(h);
  const pending = deferred<Response>();
  if (operation === 'search') h.search.mockReturnValueOnce(pending.promise);
  await search(screen);
  if (operation === 'admit') {
    h.admit.mockReturnValueOnce(pending.promise);
    await fireEvent.press(await screen.findByRole('button', { name: `Check in ${searchRow.ticketNumber}` }));
  } else if (operation === 'reverse') {
    h.reverse.mockReturnValueOnce(pending.promise);
    await undo(screen);
  }
  await fireEvent.press(screen.getByRole('button', { name: 'Back to event' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Back to events' }));
  await fireEvent.press(await screen.findByRole('button', { name: `Open ${otherEvent.title}` }));
  await fireEvent.press(screen.getByRole('button', { name: 'Search attendee / ticket' }));
  const reads = h.totals.mock.calls.length;
  await act(async () => { pending.resolve(operation === 'search' ? response(matches(checkedRow)) : operation === 'admit' ? response(confirmedCheckIn, 201) : response(undefined, 204)); });
  expect(screen.getByDisplayValue('')).toBeTruthy();
  expect(screen.queryByText(searchRow.fullName)).toBeNull();
  expect(screen.queryByText(/^(Check-in|Reversal) confirmed$/)).toBeNull();
  expect(h.totals).toHaveBeenCalledTimes(reads);
  await search(screen);
  expect(h.fetcher).toHaveBeenCalledWith(`https://api.example.test/v1/checkin/events/${otherEvent.id}/attendees?q=Test`, expect.anything());
});

test.each(['logout', 'expired', 'removed'] as const)('%s clears search and pending mutations; late work cannot restore protected data', async (reason) => {
  const h = scenario(checkedRow);
  const screen = await openSearch(h);
  await search(screen);
  const pending = deferred<Response>();
  h.reverse.mockReturnValueOnce(pending.promise);
  await undo(screen);
  if (reason === 'logout') await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  else {
    if (reason === 'expired') h.totals.mockReturnValueOnce(response({ error: { code: 'session_ended' } }, 401));
    else h.events.mockReturnValueOnce(response({ data: [otherEvent], total: 1 }));
    await fireEvent.press(screen.getByRole('button', { name: 'Refresh totals' }));
  }
  await screen.findByText(reason === 'removed' ? 'Assigned events' : 'Staff sign in');
  await act(async () => { pending.resolve(response(undefined, 204)); });
  expect(screen.queryByText(searchRow.fullName)).toBeNull();
  expect(screen.queryByText('Reversal confirmed')).toBeNull();
  expect(screen.queryByText('Search attendees / tickets')).toBeNull();
});

test.each(['search', 'admit', 'reverse'] as const)('%s assignment 403 returns through the existing event access-loss flow', async (operation) => {
  const h = scenario(operation === 'reverse' ? checkedRow : searchRow);
  const screen = await openSearch(h);
  const forbidden = () => response({ error: { code: 'not_event_staff' } }, 403);
  if (operation === 'search') h.search.mockImplementation(forbidden);
  await search(screen);
  h.events.mockImplementation(() => response({ data: [otherEvent], total: 1 }));
  if (operation === 'admit') {
    h.admit.mockImplementation(forbidden);
    await fireEvent.press(await screen.findByRole('button', { name: `Check in ${searchRow.ticketNumber}` }));
  } else if (operation === 'reverse') {
    h.reverse.mockImplementation(forbidden);
    await undo(screen);
  }
  await screen.findByText('Assigned events');
  expect(screen.getByText(/no longer available/)).toBeTruthy();
  expect(screen.queryByText('Search attendees / tickets')).toBeNull();
});
