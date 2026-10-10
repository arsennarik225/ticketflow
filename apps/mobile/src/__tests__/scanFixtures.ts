import { CheckIn, VerifiedTicket } from '../api/ticketCheckin';

export const scanEvent = {
  id: '66f019f9-f342-4e13-8a98-a28887aa81ee', title: 'Entrance test event',
  venueName: 'Test Hall', city: 'Almaty', startsAt: '2026-10-10T12:00:00Z',
  endsAt: '2026-10-10T16:00:00Z', timeZone: 'Asia/Almaty', status: 'active',
};
export const scannedTicket: VerifiedTicket = {
  id: 'test-ticket-id', eventId: scanEvent.id, ticketNumber: 'T-TEST-001', ticketTypeName: 'General admission',
  attendee: { fullName: 'Test Attendee', email: 'attendee@example.test' },
};
export const confirmedCheckIn: CheckIn = {
  id: 'test-check-in-id', ticketId: scannedTicket.id, ticketNumber: scannedTicket.ticketNumber,
  attendeeName: scannedTicket.attendee.fullName, checkedInAt: '2026-10-10T13:00:00Z',
  checkedInByUserId: 'staff-id', method: 'qr',
};
export const validVerification = { result: 'valid' as const, ticket: scannedTicket };
export const verificationBody = (result = 'valid') => ({
  result, message: 'Server operational message',
  ...(['valid', 'already_used', 'cancelled', 'refunded'].includes(result) ? { ticket: scannedTicket } : {}),
  ...(result === 'already_used' ? { previousCheckIn: confirmedCheckIn } : {}),
});
