import { createContext, PropsWithChildren, useContext, useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { AuthSession } from './AuthSession';

const AuthContext = createContext<AuthSession | null>(null);

export function AuthProvider({ session, children }: PropsWithChildren<{ session: AuthSession }>) {
  useEffect(() => {
    void session.restore();
    const subscription = AppState.addEventListener('change', (state) => {
      const status = session.getState().status;
      if (state === 'active' && (status === 'authorized' || status === 'denied')) void session.restore();
    });
    return () => subscription.remove();
  }, [session]);
  return <AuthContext.Provider value={session}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const session = useContext(AuthContext);
  if (!session) throw new Error('AuthProvider is required.');
  const state = useSyncExternalStore(session.subscribe, session.getState);
  return { session, state };
}
