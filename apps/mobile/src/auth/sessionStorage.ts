import * as SecureStore from 'expo-secure-store';
import { StorageError } from '../api/errors';
import { isRecord, Tokens } from '../api/types';

export interface SessionStorage {
  read(): Promise<Tokens | null>;
  write(tokens: Tokens): Promise<void>;
  clear(): Promise<void>;
}

const KEY = 'biletflow.staff.session.v1';
const OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export function createSessionStorage(apiUrl: string): SessionStorage {
  // Serialize native storage operations so a late save cannot overtake logout's delete.
  let queue = Promise.resolve();
  function run<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation).catch(() => { throw new StorageError(); });
    queue = result.then(() => undefined, () => undefined);
    return result;
  }
  return {
    read: () => run(async () => {
      const raw = await SecureStore.getItemAsync(KEY, OPTIONS);
      if (raw === null) return null;
      let stored: unknown;
      try { stored = JSON.parse(raw); } catch { stored = null; }
      if (!isRecord(stored) || stored.apiUrl !== apiUrl || !isRecord(stored.tokens) ||
          typeof stored.tokens.accessToken !== 'string' || !stored.tokens.accessToken ||
          typeof stored.tokens.refreshToken !== 'string' || !stored.tokens.refreshToken ||
          (stored.tokens.expiresAt !== undefined && (typeof stored.tokens.expiresAt !== 'number' ||
            !Number.isFinite(stored.tokens.expiresAt)))) {
        await SecureStore.deleteItemAsync(KEY, OPTIONS);
        return null;
      }
      return {
        accessToken: stored.tokens.accessToken,
        refreshToken: stored.tokens.refreshToken,
        ...(typeof stored.tokens.expiresAt === 'number' ? { expiresAt: stored.tokens.expiresAt } : {}),
      };
    }),
    write: (tokens) => run(() => SecureStore.setItemAsync(KEY, JSON.stringify({ apiUrl, tokens }), OPTIONS)),
    clear: () => run(() => SecureStore.deleteItemAsync(KEY, OPTIONS)),
  };
}
