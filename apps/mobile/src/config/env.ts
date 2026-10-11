export function validateApiUrl(value: string | undefined, development: boolean): string {
  const help = 'Set EXPO_PUBLIC_API_URL in apps/mobile/.env to a reachable API URL ending in /v1.';
  if (!value?.trim()) throw new Error(help);
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(help);
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    !url.hostname || url.username || url.password || url.search || url.hash ||
    url.pathname.replace(/\/+$/, '') !== '/v1'
  ) {
    throw new Error(help);
  }
  if (!development && url.protocol !== 'https:') {
    throw new Error('EXPO_PUBLIC_API_URL must use HTTPS in release builds.');
  }
  return url.toString().replace(/\/+$/, '');
}

export function getApiUrl(): string {
  // Expo only inlines direct EXPO_PUBLIC references.
  return validateApiUrl(process.env.EXPO_PUBLIC_API_URL, __DEV__);
}
