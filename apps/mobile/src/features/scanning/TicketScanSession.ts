import { ApiError, AuthExpiredError, errorMessage, SessionChangedError, UnexpectedResponseError } from '../../api/errors';
import { CheckIn, TicketCheckinApi, VerificationResult, VerifiedTicket } from '../../api/ticketCheckin';

export type ScanState =
  | { phase: 'scanning' | 'paused' | 'blocked' | 'uncertain' }
  | { phase: 'verifying'; reconciliation: boolean }
  | { phase: 'verified'; verification: VerificationResult; reconciliation: boolean; refused: boolean }
  | { phase: 'admitting'; ticket: VerifiedTicket }
  | { phase: 'admitted'; checkIn: CheckIn }
  | { phase: 'verificationError'; message: string; reconciliation: boolean; canReverify: boolean }
  | { phase: 'admissionError'; message: string };

// One ephemeral state machine per mounted scanner. No payloads or ticket data are persisted.
export class TicketScanSession {
  private state: ScanState = { phase: 'scanning' };
  private payload: string | null = null;
  private generation = 0;
  private active = true;
  private listeners = new Set<() => void>();

  constructor(
    private readonly eventId: string,
    private readonly api: TicketCheckinApi,
    private readonly onAdmitted: () => void,
    private readonly onAccessLost: () => void,
  ) {}

  getState = (): ScanState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(state: ScanState) {
    this.state = state; // Synchronous guard: native emissions/taps can arrive before React rerenders.
    this.listeners.forEach((listener) => listener());
  }
  private current(generation: number) { return this.active && generation === this.generation; }
  private accessError(error: unknown): boolean {
    if (error instanceof ApiError && [403, 404].includes(error.status)) {
      this.payload = null;
      this.publish({ phase: 'blocked' });
      this.onAccessLost();
      return true;
    }
    if (error instanceof AuthExpiredError || error instanceof SessionChangedError) {
      this.payload = null;
      this.publish({ phase: 'blocked' });
      return true;
    }
    return false;
  }

  scan = async (payload: string): Promise<void> => {
    if (!this.active || this.state.phase !== 'scanning') return;
    // Transport bounds mirror VerifyIn; this says nothing about the QR's validity or contents.
    if (!payload || Array.from(payload).length > 2000) {
      this.publish({ phase: 'verificationError', reconciliation: false, canReverify: false,
        message: 'This QR could not be submitted for verification. Ask for the admission ticket QR and scan again.' });
      return;
    }
    this.payload = payload;
    await this.verify(false);
  };

  private async verify(reconciliation: boolean): Promise<void> {
    if (this.payload === null) return;
    const generation = ++this.generation;
    const payload = this.payload;
    this.publish({ phase: 'verifying', reconciliation });
    try {
      const verification = await this.api.verify(this.eventId, payload);
      if (this.current(generation)) this.publish({ phase: 'verified', verification, reconciliation, refused: false });
    } catch (error) {
      if (this.current(generation) && !this.accessError(error)) {
        this.publish({ phase: 'verificationError', message: errorMessage(error), reconciliation, canReverify: true });
      }
    }
  }

  reverify = async (): Promise<void> => {
    if (!this.active || !['uncertain', 'admissionError', 'verificationError'].includes(this.state.phase)) return;
    const reconciliation = this.state.phase !== 'verificationError' || this.state.reconciliation;
    await this.verify(reconciliation);
  };

  admit = async (): Promise<void> => {
    if (!this.active || this.state.phase !== 'verified' || this.state.verification.result !== 'valid' ||
        !this.state.verification.ticket || this.payload === null) return;
    const ticket = this.state.verification.ticket;
    const generation = ++this.generation;
    const payload = this.payload;
    this.publish({ phase: 'admitting', ticket });
    let admitted: CheckIn;
    try {
      const result = await this.api.admit(this.eventId, payload);
      if (!this.current(generation)) return;
      if (result.kind === 'refused') {
        this.publish({ phase: 'verified', verification: result.verification, reconciliation: false, refused: true });
        return;
      }
      if (result.checkIn.ticketId !== ticket.id) throw new UnexpectedResponseError();
      admitted = result.checkIn;
    } catch (error) {
      if (!this.current(generation) || this.accessError(error)) return;
      if (error instanceof ApiError && error.status < 500 && error.status !== 408) {
        this.publish({ phase: 'admissionError', message: errorMessage(error) });
      } else {
        // Transport failures, 5xx, and malformed success/refusal bodies cannot prove no admission occurred.
        this.publish({ phase: 'uncertain' });
      }
      return;
    }
    this.payload = null;
    this.publish({ phase: 'admitted', checkIn: admitted });
    // Totals refresh has its own error state and cannot erase this confirmed result.
    this.onAdmitted();
  };

  next = (): void => {
    if (!this.active || ['verifying', 'admitting', 'blocked'].includes(this.state.phase)) return;
    this.generation++;
    this.payload = null;
    this.publish({ phase: 'scanning' });
  };

  suspend = (): void => {
    this.active = false;
    this.generation++;
    if (this.state.phase === 'admitting') this.publish({ phase: 'uncertain' });
    else if (this.state.phase === 'verifying' || this.state.phase === 'verified') {
      const reconciliation = this.state.reconciliation;
      this.publish({ phase: 'verificationError', reconciliation, canReverify: true,
        message: 'Scanning was interrupted. Verify this ticket again before checking in.' });
    } else if (this.state.phase === 'scanning') this.publish({ phase: 'paused' });
  };
  resume = (): void => {
    this.active = true;
    if (this.state.phase === 'paused') this.publish({ phase: 'scanning' });
  };
  dispose = (): void => {
    this.active = false;
    this.generation++;
    this.payload = null;
    this.state = { phase: 'paused' };
  };
}
