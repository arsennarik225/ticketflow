import * as SecureStore from 'expo-secure-store';
import { StorageError } from '../api/errors';
import { createSessionStorage } from '../auth/sessionStorage';
import { deferred, nextTurn } from './helpers';

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 7,
  getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(),
}));

const apiUrl = 'https://api.example.test/v1';
const tokens = { accessToken: 'test-access', refreshToken: 'test-refresh', expiresAt: 1_900_000_000_000 };

beforeEach(() => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
  jest.mocked(SecureStore.setItemAsync).mockResolvedValue();
  jest.mocked(SecureStore.deleteItemAsync).mockResolvedValue();
});

test('writes both tokens in one protected entry scoped to the API', async () => {
  const storage = createSessionStorage(apiUrl);
  await storage.write(tokens);
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith('biletflow.staff.session.v1',
    JSON.stringify({ apiUrl, tokens }), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
});

test('reads valid persisted tokens', async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(JSON.stringify({ apiUrl, tokens }));
  await expect(createSessionStorage(apiUrl).read()).resolves.toEqual(tokens);
});

test.each(['broken JSON', JSON.stringify({ apiUrl, tokens: { accessToken: 'missing-refresh' } }),
  JSON.stringify({ apiUrl: 'https://another-api.example.test/v1', tokens })])
('discards corrupt or different-server credentials', async (raw) => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(raw);
  await expect(createSessionStorage(apiUrl).read()).resolves.toBeNull();
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(1);
});

test('serializes writes and deletion so logout wins over a pending save', async () => {
  const pending = deferred<void>();
  jest.mocked(SecureStore.setItemAsync).mockReturnValueOnce(pending.promise);
  const storage = createSessionStorage(apiUrl);
  const write = storage.write(tokens);
  const clear = storage.clear();
  await nextTurn();
  expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  pending.resolve();
  await Promise.all([write, clear]);
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledTimes(1);
});

test('storage failures are sanitized and do not poison subsequent cleanup', async () => {
  jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error('native internal detail'));
  const storage = createSessionStorage(apiUrl);
  await expect(storage.write(tokens)).rejects.toBeInstanceOf(StorageError);
  await expect(storage.clear()).resolves.toBeUndefined();
});
