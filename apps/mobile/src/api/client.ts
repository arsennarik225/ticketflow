import { ApiError, NetworkError, UnexpectedResponseError } from './errors';
import { isRecord } from './types';

export type Decoder<T> = (value: unknown) => T;
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH';
  body?: unknown;
  token?: string;
}

export class ApiClient {
  constructor(
    readonly baseUrl: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly timeoutMs = 15_000,
  ) {}

  async request<T>(path: string, decode: Decoder<T>, options: RequestOptions = {}): Promise<T> {
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('API paths must be relative.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      let response: Response;
      let text: string;
      try {
        response = await this.fetcher(this.baseUrl + path, {
          method: options.method ?? 'GET',
          headers: {
            Accept: 'application/json',
            ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
            ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
          },
          ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
          signal: controller.signal,
          // Do not follow redirects with authentication credentials.
          redirect: 'error',
        });
        text = response.status === 204 ? '' : await response.text();
      } catch {
        throw new NetworkError();
      }
      let body: unknown;
      try {
        body = text ? JSON.parse(text) : undefined;
      } catch {
        if (response.ok) throw new UnexpectedResponseError();
      }
      if (!response.ok) {
        const code = isRecord(body) && isRecord(body.error) && typeof body.error.code === 'string'
          ? body.error.code : undefined;
        // Preserve unknown error bodies, including future check-in 409 results.
        throw new ApiError(response.status, code, body);
      }
      if (response.status !== 204 && !text) throw new UnexpectedResponseError();
      return decode(body);
    } finally {
      clearTimeout(timeout);
    }
  }
}
