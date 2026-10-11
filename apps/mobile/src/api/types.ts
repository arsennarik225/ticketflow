import { UnexpectedResponseError } from './errors';

export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  fullName?: string;
  roles: string[];
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseUser(value: unknown): User {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id ||
      typeof value.email !== 'string' || !value.email || typeof value.emailVerified !== 'boolean' ||
      !Array.isArray(value.roles) || !value.roles.every((role: unknown) => typeof role === 'string') ||
      (value.fullName !== undefined && typeof value.fullName !== 'string')) {
    throw new UnexpectedResponseError();
  }
  return {
    id: value.id, email: value.email, emailVerified: value.emailVerified,
    roles: value.roles, ...(value.fullName === undefined ? {} : { fullName: value.fullName }),
  };
}

export function parseTokens(value: unknown): Tokens {
  if (!isRecord(value) || typeof value.accessToken !== 'string' || !value.accessToken ||
      typeof value.refreshToken !== 'string' || !value.refreshToken ||
      (value.expiresIn !== undefined && (typeof value.expiresIn !== 'number' ||
        !Number.isFinite(value.expiresIn) || value.expiresIn <= 0))) {
    throw new UnexpectedResponseError();
  }
  return {
    accessToken: value.accessToken,
    refreshToken: value.refreshToken,
    ...(typeof value.expiresIn === 'number' ? { expiresAt: Date.now() + value.expiresIn * 1000 } : {}),
  };
}

export function parseEmpty(value: unknown): void {
  if (value !== undefined) throw new UnexpectedResponseError();
}
