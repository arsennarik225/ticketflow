import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { BackHandler, Linking } from 'react-native';
import { getApiUrl } from '../config/env';
import { NativeButton } from './native';

type Navigation = {
  path: string;
  navigate: (path: string, replace?: boolean) => void;
  back: () => void;
  canGoBack: boolean;
};
const NavigationContext = createContext<Navigation | null>(null);
let current = '/';
let go: Navigation['navigate'] = () => {};
export function currentPath() {
  return current;
}
export function eventPath(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['biletflow:', 'https:', 'http:', 'exp:', 'exps:'].includes(url.protocol)) return null;
    const path =
      url.protocol === 'biletflow:'
        ? '/' + url.host + url.pathname
        : url.pathname.includes('/--/')
          ? '/' + url.pathname.split('/--/')[1]
          : url.pathname;
    return /^\/events\/[^/]+$/.test(path) ? path + url.search : null;
  } catch {
    return null;
  }
}
export function incomingPath(value: string, apiUrl: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol === 'biletflow:') return '/' + url.host + url.pathname + url.search;
    if (['exp:', 'exps:'].includes(url.protocol) && url.pathname.includes('/--/'))
      return '/' + url.pathname.split('/--/')[1] + url.search;
    if (['https:', 'http:'].includes(url.protocol) && url.hostname === new URL(apiUrl).hostname)
      return url.pathname + url.search;
  } catch {
    return null;
  }
  return null;
}
export async function openExternal(value: string) {
  const internal = incomingPath(value, getApiUrl());
  if (internal && !internal.startsWith('/v1')) {
    go(internal);
    return;
  }
  const url = new URL(value);
  if (
    ['https:', 'http:'].includes(url.protocol) &&
    /^\/(events\/|verify-email|reset-password)/.test(url.pathname)
  ) {
    go(url.pathname + url.search);
    return;
  }
  if (!['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol))
    throw new Error('Unsupported link.');
  await Linking.openURL(url.toString());
}
export function NavigationProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState(['/']);
  const path = history[history.length - 1] || '/';
  const navigate = (next: string, replace = false) => {
    if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return;
    setHistory((items) => (replace ? [...items.slice(0, -1), next] : [...items, next]));
  };
  current = path;
  go = navigate;
  const back = () => setHistory((items) => (items.length > 1 ? items.slice(0, -1) : items));
  useEffect(() => {
    const open = ({ url }: { url: string }) => {
      const next = incomingPath(url, getApiUrl());
      if (next) navigate(next);
    };
    void Linking.getInitialURL()
      .then((url) => {
        if (url) open({ url });
      })
      .catch(() => {});
    const subscription = Linking.addEventListener('url', open);
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (history.length <= 1) return false;
      back();
      return true;
    });
    return () => subscription.remove();
  }, [history.length]);
  return (
    <NavigationContext.Provider value={{ path, navigate, back, canGoBack: history.length > 1 }}>
      {children}
    </NavigationContext.Provider>
  );
}
export function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) throw new Error('NavigationProvider is required.');
  return context;
}
export function useNavigate() {
  return useNavigation().navigate;
}
export function useParams(): { id?: string } {
  const { path } = useNavigation();
  return { id: path.split('?')[0]?.split('/').filter(Boolean).pop() };
}
export function useSearchParams(): [
  URLSearchParams,
  (next: URLSearchParams | Record<string, string>) => void,
] {
  const { path, navigate } = useNavigation();
  return [
    new URLSearchParams(path.split('?')[1]),
    (next) => navigate(`${path.split('?')[0]}?${new URLSearchParams(next)}`, true),
  ];
}
export function Link({
  to,
  children,
  variant: _variant,
}: {
  to: string;
  children?: ReactNode;
  variant?: string;
}) {
  const navigate = useNavigate();
  return <NativeButton onPress={() => navigate(to)}>{children}</NativeButton>;
}
