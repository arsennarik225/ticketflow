import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../auth/AuthProvider';
import { RootNavigator } from '../navigation/RootNavigator';
import { deferred, harness, response, tokenResponse, user } from './helpers';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

function show(h: ReturnType<typeof harness>) {
  return render(<SafeAreaProvider><AuthProvider session={h.session}><RootNavigator /></AuthProvider></SafeAreaProvider>);
}

test('sign-in submits once, shows progress, and logout removes the protected screen', async () => {
  const h = harness();
  const login = deferred<Response>();
  h.fetcher.mockReturnValueOnce(login.promise).mockResolvedValueOnce(response(user)).mockResolvedValueOnce(response(undefined, 204));
  await show(h);
  await screen.findByText('Staff sign in');
  await fireEvent.changeText(screen.getByLabelText('Email'), 'staff@example.test');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'test-password');
  const submit = screen.getByRole('button', { name: 'Sign in' });
  await fireEvent.press(submit);
  await fireEvent.press(submit);
  expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
  expect(h.fetcher).toHaveBeenCalledTimes(1);
  login.resolve(response(tokenResponse));
  await screen.findByText("You're signed in");
  expect(screen.queryByLabelText('Password')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  await screen.findByText('Staff sign in');
  expect(screen.queryByText("You're signed in")).toBeNull();
  expect(h.saved()).toBeNull();
});

test('invalid credentials show a safe message and allow another attempt', async () => {
  const h = harness();
  h.fetcher.mockResolvedValueOnce(response({ error: { code: 'invalid_credentials', message: 'Internal stack trace' } }, 401));
  await show(h);
  await screen.findByText('Staff sign in');
  await fireEvent.changeText(screen.getByLabelText('Email'), 'staff@example.test');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'wrong');
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByText('The email or password is incorrect.');
  expect(screen.queryByText('Internal stack trace')).toBeNull();
  await waitFor(() => expect(screen.getByLabelText('Password')).toHaveProp('value', ''));
});

test('authenticated organizer-only accounts see Access Denied and can sign out', async () => {
  const h = harness({ ...tokenResponse, expiresAt: Date.now() + 900_000 });
  h.fetcher.mockResolvedValueOnce(response({ ...user, roles: ['attendee', 'organizer'] }))
    .mockResolvedValueOnce(response(undefined, 204));
  await show(h);
  await screen.findByText('Event Admin access required');
  expect(screen.queryByText("You're signed in")).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  await screen.findByText('Staff sign in');
});

test('restoration failure shows retry controls without exposing protected screens', async () => {
  const h = harness(tokenResponse);
  h.fetcher.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(response(user));
  await show(h);
  await screen.findByText('Unable to restore your session');
  expect(screen.queryByText("You're signed in")).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByText("You're signed in");
});
