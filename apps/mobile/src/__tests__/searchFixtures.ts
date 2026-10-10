import { Attendee, AttendeeMatches } from '../api/attendeeSearch';
import { confirmedCheckIn, scannedTicket } from './scanFixtures';

export const searchRow: Attendee = {
  ticketId: scannedTicket.id, ticketNumber: scannedTicket.ticketNumber,
  fullName: scannedTicket.attendee.fullName, email: scannedTicket.attendee.email,
  ticketTypeName: scannedTicket.ticketTypeName, status: 'valid', seatLabel: 'A / 1 / 3',
};
export const checkedRow: Attendee = {
  ...searchRow, status: 'checked_in', checkedInAt: confirmedCheckIn.checkedInAt, checkInId: confirmedCheckIn.id,
};
export const matches = (row: Attendee = searchRow, canReverseCheckIn = true): AttendeeMatches => ({
  data: [row], registered: 10, checkedIn: row.checkInId ? 3 : 2, canReverseCheckIn,
});
