export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    readonly body: unknown,
  ) {
    // Keep untrusted response content out of Error messages and native error overlays.
    super('The server could not complete the request.');
    this.name = 'ApiError';
  }
}

export class NetworkError extends Error {
  constructor() { super('Unable to reach the server. Check your connection and try again.'); }
}

export class UnexpectedResponseError extends Error {
  constructor() { super('The server returned an unexpected response. Please try again.'); }
}

export class AuthExpiredError extends Error {
  constructor() { super('Your session has ended. Please sign in again.'); }
}

export class SessionChangedError extends Error {
  constructor() { super('The session changed while the request was running.'); }
}

export class StorageError extends Error {
  constructor() { super('Secure storage is unavailable. Unlock your device and try again.'); }
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'invalid_credentials') return 'The email or password is incorrect.';
    if (error.code === 'account_suspended') return 'This account is suspended. Contact your administrator.';
    if (error.status === 429) return 'Too many attempts. Please wait before trying again.';
    if (error.status >= 500) return 'The service is temporarily unavailable. Please try again.';
    return 'The request could not be completed. Please try again.';
  }
  if (error instanceof NetworkError || error instanceof UnexpectedResponseError ||
      error instanceof AuthExpiredError || error instanceof StorageError) return error.message;
  return 'Something went wrong. Please try again.';
}
