import type { AuthSession } from '../auth/AuthSession';
import { ApiError, UnexpectedResponseError } from './errors';
import { isRecord } from './types';

export const verificationStatuses = [
  'valid', 'invalid', 'cancelled', 'refunded', 'already_used', 'wrong_event', 'rejected_campaign_qr',
] as const;
export type VerificationStatus = typeof verificationStatuses[number];

export interface VerifiedTicket {
  id: string;
  eventId: string;
  ticketNumber: string;
  ticketTypeName: string;
  attendee: { fullName: string; email: string };
  seat?: { section: string; row: string; number: number; accessible: boolean };
}

export interface CheckIn {
  id: string;
  ticketId: string;
  ticketNumber: string;
  attendeeName: string;
  checkedInAt: string;
  checkedInByUserId: string;
  method: 'qr' | 'manual' | 'offline';
}

export interface VerificationResult {
  result: VerificationStatus;
  ticket?: VerifiedTicket;
  previousCheckIn?: CheckIn;
}

export type AdmissionResult =
  | { kind: 'admitted'; checkIn: CheckIn }
  | { kind: 'refused'; verification: VerificationResult };

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseCheckIn(value: unknown): CheckIn {
  if (!isRecord(value) || !isText(value.id) || !isText(value.ticketId) || !isText(value.ticketNumber) ||
      !isText(value.attendeeName) || !isText(value.checkedInByUserId) || !isText(value.checkedInAt) ||
      !/(?:Z|[+-]\d{2}:\d{2})$/.test(value.checkedInAt) || !Number.isFinite(Date.parse(value.checkedInAt)) ||
      (value.method !== 'qr' && value.method !== 'manual' && value.method !== 'offline')) {
    throw new UnexpectedResponseError();
  }
  return {
    id: value.id, ticketId: value.ticketId, ticketNumber: value.ticketNumber, attendeeName: value.attendeeName,
    checkedInAt: value.checkedInAt, checkedInByUserId: value.checkedInByUserId, method: value.method,
  };
}

function parseTicket(value: unknown, eventId: string): VerifiedTicket {
  if (!isRecord(value) || !isText(value.id) || value.eventId !== eventId || !isText(value.ticketNumber) ||
      !isText(value.ticketTypeName) || !isRecord(value.attendee) || !isText(value.attendee.fullName) ||
      !isText(value.attendee.email)) throw new UnexpectedResponseError();
  let seat: VerifiedTicket['seat'];
  if (value.seat != null) {
    const s = value.seat;
    if (!isRecord(s) || !isText(s.section) || !isText(s.row) || typeof s.number !== 'number' ||
        !Number.isSafeInteger(s.number) || s.number < 1 || typeof s.accessible !== 'boolean') {
      throw new UnexpectedResponseError();
    }
    seat = { section: s.section, row: s.row, number: s.number, accessible: s.accessible };
  }
  return {
    id: value.id, eventId, ticketNumber: value.ticketNumber, ticketTypeName: value.ticketTypeName,
    attendee: { fullName: value.attendee.fullName, email: value.attendee.email }, ...(seat ? { seat } : {}),
  };
}

function parseVerification(value: unknown, eventId: string): VerificationResult {
  if (!isRecord(value) || !verificationStatuses.some((status) => status === value.result) || !isText(value.message)) {
    throw new UnexpectedResponseError();
  }
  const result = value.result as VerificationStatus;
  const ticket = value.ticket == null ? undefined : parseTicket(value.ticket, eventId);
  const previousCheckIn = value.previousCheckIn == null ? undefined : parseCheckIn(value.previousCheckIn);
  if (result === 'valid' && !ticket || ticket && previousCheckIn && ticket.id !== previousCheckIn.ticketId) {
    throw new UnexpectedResponseError();
  }
  // Keep only operational fields. Never retain returned QR/PDF URLs or render raw server messages.
  return { result, ...(ticket ? { ticket } : {}), ...(previousCheckIn ? { previousCheckIn } : {}) };
}

// Both QR and manual admission use the same confirmation and operational 409 contract.
export async function submitAdmission(session: Pick<AuthSession, 'request'>, eventId: string,
  body: { qrPayload: string } | { ticketId: string }): Promise<AdmissionResult> {
  try {
    const checkIn = await session.request(`/checkin/events/${encodeURIComponent(eventId)}/check-ins`, parseCheckIn,
      { method: 'POST', body });
    return { kind: 'admitted', checkIn };
  } catch (error) {
    // This endpoint's 409 body is VerifyResult, not the generic API error envelope.
    if (!(error instanceof ApiError) || error.status !== 409) throw error;
    const verification = parseVerification(error.body, eventId);
    if (verification.result === 'valid') throw new UnexpectedResponseError();
    return { kind: 'refused', verification };
  }
}

export function createTicketCheckinApi(session: Pick<AuthSession, 'request'>) {
  return {
    verify: (eventId: string, qrPayload: string): Promise<VerificationResult> => session.request(
      `/checkin/events/${encodeURIComponent(eventId)}/verify`, (value) => parseVerification(value, eventId),
      { method: 'POST', body: { qrPayload } },
    ),
    admit: (eventId: string, qrPayload: string): Promise<AdmissionResult> =>
      submitAdmission(session, eventId, { qrPayload }),
  };
}

export type TicketCheckinApi = ReturnType<typeof createTicketCheckinApi>;
