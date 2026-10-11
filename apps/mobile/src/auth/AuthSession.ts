import { createAuthApi } from '../api/auth';
import { ApiClient, Decoder, RequestOptions } from '../api/client';
import { ApiError, AuthExpiredError, errorMessage, SessionChangedError } from '../api/errors';
import { parseUser, Tokens, User } from '../api/types';
import { SessionStorage } from './sessionStorage';

export type AuthState =
  | { status: 'restoring' | 'signingOut' }
  | { status: 'signedOut'; message?: string }
  | { status: 'authorized' | 'denied'; user: User }
  | { status: 'unavailable'; message: string; action: 'restore' | 'clear' };

export class AuthSession {
  private state: AuthState = { status: 'restoring' };
  private tokens: Tokens | null = null;
  private generation = 0;
  private listeners = new Set<() => void>();
  private refreshing: { generation: number; promise: Promise<Tokens> } | null = null;
  private restoring: Promise<void> | null = null;
  private signingIn: Promise<void> | null = null;
  private signingOut: Promise<void> | null = null;
  private readonly auth: ReturnType<typeof createAuthApi>;

  constructor(private readonly client: ApiClient, private readonly storage: SessionStorage) {
    this.auth = createAuthApi(client);
  }

  getState = (): AuthState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish(state: AuthState): void {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }

  private assertCurrent(generation: number): void {
    if (this.generation !== generation) throw new SessionChangedError();
  }

  private async clear(generation: number, message?: string, keepSigningOut = false): Promise<void> {
    if (this.generation !== generation) return;
    this.generation++;
    this.tokens = null;
    this.publish({ status: 'signingOut' });
    try {
      await this.storage.clear();
      this.publish(keepSigningOut ? { status: 'signingOut' } : { status: 'signedOut', message });
    } catch {
      this.publish({ status: 'unavailable', action: 'clear',
        message: 'The saved session could not be removed. Unlock this device and retry sign out.' });
    }
  }

  private refresh(generation: number, rejectedTokens: Tokens): Promise<Tokens> {
    this.assertCurrent(generation);
    if (!this.tokens) return Promise.reject(new AuthExpiredError());
    if (this.refreshing?.generation === generation) return this.refreshing.promise;
    // A delayed 401 may arrive after another request already completed rotation.
    if (this.tokens !== rejectedTokens) return Promise.resolve(this.tokens);
    const refreshToken = this.tokens.refreshToken;
    const promise = (async () => {
      try {
        const next = await this.auth.refresh(refreshToken);
        // Logout can use this result to revoke the rotated session; never restore its UI/storage.
        if (this.generation !== generation) return next;
        await this.storage.write(next);
        if (this.generation === generation) this.tokens = next;
        return next;
      } catch {
        await this.clear(generation, 'Your session could not be renewed. Please sign in again.');
        throw new AuthExpiredError();
      }
    })();
    this.refreshing = { generation, promise };
    const reset = () => { if (this.refreshing?.promise === promise) this.refreshing = null; };
    void promise.then(reset, reset);
    return promise;
  }

  async request<T>(path: string, decode: Decoder<T>, options: Omit<RequestOptions, 'token'> = {}): Promise<T> {
    const generation = this.generation;
    let tokens = this.tokens;
    if (!tokens || this.state.status === 'signingOut') throw new AuthExpiredError();
    // At most two attempts: the original request and one attempt after coordinated refresh.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await this.client.request(path, decode, { ...options, token: tokens.accessToken });
        this.assertCurrent(generation);
        return result;
      } catch (error) {
        this.assertCurrent(generation);
        if (!(error instanceof ApiError)) throw error;
        if (error.status === 403 && error.code === 'account_suspended') {
          await this.clear(generation, errorMessage(error));
          throw new AuthExpiredError();
        }
        if (error.status !== 401) throw error;
        if (attempt === 1 || error.code === 'session_ended') {
          await this.clear(generation, 'Your session has ended. Please sign in again.');
          throw new AuthExpiredError();
        }
        tokens = await this.refresh(generation, tokens);
        this.assertCurrent(generation);
      }
    }
    throw new AuthExpiredError();
  }

  private async checkUser(generation: number): Promise<void> {
    const user = await this.request('/me', parseUser);
    this.assertCurrent(generation);
    this.publish({ status: user.emailVerified && user.roles.includes('event_admin') ? 'authorized' : 'denied', user });
  }

  restore(): Promise<void> {
    if (this.restoring) return this.restoring;
    if (this.state.status === 'signingOut' || this.signingIn) return Promise.resolve();
    const generation = this.generation;
    this.publish({ status: 'restoring' });
    const operation = (async () => {
      try {
        const tokens = this.tokens ?? await this.storage.read();
        this.assertCurrent(generation);
        this.tokens = tokens;
        if (!tokens) { this.publish({ status: 'signedOut' }); return; }
        await this.checkUser(generation);
      } catch (error) {
        if (generation === this.generation) {
          this.publish({ status: 'unavailable', action: 'restore', message: errorMessage(error) });
        }
      }
    })();
    this.restoring = operation;
    void operation.then(() => { if (this.restoring === operation) this.restoring = null; });
    return operation;
  }

  signIn(email: string, password: string): Promise<void> {
    if (this.signingIn) return this.signingIn;
    if (this.state.status !== 'signedOut') return Promise.reject(new SessionChangedError());
    const generation = ++this.generation;
    this.publish({ status: 'signedOut' });
    const operation = (async () => {
      try {
        const tokens = await this.auth.login(email.trim(), password);
        if (generation !== this.generation) {
          await this.auth.logout(tokens).catch(() => undefined);
          throw new SessionChangedError();
        }
        this.tokens = tokens;
        await this.storage.write(tokens);
        this.assertCurrent(generation);
        await this.checkUser(generation);
      } catch (error) {
        if (generation === this.generation && this.tokens) {
          const tokens = this.tokens;
          await this.clear(generation, errorMessage(error));
          await this.auth.logout(tokens).catch(() => undefined);
        }
        throw error;
      }
    })();
    this.signingIn = operation;
    const reset = () => { if (this.signingIn === operation) this.signingIn = null; };
    void operation.then(reset, reset);
    return operation;
  }

  signOut(): Promise<void> {
    if (this.signingOut) return this.signingOut;
    const tokens = this.tokens;
    const refreshing = this.refreshing?.promise;
    const generation = this.generation;
    const operation = (async () => {
      // Remove access and saved credentials even when server revocation cannot finish.
      await this.clear(generation, undefined, true);
      const cleared = this.state.status === 'signingOut';
      let message: string | undefined;
      try {
        let current = refreshing ? await refreshing : tokens;
        if (current) {
          // Logout returns 204 even for expired access tokens. Renew before revocation when needed.
          if (!current.expiresAt || current.expiresAt <= Date.now() + 30_000) {
            current = await this.auth.refresh(current.refreshToken);
          }
          await this.auth.logout(current);
        }
      } catch {
        message = 'Signed out on this device. Server sign-out could not be confirmed.';
      }
      if (cleared) this.publish({ status: 'signedOut', message });
    })();
    this.signingOut = operation;
    void operation.then(() => { if (this.signingOut === operation) this.signingOut = null; });
    return operation;
  }
}
