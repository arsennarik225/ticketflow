import type { AuthSession } from '../auth/AuthSession';
import { UnexpectedResponseError } from './errors';
import { isRecord } from './types';

export interface AssignedEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  venueName: string;
  city: string;
  status: 'draft' | 'upcoming' | 'active' | 'completed' | 'cancelled';
  address?: string;
}

export interface AssignedEvents {
  data: AssignedEvent[];
  total: number;
}

export interface AttendanceTotals {
  registered: number;
  checkedIn: number;
  canReverseCheckIn?: boolean;
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isDateTime(value: unknown): value is string {
  return typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    // Date.parse normalizes impossible calendar dates such as February 31.
    new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) === value.slice(0, 10);
}

function isTimeZone(value: unknown): value is string {
  if (!isText(value)) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function isEventStatus(value: unknown): value is AssignedEvent['status'] {
  return value === 'draft' || value === 'upcoming' || value === 'active' ||
    value === 'completed' || value === 'cancelled';
}

function parseAssignedEvent(value: unknown): AssignedEvent {
  if (!isRecord(value) || !isText(value.id) || !isText(value.title) ||
      !isDateTime(value.startsAt) || !isDateTime(value.endsAt) ||
      Date.parse(value.endsAt) <= Date.parse(value.startsAt) || !isTimeZone(value.timeZone) ||
      !isText(value.venueName) || !isText(value.city) || !isEventStatus(value.status) ||
      (value.address != null && typeof value.address !== 'string')) {
    throw new UnexpectedResponseError();
  }
  return {
    id: value.id, title: value.title, startsAt: value.startsAt, endsAt: value.endsAt,
    timeZone: value.timeZone, venueName: value.venueName, city: value.city, status: value.status,
    ...(value.address == null ? {} : { address: value.address }),
  };
}

function parseAssignedEvents(value: unknown): AssignedEvents {
  if (!isRecord(value) || !Array.isArray(value.data) || !isCount(value.total) ||
      value.total < value.data.length) {
    throw new UnexpectedResponseError();
  }
  const data = value.data.map(parseAssignedEvent);
  // Each server event has one identity; duplicate IDs make keyed selection ambiguous.
  if (new Set(data.map((event) => event.id)).size !== data.length) throw new UnexpectedResponseError();
  return { data, total: value.total };
}

function parseAttendanceTotals(value: unknown): AttendanceTotals {
  if (!isRecord(value) || !Array.isArray(value.data) || !isCount(value.registered) || !isCount(value.checkedIn) ||
      value.checkedIn > value.registered ||
      (value.canReverseCheckIn != null && typeof value.canReverseCheckIn !== 'boolean')) {
    throw new UnexpectedResponseError();
  }
  return {
    registered: value.registered, checkedIn: value.checkedIn,
    ...(value.canReverseCheckIn == null ? {} : { canReverseCheckIn: value.canReverseCheckIn }),
  };
}

export function createCheckinApi(session: Pick<AuthSession, 'request'>) {
  return {
    // Assignment rules belong to the server; ownership alone must never grant list access.
    getAssignedEvents: (): Promise<AssignedEvents> =>
      session.request('/checkin/events?assignedOnly=true', parseAssignedEvents),
    getAttendance: (eventId: string): Promise<AttendanceTotals> =>
      session.request(`/checkin/events/${encodeURIComponent(eventId)}/attendees`, parseAttendanceTotals),
  };
}
