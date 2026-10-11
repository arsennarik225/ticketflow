import { createContext, PropsWithChildren, useContext, useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { AuthSession } from './AuthSession';

const AuthContext = createContext<AuthSession | null>(null);

export function AuthProvider({ session, children }: PropsWithChildren<{ session: AuthSession }>) {
  useEffect(() => {
    void session.restore();
    let backgrounded = AppState.currentState === 'background';
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgrounded = true;
      if (state !== 'active' || !backgrounded) return;
      backgrounded = false;
      const status = session.getState().status;
      // Native permission dialogs briefly make iOS inactive. Only a real background transition
      // should restore/unmount protected screens while requesting camera access.
      if (status === 'authorized' || status === 'denied') void session.restore();
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
