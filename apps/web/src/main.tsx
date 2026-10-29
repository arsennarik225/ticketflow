import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom';
import { api, saveSession, session, type User } from './api';
import { AccountPage, AuthContext, AuthPage, RequireAuth } from './auth';
import { CheckoutPage, EventPage, EventsPage, OrderPage, OrdersPage, TicketPage } from './events';
import { ManageEventPage, NewEventPage, OrganizerPage } from './organizer';
import { CasePage, NewCasePage, SupportPage } from './support';
import { AdminPage } from './admin';
import { LanguageContext, useT, type Language } from './i18n';
import './styles.css';

function App() {
  const [user, setUser] = useState<User | null>(() => session()?.user || null);
  const [language, setLanguage] = useState<Language>(() => {
    const value = localStorage.getItem('biletflow.language');
    return value === 'kk' || value === 'en' ? value : 'ru';
  });
  useEffect(() => {
    const changed = () => setUser(session()?.user || null);
    window.addEventListener('sessionchange', changed);
    return () => window.removeEventListener('sessionchange', changed);
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    localStorage.setItem('biletflow.language', language);
  }, [language]);
  useEffect(() => {
    if (session())
      void api<User>('/me')
        .then((value) => {
          const current = session();
          if (current) saveSession({ ...current, user: value });
        })
        .catch(() => {});
  }, []);
  return (
    <LanguageContext.Provider value={language}>
      <AuthContext.Provider value={user}>
        <BrowserRouter>
          <Shell language={language} onLanguage={setLanguage} user={user} />
        </BrowserRouter>
      </AuthContext.Provider>
    </LanguageContext.Provider>
  );
}
function Shell({
  language,
  onLanguage,
  user,
}: {
  language: Language;
  onLanguage: (value: Language) => void;
  user: User | null;
}) {
  const t = useT();
  return (
    <>
      <a className="skip" href="#main">
        {t('Continue')}
      </a>
      <header>
        <div className="header-inner">
          <Link className="brand" to="/">
            Bilet<span>Flow</span>
          </Link>
          <nav className="nav">
            <NavLink to="/">{t('Events')}</NavLink>
            {user && (
              <>
                <NavLink to="/orders">{t('My orders')}</NavLink>
                <NavLink to="/organizer">{t('Organizer')}</NavLink>
                <NavLink to="/support">{t('Support')}</NavLink>
                <NavLink to="/account">{t('Account')}</NavLink>
              </>
            )}
            {user?.roles.includes('platform_admin') && <NavLink to="/admin">{t('Admin')}</NavLink>}
          </nav>
          <select
            className="locale"
            aria-label={t('Language')}
            value={language}
            onChange={(e) => onLanguage(e.target.value as Language)}
          >
            <option value="kk">Қазақша</option>
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </select>
          {user ? (
            <button
              onClick={async () => {
                try {
                  await api('/auth/logout', { method: 'POST' });
                } finally {
                  saveSession(null);
                  sessionStorage.clear();
                  location.assign('/');
                }
              }}
            >
              {t('Sign out')}
            </button>
          ) : (
            <Link className="button" to="/login">
              {t('Sign in')}
            </Link>
          )}
        </div>
      </header>
      <main id="main" className="layout" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<EventsPage />} />
          <Route path="/events/:id" element={<EventPage />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/forgot-password" element={<AuthPage mode="forgot" />} />
          <Route path="/reset-password" element={<AuthPage mode="reset" />} />
          <Route path="/verify-email" element={<AuthPage mode="verify" />} />
          <Route
            path="/account"
            element={
              <RequireAuth>
                <AccountPage />
              </RequireAuth>
            }
          />
          <Route path="/checkout/:id" element={<CheckoutPage />} />
          <Route
            path="/orders"
            element={
              <RequireAuth>
                <OrdersPage />
              </RequireAuth>
            }
          />
          <Route path="/orders/:id" element={<OrderPage />} />
          <Route
            path="/tickets/:id"
            element={
              <RequireAuth>
                <TicketPage />
              </RequireAuth>
            }
          />
          <Route
            path="/organizer"
            element={
              <RequireAuth>
                <OrganizerPage />
              </RequireAuth>
            }
          />
          <Route
            path="/organizer/events/new"
            element={
              <RequireAuth role="organizer">
                <NewEventPage />
              </RequireAuth>
            }
          />
          <Route
            path="/organizer/events/:id"
            element={
              <RequireAuth>
                <ManageEventPage />
              </RequireAuth>
            }
          />
          <Route
            path="/support"
            element={
              <RequireAuth>
                <SupportPage />
              </RequireAuth>
            }
          />
          <Route
            path="/support/new"
            element={
              <RequireAuth>
                <NewCasePage />
              </RequireAuth>
            }
          />
          <Route
            path="/support/:id"
            element={
              <RequireAuth>
                <CasePage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAuth role="platform_admin">
                <AdminPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<h1>{t('Page not found')}</h1>} />
        </Routes>
      </main>
      <footer>BiletFlow · {t('Payment simulation — no real money is charged.')}</footer>
    </>
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
