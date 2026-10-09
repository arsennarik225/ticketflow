import { act, fireEvent, render } from '@testing-library/react-native';
import * as ReactNative from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../auth/AuthProvider';
import { RootNavigator } from '../navigation/RootNavigator';
import { deferred, harness, response, tokenResponse, user } from './helpers';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

// React Native lazily loads these exports. Transform them during suite initialization,
// so a cold Babel cache cannot exhaust the first test's timeout during rendering.
for (const name of ['ActivityIndicator', 'KeyboardAvoidingView', 'Pressable', 'ScrollView', 'Text', 'TextInput', 'View'] as const) {
  void ReactNative[name];
}

function show(h: ReturnType<typeof harness>) {
  return render(<SafeAreaProvider><AuthProvider session={h.session}><RootNavigator /></AuthProvider></SafeAreaProvider>);
}

test('sign-in submits once, shows progress, and logout removes the protected screen', async () => {
  const h = harness();
  const login = deferred<Response>();
  const signIn = jest.spyOn(h.session, 'signIn');
  h.fetcher.mockReturnValueOnce(login.promise).mockResolvedValueOnce(response(user))
    .mockResolvedValueOnce(response({ data: [], total: 0 })).mockResolvedValueOnce(response(undefined, 204));
  const screen = await show(h);
  await screen.findByText('Staff sign in');
  await fireEvent.changeText(screen.getByLabelText('Email'), 'staff@example.test');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'test-password');
  const submit = screen.getByRole('button', { name: 'Sign in' });
  try {
    await fireEvent.press(submit);
    await fireEvent.press(submit);
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
    expect(h.fetcher).toHaveBeenCalledTimes(1);
  } finally {
    // Complete the real session operation even if a progress assertion fails.
    await act(async () => {
      login.resolve(response(tokenResponse));
      await signIn.mock.results[0]?.value;
    });
  }
  await screen.findByText('Assigned events');
  expect(screen.queryByLabelText('Password')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  await screen.findByText('Staff sign in');
  expect(screen.queryByText('Assigned events')).toBeNull();
  expect(h.saved()).toBeNull();
});

test.each(['immediate', 'deferred'] as const)('invalid credentials show a safe message and allow another attempt (%s response)', async (timing) => {
  const h = harness();
  const login = deferred<Response>();
  const failure = response({ error: { code: 'invalid_credentials', message: 'Internal stack trace' } }, 401);
  const signIn = jest.spyOn(h.session, 'signIn');
  h.fetcher.mockReturnValueOnce(timing === 'immediate' ? Promise.resolve(failure) : login.promise)
    .mockResolvedValueOnce(response(tokenResponse)).mockResolvedValueOnce(response(user))
    .mockResolvedValueOnce(response({ data: [], total: 0 }));
  const screen = await show(h);
  await screen.findByText('Staff sign in');
  await fireEvent.changeText(screen.getByLabelText('Email'), 'staff@example.test');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'wrong');
  try {
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    if (timing === 'deferred') {
      expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
      expect(screen.getByLabelText('Email')).toHaveProp('editable', false);
      expect(screen.getByLabelText('Password')).toHaveProp('editable', false);
    }
  } finally {
    await act(async () => {
      login.resolve(failure);
      await expect(signIn.mock.results[0]?.value).rejects.toMatchObject({ status: 401, code: 'invalid_credentials' });
    });
  }
  await screen.findByText('The email or password is incorrect.');
  expect(screen.queryByText('Internal stack trace')).toBeNull();
  expect(screen.getByLabelText('Password')).toHaveProp('value', '');
  expect(screen.getByLabelText('Email')).toHaveProp('editable', true);
  expect(screen.getByLabelText('Password')).toHaveProp('editable', true);
  expect(screen.getByRole('button', { name: 'Sign in' })).toHaveProp('accessibilityState', expect.objectContaining({ busy: false }));
  expect(h.saved()).toBeNull();
  expect(h.fetcher).toHaveBeenCalledTimes(1);

  await fireEvent.changeText(screen.getByLabelText('Email'), 'retry@example.test');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'correct-password');
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByText('Assigned events');
  expect(screen.queryByText('The email or password is incorrect.')).toBeNull();
  expect(h.fetcher).toHaveBeenCalledTimes(4);
  expect(h.fetcher.mock.calls[3]?.[0]).toBe('https://api.example.test/v1/checkin/events?assignedOnly=true');
  expect(h.fetcher.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ email: 'retry@example.test', password: 'correct-password' }));
});

test('authenticated organizer-only accounts see Access Denied and can sign out', async () => {
  const h = harness({ ...tokenResponse, expiresAt: Date.now() + 900_000 });
  h.fetcher.mockResolvedValueOnce(response({ ...user, roles: ['attendee', 'organizer'] }))
    .mockResolvedValueOnce(response(undefined, 204));
  const screen = await show(h);
  await screen.findByText('Event Admin access required');
  expect(screen.queryByText('Assigned events')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  await screen.findByText('Staff sign in');
});

test('restoration failure shows retry controls without exposing protected screens', async () => {
  const h = harness(tokenResponse);
  h.fetcher.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(response(user))
    .mockResolvedValueOnce(response({ data: [], total: 0 }));
  const screen = await show(h);
  await screen.findByText('Unable to restore your session');
  expect(screen.queryByText('Assigned events')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByText('Assigned events');
});
