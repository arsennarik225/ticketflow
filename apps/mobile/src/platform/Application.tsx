import { ElementRef, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { ScannerNavigator } from '../navigation/ScannerNavigator';
import { colors } from '../components/Screen';
import { AccountPage, AuthContext, AuthPage, RequireAuth } from './auth';
import { AdminPage } from './admin';
import {
  CheckoutPage,
  EventPage,
  EventsPage,
  OrderPage,
  OrdersPage,
  TicketPage,
  TicketsPage,
} from './events';
import { ManageEventPage, NewEventPage, OrganizerPage } from './organizer';
import { CasePage, NewCasePage, SupportPage } from './support';
import { bindSession, session as accountSession, type User } from './api';
import { Language, LanguageContext, useT } from './i18n';
import { Choice, NativeButton, Option, Paragraph } from './native';
import { eventPath, NavigationProvider, useNavigation } from './navigation';
import { Form, text } from './ui';
import { flowStorage, loadLanguage, preferences, saveLanguage } from './storage';

export function Application() {
  const { session } = useAuth();
  bindSession(session);
  const [language, setLanguage] = useState<Language>('ru');
  useEffect(() => {
    void loadLanguage()
      .then((value) => {
        if (value === 'kk' || value === 'ru' || value === 'en') setLanguage(value);
      })
      .catch(() => {});
  }, []);
  const onLanguage = (value: string) => {
    if (value !== 'kk' && value !== 'ru' && value !== 'en') return;
    preferences.setItem('biletflow.language', value);
    setLanguage(value);
    void saveLanguage(value).catch(() => {});
  };
  return (
    <LanguageContext.Provider value={language}>
      <NavigationProvider>
        <Shell language={language} onLanguage={onLanguage} />
      </NavigationProvider>
    </LanguageContext.Provider>
  );
}

function Shell({
  language,
  onLanguage,
}: {
  language: Language;
  onLanguage: (value: string) => void;
}) {
  const { session, state } = useAuth();
  const navigation = useNavigation();
  const lastAccount = useRef<User | null>(null);
  if (state.status === 'authorized' || state.status === 'denied')
    lastAccount.current = accountSession()?.user || null;
  // Keep forms mounted while returning from native pickers and share sheets.
  const user =
    accountSession()?.user || (state.status === 'restoring' ? lastAccount.current : null);
  const t = useT();
  const pathname = navigation.path.split('?')[0] || '/';
  const [menu, setMenu] = useState(false);
  const scroll = useRef<ElementRef<typeof ScrollView>>(null);
  const previousUser = useRef<string | null>(null);
  useEffect(() => {
    if (
      state.status === 'restoring' ||
      state.status === 'signingOut' ||
      state.status === 'unavailable'
    )
      return;
    if (previousUser.current && previousUser.current !== user?.id) {
      flowStorage.clear();
      navigation.navigate('/', true);
    }
    previousUser.current = user?.id || null;
  }, [state.status, user?.id]);
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
    setMenu(false);
  }, [pathname]);
  if (
    (state.status === 'restoring' && !user) ||
    state.status === 'signingOut' ||
    state.status === 'unavailable'
  )
    return <ScannerNavigator />;
  const links: [string, string][] = [
    ['/open-link', 'Open event link'],
    ['/', 'Events'],
    ...(user
      ? ([
          ['/tickets', 'My tickets'],
          ['/orders', 'My orders'],
          ['/organizer', 'Organizer'],
          ['/support', 'Support'],
          ['/account', 'Account'],
        ] as [string, string][])
      : ([
          ['/login', 'Sign in'],
          ['/register', 'Register'],
        ] as [string, string][])),
    ...(user?.roles.includes('platform_admin')
      ? ([['/admin', 'Admin']] as [string, string][])
      : []),
    ...(state.status === 'authorized' ? ([['/scanner', 'Check in']] as [string, string][]) : []),
  ];
  return (
    <AuthContext.Provider value={user}>
      <SafeAreaView
        pointerEvents={state.status === 'restoring' ? 'none' : 'auto'}
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        <View style={{ padding: 12, gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Text style={{ flex: 1, fontWeight: '800', fontSize: 24, color: colors.text }}>
              BiletFlow
            </Text>
            {navigation.canGoBack && (
              <NativeButton onPress={navigation.back}>{t('Back')}</NativeButton>
            )}
            <NativeButton
              aria-label={t('Menu')}
              onPress={() => setMenu((value) => !value)}
              aria-pressed={menu}
            >
              ☰
            </NativeButton>
          </View>
          {menu && (
            <ScrollView style={{ maxHeight: 360 }}>
              <View style={{ gap: 8 }}>
                {links.map(([path, label]) => (
                  <NativeButton
                    key={path}
                    onPress={() => {
                      navigation.navigate(path);
                      setMenu(false);
                    }}
                    aria-pressed={path === pathname}
                  >
                    {t(label)}
                  </NativeButton>
                ))}
                <Choice
                  aria-label={t('Language')}
                  value={language}
                  onChange={(event) => onLanguage(event.target.value)}
                >
                  <Option value="kk">Қазақша</Option>
                  <Option value="ru">Русский</Option>
                  <Option value="en">English</Option>
                </Choice>
                {user && (
                  <NativeButton
                    onPress={() => {
                      void session.signOut();
                    }}
                  >
                    {t('Sign out')}
                  </NativeButton>
                )}
              </View>
            </ScrollView>
          )}
        </View>
        {pathname === '/scanner' ? (
          <ScannerNavigator />
        ) : (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView
              ref={scroll}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
            >
              <Routes key={`${user?.id || 'guest'}:${pathname}`} pathname={pathname} />
              <Paragraph>{t('Payment simulation — no real money is charged.')}</Paragraph>
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
    </AuthContext.Provider>
  );
}

function Routes({ pathname }: { pathname: string }) {
  const t = useT();
  if (pathname === '/') return <EventsPage />;
  if (pathname === '/open-link') return <OpenEventPage />;
  if (pathname === '/login') return <AuthPage mode="login" />;
  if (pathname === '/register') return <AuthPage mode="register" />;
  if (pathname === '/forgot-password') return <AuthPage mode="forgot" />;
  if (pathname === '/reset-password') return <AuthPage mode="reset" />;
  if (pathname === '/verify-email') return <AuthPage mode="verify" />;
  if (/^\/events\/[^/]+$/.test(pathname)) return <EventPage />;
  if (/^\/checkout\/[^/]+$/.test(pathname)) return <CheckoutPage />;
  if (pathname === '/tickets')
    return (
      <RequireAuth>
        <TicketsPage />
      </RequireAuth>
    );
  if (/^\/tickets\/[^/]+$/.test(pathname))
    return (
      <RequireAuth>
        <TicketPage />
      </RequireAuth>
    );
  if (pathname === '/orders')
    return (
      <RequireAuth>
        <OrdersPage />
      </RequireAuth>
    );
  if (/^\/orders\/[^/]+$/.test(pathname)) return <OrderPage />;
  if (pathname === '/account')
    return (
      <RequireAuth>
        <AccountPage />
      </RequireAuth>
    );
  if (pathname === '/organizer')
    return (
      <RequireAuth>
        <OrganizerPage />
      </RequireAuth>
    );
  if (pathname === '/organizer/events/new')
    return (
      <RequireAuth role="organizer">
        <NewEventPage />
      </RequireAuth>
    );
  if (/^\/organizer\/events\/[^/]+$/.test(pathname))
    return (
      <RequireAuth>
        <ManageEventPage />
      </RequireAuth>
    );
  if (pathname === '/support')
    return (
      <RequireAuth>
        <SupportPage />
      </RequireAuth>
    );
  if (pathname === '/support/new')
    return (
      <RequireAuth>
        <NewCasePage />
      </RequireAuth>
    );
  if (/^\/support\/[^/]+$/.test(pathname))
    return (
      <RequireAuth>
        <CasePage />
      </RequireAuth>
    );
  if (pathname === '/admin')
    return (
      <RequireAuth role="platform_admin">
        <AdminPage />
      </RequireAuth>
    );
  return <Paragraph>{t('Page not found')}</Paragraph>;
}

function OpenEventPage() {
  const t = useT();
  const navigation = useNavigation();
  return (
    <>
      <Paragraph>{t('Paste an event or campaign link.')}</Paragraph>
      <Form
        fields={[{ name: 'link', label: 'Event link', type: 'url', required: true }]}
        submit="Open"
        onSubmit={async (data) => {
          const path = eventPath(text(data, 'link'));
          if (!path) throw new Error('Invalid event link');
          navigation.navigate(path);
        }}
      />
    </>
  );
}
