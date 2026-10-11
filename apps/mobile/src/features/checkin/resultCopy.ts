import type { VerificationStatus } from '../../api/ticketCheckin';

export const resultCopy: Record<VerificationStatus, { title: string; detail: string }> = {
  valid: { title: 'Valid ticket', detail: 'Verified only. This attendee has not been checked in by this scan.' },
  invalid: { title: 'Invalid ticket', detail: 'The server did not recognize a valid admission ticket. Do not admit.' },
  cancelled: { title: 'Cancelled ticket', detail: 'This ticket is cancelled. Do not admit.' },
  refunded: { title: 'Refunded ticket', detail: 'This ticket has been refunded. Do not admit.' },
  already_used: { title: 'Already checked in', detail: 'This ticket already has an active check-in. Do not admit again.' },
  wrong_event: { title: 'Ticket belongs to another event', detail: 'This ticket cannot be used at the selected event.' },
  rejected_campaign_qr: { title: 'Campaign QR — not an admission ticket', detail: 'This promotional QR cannot grant entry. Ask for the admission ticket QR.' },
};

export const admissionCopy = { title: 'Check-in confirmed', detail: 'The server confirmed entry for this ticket.' };
