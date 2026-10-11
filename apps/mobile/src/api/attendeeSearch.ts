import type { AuthSession } from '../auth/AuthSession';
import { AttendanceTotals, parseAttendanceTotals } from './checkin';
import { UnexpectedResponseError } from './errors';
import { submitAdmission } from './ticketCheckin';
import { isRecord, parseEmpty } from './types';

export interface Attendee {
  ticketId: string;
  ticketNumber: string;
  fullName: string;
  email: string;
  ticketTypeName: string;
  status: 'valid' | 'checked_in' | 'cancelled' | 'refunded';
  seatLabel?: string;
  checkedInAt?: string;
  checkInId?: string;
}

export interface AttendeeMatches extends AttendanceTotals {
  data: Attendee[];
  canReverseCheckIn: boolean;
}

export function queryError(input: string): string | null {
  const length = Array.from(input.trim()).length;
  if (length < 2) return 'Enter at least 2 characters to search by name, email, or ticket number.';
  if (length > 100) return 'Use no more than 100 characters for your search.';
  return null;
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseAttendee(value: unknown): Attendee {
  if (!isRecord(value) || !isText(value.ticketId) || !isText(value.ticketNumber) || !isText(value.fullName) ||
      !isText(value.email) || !isText(value.ticketTypeName) ||
      typeof value.status !== 'string' || !['valid', 'checked_in', 'cancelled', 'refunded'].includes(value.status) ||
      (value.seatLabel != null && !isText(value.seatLabel)) ||
      (value.checkInId != null && !isText(value.checkInId)) ||
      (value.checkedInAt != null && (!isText(value.checkedInAt) ||
        !/(?:Z|[+-]\d{2}:\d{2})$/.test(value.checkedInAt) || !Number.isFinite(Date.parse(value.checkedInAt))))) {
    throw new UnexpectedResponseError();
  }
  // orderId and any extra server fields are intentionally not kept in the operational UI.
  return {
    ticketId: value.ticketId, ticketNumber: value.ticketNumber, fullName: value.fullName,
    email: value.email, ticketTypeName: value.ticketTypeName, status: value.status as Attendee['status'],
    ...(value.seatLabel == null ? {} : { seatLabel: value.seatLabel as string }),
    ...(value.checkedInAt == null ? {} : { checkedInAt: value.checkedInAt as string }),
    ...(value.checkInId == null ? {} : { checkInId: value.checkInId as string }),
  };
}

function parseMatches(value: unknown): AttendeeMatches {
  const totals = parseAttendanceTotals(value);
  if (!isRecord(value) || !Array.isArray(value.data) || value.data.length > 50 ||
      typeof value.canReverseCheckIn !== 'boolean') throw new UnexpectedResponseError();
  const data = value.data.map(parseAttendee);
  if (new Set(data.map((row) => row.ticketId)).size !== data.length) throw new UnexpectedResponseError();
  return { ...totals, canReverseCheckIn: value.canReverseCheckIn, data };
}

export function createAttendeeSearchApi(session: Pick<AuthSession, 'request'>) {
  return {
    async search(eventId: string, input: string): Promise<AttendeeMatches> {
      const q = input.trim();
      const error = queryError(q);
      if (error) throw new Error(error);
      return session.request(`/checkin/events/${encodeURIComponent(eventId)}/attendees?q=${encodeURIComponent(q)}`, parseMatches);
    },
    admit: (eventId: string, ticketId: string) => submitAdmission(session, eventId, { ticketId }),
    reverse: (checkInId: string): Promise<void> =>
      session.request(`/checkin/check-ins/${encodeURIComponent(checkInId)}`, parseEmpty, { method: 'DELETE' }),
  };
}

export type AttendeeSearchApi = ReturnType<typeof createAttendeeSearchApi>;
