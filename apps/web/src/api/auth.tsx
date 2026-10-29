// src/api/auth.ts
//
// Replaces the fake `useState<Role>("attendee")` in App.tsx with a real
// session: restores the signed-in user from the refresh token on load,
// exposes login/register/logout, and keeps language in sync with the
// backend (PATCH /me — see README.md "Language").

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiRequest, setApiLanguage, tokenStore, type Language } from "./client";

export type Role = "attendee" | "organizer" | "admin";

export interface Me {
  id: string;
  email: string;
  role: Role;
  language: Language;
  emailVerified: boolean;
  // Not confirmed against the real contract yet (not named in README.md) —
  // the Profile screen displays these, so included as optional until
  // verified against docs/api/openapi.yaml / src/api/schema.d.ts.
  name?: string;
  phone?: string;
}

interface AuthState {
  user: Me | null;
  /** True until the initial session-restore check has finished. */
  loading: boolean;
  login: (email: string, password: string) => Promise<Me>;
  register: (email: string, password: string, language: Language) => Promise<void>;
  verifyEmail: (token: string) => Promise<Me>;
  logout: () => void;
  /** Re-fetch /me, e.g. after email verification changes emailVerified. */
  refreshMe: () => Promise<void>;
  /** Updates both the API's Accept-Language and the user's stored preference. */
  setLanguage: (lang: Language) => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    if (!tokenStore.getAccess() && !tokenStore.getRefresh()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await apiRequest<Me>("/me");
      setUser(me);
      setApiLanguage(me.language);
    } catch {
      // Refresh token invalid/expired — fall back to signed-out.
      tokenStore.clear();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiRequest<{ accessToken: string; refreshToken: string; user: Me }>("/auth/login", {
      method: "POST",
      auth: false,
      body: { email, password },
    });
    tokenStore.set(data.accessToken, data.refreshToken);
    setUser(data.user);
    setApiLanguage(data.user.language);
    return data.user;
  }, []);

  const register = useCallback(async (email: string, password: string, language: Language) => {
    // Registration does not sign the user in — they must verify their email
    // first (the verify-email page's token exchange is what starts the session).
    await apiRequest("/auth/register", {
      method: "POST",
      auth: false,
      body: { email, password, language },
    });
  }, []);

  const verifyEmail = useCallback(async (token: string) => {
    // Per README.md: "/verify-email?token=… | POST /auth/verify-email,
    // then the user is signed in" — same token-pair response shape as login.
    const data = await apiRequest<{ accessToken: string; refreshToken: string; user: Me }>("/auth/verify-email", {
      method: "POST",
      auth: false,
      body: { token },
    });
    tokenStore.set(data.accessToken, data.refreshToken);
    setUser(data.user);
    setApiLanguage(data.user.language);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  const setLanguage = useCallback(
    async (lang: Language) => {
      setApiLanguage(lang);
      if (user) {
        const updated = await apiRequest<Me>("/me", { method: "PATCH", body: { language: lang } });
        setUser(updated);
      }
    },
    [user]
  );

  return (
    <Ctx.Provider value={{ user, loading, login, register, verifyEmail, logout, refreshMe, setLanguage }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth() must be used within <AuthProvider>");
  return ctx;
}
