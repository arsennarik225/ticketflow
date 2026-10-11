import { act, fireEvent, render } from '@testing-library/react-native';
import { Camera, PermissionResponse } from 'expo-camera';
import * as ReactNative from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../auth/AuthProvider';
import { RootNavigator } from '../navigation/RootNavigator';
import { deferred, harness, response, tokenResponse, user } from './helpers';
import { confirmedCheckIn, scanEvent, verificationBody } from './scanFixtures';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
// This substitutes native camera events, not the scanner/session/networking logic.
jest.mock('expo-camera', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  return {
    CameraView: (props: import('expo-camera').CameraViewProps) => React.createElement(View, props),
    Camera: { getCameraPermissionsAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn() },
  };
});
for (const name of ['ActivityIndicator', 'KeyboardAvoidingView', 'Pressable', 'ScrollView', 'Text', 'TextInput', 'View'] as const) {
  void ReactNative[name];
}

const granted: PermissionResponse = {
  status: 'granted' as PermissionResponse['status'], granted: true, canAskAgain: true, expires: 'never',
};
const getPermission = jest.mocked(Camera.getCameraPermissionsAsync);
const requestPermission = jest.mocked(Camera.requestCameraPermissionsAsync);
const otherEvent = { ...scanEvent, id: '3a29a02f-c85b-4e68-a204-ec1d446c786a', title: 'Other assigned event' };
type Reply = () => Response | Promise<Response>;

beforeEach(() => {
  getPermission.mockReset().mockResolvedValue(granted);
  requestPermission.mockReset().mockResolvedValue(granted);
});

function scenario() {
  const h = harness({ ...tokenResponse, expiresAt: Date.now() + 900_000 });
  const events = jest.fn<ReturnType<Reply>, []>(() => response({ data: [scanEvent, otherEvent], total: 2 }));
  const totals = jest.fn<ReturnType<Reply>, []>(() => response({ data: [], registered: 10, checkedIn: 2, canReverseCheckIn: true }));
  const verify = jest.fn<ReturnType<Reply>, []>(() => response(verificationBody()));
  const admit = jest.fn<ReturnType<Reply>, []>(() => response(confirmedCheckIn, 201));
  h.fetcher.mockImplementation(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/v1/me') return response(user);
    if (url.pathname === '/v1/auth/logout') return response(undefined, 204);
    if (url.pathname === '/v1/checkin/events' && url.search === '?assignedOnly=true') return events();
    if (url.pathname.endsWith('/attendees')) return totals();
    if (url.pathname.endsWith('/verify')) return verify();
    if (url.pathname.endsWith('/check-ins')) return admit();
    throw new Error('Unexpected test request');
  });
  return { ...h, events, totals, verify, admit };
}

async function openScanner(h: ReturnType<typeof scenario>) {
  const screen = await render(<SafeAreaProvider><AuthProvider session={h.session}><RootNavigator /></AuthProvider></SafeAreaProvider>);
  await fireEvent.press(await screen.findByRole('button', { name: `Open ${scanEvent.title}` }));
  await screen.findByText('20% checked in');
  await fireEvent.press(screen.getByRole('button', { name: 'Scan ticket QR' }));
  return screen;
}

async function scan(screen: Awaited<ReturnType<typeof openScanner>>, payload = 'opaque-test-qr') {
  const camera = await screen.findByLabelText('Admission ticket QR camera');
  await fireEvent(camera, 'cameraReady');
  await fireEvent(camera, 'barcodeScanned', { data: payload, type: 'qr' });
  return camera;
}

test.each([
  ['valid', 'Valid ticket'], ['invalid', 'Invalid ticket'], ['cancelled', 'Cancelled ticket'],
  ['refunded', 'Refunded ticket'], ['already_used', 'Already checked in'],
  ['wrong_event', 'Ticket belongs to another event'], ['rejected_campaign_qr', 'Campaign QR — not an admission ticket'],
])('%s has a distinct result and only valid verification offers Check in', async (status, title) => {
  const h = scenario();
  h.verify.mockReturnValueOnce(response(verificationBody(status)));
  const screen = await openScanner(h);
  await scan(screen);
  await screen.findByText(title!);
  expect(screen.getByText(scanEvent.title)).toBeTruthy();
  expect(screen.queryByLabelText('Admission ticket QR camera')).toBeNull();
  if (status === 'valid') {
    expect(screen.getByRole('button', { name: 'Check in' })).toBeEnabled();
    expect(screen.getByText('Test Attendee')).toBeTruthy();
    expect(screen.getByText(/Verified only/)).toBeTruthy();
  } else expect(screen.queryByRole('button', { name: 'Check in' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Scan next ticket' })).toBeEnabled();
  expect(h.admit).not.toHaveBeenCalled();
  expect(h.totals).toHaveBeenCalledTimes(1);
  expect(h.fetcher).toHaveBeenCalledWith(`https://api.example.test/v1/checkin/events/${scanEvent.id}/verify`,
    expect.objectContaining({ body: JSON.stringify({ qrPayload: 'opaque-test-qr' }) }));
});

test('native duplicate emissions and repeated taps issue one verify and one admission, then require explicit rearming', async () => {
  const h = scenario();
  const verification = deferred<Response>();
  h.verify.mockReturnValueOnce(verification.promise);
  const screen = await openScanner(h);
  const camera = await screen.findByLabelText('Admission ticket QR camera');
  await fireEvent(camera, 'cameraReady');
  const emit = camera.props.onBarcodeScanned as (event: { data: string; type: string }) => void;
  await act(async () => { emit({ data: 'opaque-one', type: 'qr' }); emit({ data: 'opaque-two', type: 'qr' }); });
  expect(h.verify).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Check in' })).toBeNull();
  await act(async () => { verification.resolve(response(verificationBody())); });
  const admission = deferred<Response>();
  h.admit.mockReturnValueOnce(admission.promise);
  const button = screen.getByRole('button', { name: 'Check in' });
  await fireEvent.press(button);
  await fireEvent.press(screen.getByRole('button', { name: 'Checking in…' }));
  expect(h.admit).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Checking in…' })).toBeDisabled();
  await act(async () => { admission.resolve(response(confirmedCheckIn, 201)); });
  await screen.findByText('Check-in confirmed');
  expect(screen.queryByLabelText('Admission ticket QR camera')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Scan next ticket' }));
  await screen.findByLabelText('Admission ticket QR camera');
  await act(async () => { emit({ data: 'stale-native-event', type: 'qr' }); });
  expect(h.verify).toHaveBeenCalledTimes(1);
});

test.each([false, true])('confirmed admission refetches totals and survives totals failure=%s', async (totalsFail) => {
  const h = scenario();
  const screen = await openScanner(h);
  await scan(screen);
  await screen.findByText('Valid ticket');
  expect(h.totals).toHaveBeenCalledTimes(1);
  if (totalsFail) h.totals.mockRejectedValueOnce(new Error('Sensitive network detail'));
  else h.totals.mockReturnValueOnce(response({ data: [], registered: 10, checkedIn: 3 }));
  await fireEvent.press(screen.getByRole('button', { name: 'Check in' }));
  await screen.findByText('Check-in confirmed');
  expect(h.totals).toHaveBeenCalledTimes(2);
  await screen.findByText(totalsFail ? /last loaded totals/ : '30% checked in');
  expect(screen.getByText('Check-in confirmed')).toBeTruthy();
  expect(screen.queryByText('Sensitive network detail')).toBeNull();
});

test('a structured 409 refusal replaces valid verification without claiming success', async () => {
  const h = scenario();
  const screen = await openScanner(h);
  await scan(screen);
  await screen.findByText('Valid ticket');
  h.admit.mockReturnValueOnce(response(verificationBody('already_used'), 409));
  await fireEvent.press(screen.getByRole('button', { name: 'Check in' }));
  await screen.findByText('Already checked in');
  expect(screen.queryByRole('button', { name: 'Check in' })).toBeNull();
  expect(screen.queryByText('Check-in confirmed')).toBeNull();
  expect(screen.getByText(/Check-in was refused/)).toBeTruthy();
});

test('lost admission response shows uncertainty and reconciles with a read without repeating the mutation', async () => {
  const h = scenario();
  const screen = await openScanner(h);
  await scan(screen);
  h.admit.mockRejectedValueOnce(new Error('Response lost after commit'));
  await fireEvent.press(await screen.findByRole('button', { name: 'Check in' }));
  await screen.findByText('Check-in outcome unknown');
  expect(screen.queryByText('Check-in confirmed')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Check in' })).toBeNull();
  expect(h.admit).toHaveBeenCalledTimes(1);
  expect(h.totals).toHaveBeenCalledTimes(1);
  h.verify.mockReturnValueOnce(response(verificationBody('already_used')));
  await fireEvent.press(screen.getByRole('button', { name: 'Reverify ticket' }));
  await screen.findByText('Already checked in');
  expect(screen.getByText(/cannot identify which device/)).toBeTruthy();
  expect(h.admit).toHaveBeenCalledTimes(1);
});

test('verification network failure can reverify safely and never calls admission', async () => {
  const h = scenario();
  h.verify.mockRejectedValueOnce(new Error('Private backend trace'));
  const screen = await openScanner(h);
  await scan(screen);
  await screen.findByText('Unable to verify ticket');
  expect(screen.queryByText('Private backend trace')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Reverify ticket' }));
  await screen.findByText('Valid ticket');
  expect(h.admit).not.toHaveBeenCalled();
});

test('camera permission is requested deliberately once and shows requesting/granted states', async () => {
  getPermission.mockResolvedValueOnce({ ...granted, status: 'undetermined' as PermissionResponse['status'], granted: false });
  const permission = deferred<PermissionResponse>();
  requestPermission.mockReturnValueOnce(permission.promise);
  const screen = await openScanner(scenario());
  await screen.findByText('Camera access needed');
  expect(requestPermission).not.toHaveBeenCalled();
  const allow = screen.getByRole('button', { name: 'Allow camera access' });
  await fireEvent.press(allow);
  await screen.findByText('Requesting camera permission…');
  expect(requestPermission).toHaveBeenCalledTimes(1);
  await act(async () => { permission.resolve(granted); });
  await screen.findByLabelText('Admission ticket QR camera');
});

test('permanently denied camera offers device settings and a permission recheck', async () => {
  getPermission.mockResolvedValueOnce({ ...granted, status: 'denied' as PermissionResponse['status'], granted: false, canAskAgain: false });
  const originalSettings = ReactNative.Linking.openSettings;
  const settings = jest.fn<Promise<void>, []>().mockResolvedValue();
  ReactNative.Linking.openSettings = settings;
  try {
    const screen = await openScanner(scenario());
    await screen.findByText('Camera access denied');
    expect(screen.queryByRole('button', { name: 'Allow camera access' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Open camera settings' }));
    expect(settings).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Check camera permission again' }));
    await screen.findByLabelText('Admission ticket QR camera');
  } finally { ReactNative.Linking.openSettings = originalSettings; }
});

test('camera permission errors are safe and retryable', async () => {
  getPermission.mockRejectedValueOnce(new Error('Private camera trace'));
  const screen = await openScanner(scenario());
  await fireEvent.press(await screen.findByRole('button', { name: 'Retry camera permission' }));
  await screen.findByLabelText('Admission ticket QR camera');
  expect(screen.queryByText('Private camera trace')).toBeNull();
});

test('camera mount failure unmounts the preview and can start a new camera attempt', async () => {
  const h = scenario();
  const screen = await openScanner(h);
  const camera = await screen.findByLabelText('Admission ticket QR camera');
  await fireEvent(camera, 'mountError', { message: 'Internal camera detail' });
  await screen.findByRole('button', { name: 'Retry camera' });
  expect(screen.queryByLabelText('Admission ticket QR camera')).toBeNull();
  expect(screen.queryByText('Internal camera detail')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Retry camera' }));
  await scan(screen);
  await screen.findByText('Valid ticket');
  expect(h.verify).toHaveBeenCalledTimes(1);
});

test.each(['verify', 'admit'] as const)('a late %s result cannot affect a different event after leaving the scanner', async (operation) => {
  const h = scenario();
  const pending = deferred<Response>();
  const screen = await openScanner(h);
  if (operation === 'verify') h.verify.mockReturnValueOnce(pending.promise);
  await scan(screen);
  if (operation === 'admit') {
    h.admit.mockReturnValueOnce(pending.promise);
    await fireEvent.press(await screen.findByRole('button', { name: 'Check in' }));
  }
  await fireEvent.press(screen.getByRole('button', { name: 'Back to event' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Back to events' }));
  await fireEvent.press(await screen.findByRole('button', { name: `Open ${otherEvent.title}` }));
  const before = h.totals.mock.calls.length;
  await act(async () => { pending.resolve(response(operation === 'verify' ? verificationBody() : confirmedCheckIn, operation === 'verify' ? 200 : 201)); });
  expect(screen.getByText(otherEvent.title)).toBeTruthy();
  expect(screen.queryByText('Valid ticket')).toBeNull();
  expect(screen.queryByText('Check-in confirmed')).toBeNull();
  expect(h.totals).toHaveBeenCalledTimes(before);
});

test.each(['logout', 'expired', 'removed'] as const)('%s clears a protected scanner and its late work', async (reason) => {
  const h = scenario();
  const pending = deferred<Response>();
  const screen = await openScanner(h);
  h.verify.mockReturnValueOnce(pending.promise);
  await scan(screen);
  if (reason === 'logout') await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  else {
    if (reason === 'expired') h.totals.mockReturnValueOnce(response({ error: { code: 'session_ended' } }, 401));
    else h.events.mockReturnValueOnce(response({ data: [otherEvent], total: 1 }));
    await fireEvent.press(screen.getByRole('button', { name: 'Refresh totals' }));
  }
  await screen.findByText(reason === 'removed' ? 'Assigned events' : 'Staff sign in');
  await act(async () => { pending.resolve(response(verificationBody())); });
  expect(screen.queryByText('Ticket scanner')).toBeNull();
  expect(screen.queryByText('Valid ticket')).toBeNull();
  expect(h.admit).not.toHaveBeenCalled();
});

test.each(['verify', 'admit'] as const)('%s access loss returns through the Phase 2 access-loss screen', async (operation) => {
  const h = scenario();
  const screen = await openScanner(h);
  if (operation === 'verify') h.verify.mockReturnValueOnce(response({ error: { code: 'not_event_staff' } }, 403));
  await scan(screen);
  h.events.mockImplementation(() => response({ data: [otherEvent], total: 1 }));
  if (operation === 'admit') {
    h.admit.mockReturnValueOnce(response({ error: { code: 'not_event_staff' } }, 403));
    await fireEvent.press(await screen.findByRole('button', { name: 'Check in' }));
  }
  await screen.findByText('Assigned events');
  expect(screen.getByText(/no longer available/)).toBeTruthy();
  expect(screen.queryByText('Ticket scanner')).toBeNull();
});

test('transient inactivity preserves the camera workflow, but real backgrounding revalidates auth and clears selection', async () => {
  const handlers = new Set<(state: ReactNative.AppStateStatus) => void>();
  const originalAddListener = ReactNative.AppState.addEventListener;
  ReactNative.AppState.addEventListener = jest.fn((_event, listener) => {
    handlers.add(listener);
    return { remove: () => { handlers.delete(listener); } };
  });
  const original = ReactNative.AppState.currentState;
  ReactNative.AppState.currentState = 'active';
  const emit = async (state: ReactNative.AppStateStatus) => {
    await act(async () => {
      ReactNative.AppState.currentState = state;
      [...handlers].forEach((handler) => handler(state));
    });
  };
  try {
    const h = scenario();
    const screen = await openScanner(h);
    await screen.findByLabelText('Admission ticket QR camera');
    const profileRequests = () => h.fetcher.mock.calls.filter(([url]) => String(url).endsWith('/me')).length;
    expect(profileRequests()).toBe(1);
    await emit('inactive');
    expect(screen.queryByLabelText('Admission ticket QR camera')).toBeNull();
    await emit('active');
    await screen.findByLabelText('Admission ticket QR camera');
    expect(profileRequests()).toBe(1);
    await emit('background');
    await emit('active');
    await screen.findByText('Assigned events');
    expect(profileRequests()).toBe(2);
    expect(screen.queryByText('Ticket scanner')).toBeNull();
    await screen.unmount();
  } finally {
    ReactNative.AppState.addEventListener = originalAddListener;
    ReactNative.AppState.currentState = original;
  }
});

test('a camera that never initializes times out into a retryable unavailable state', async () => {
  jest.useFakeTimers();
  try {
    const screen = await openScanner(scenario());
    await screen.findByLabelText('Admission ticket QR camera');
    await act(async () => { await jest.advanceTimersByTimeAsync(12_000); });
    await screen.findByRole('button', { name: 'Retry camera' });
    expect(screen.queryByLabelText('Admission ticket QR camera')).toBeNull();
    await screen.unmount();
  } finally { jest.useRealTimers(); }
});
