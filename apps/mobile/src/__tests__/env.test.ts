import { validateApiUrl } from '../config/env';

test.each([undefined, '', 'not a url', 'ftp://server/v1', 'https://server', 'https://server/v2',
  'https://name:secret@server/v1', 'https://server/v1?secret=x', 'https://server/v1#part'])
('rejects missing or invalid API configuration: %s', (value) => {
  expect(() => validateApiUrl(value, true)).toThrow('EXPO_PUBLIC_API_URL');
});

test('normalizes trailing slashes and allows HTTP for LAN development', () => {
  expect(validateApiUrl(' http://192.168.1.20:8000/v1/ ', true)).toBe('http://192.168.1.20:8000/v1');
});

test('requires HTTPS for release builds', () => {
  expect(() => validateApiUrl('http://192.168.1.20:8000/v1', false)).toThrow('HTTPS');
  expect(validateApiUrl('https://api.example.test/v1', false)).toBe('https://api.example.test/v1');
});
