import { ApiClient } from './client';
import { parseEmpty, parseTokens, Tokens } from './types';

export function createAuthApi(client: ApiClient) {
  return {
    login: (email: string, password: string) => client.request('/auth/login', parseTokens, {
      method: 'POST', body: { email, password },
    }),
    refresh: (refreshToken: string) => client.request('/auth/refresh', parseTokens, {
      method: 'POST', body: { refreshToken },
    }),
    logout: (tokens: Tokens) => client.request('/auth/logout', parseEmpty, {
      method: 'POST', token: tokens.accessToken,
    }),
  };
}
