import { Attendee, AttendeeMatches, AttendeeSearchApi, queryError } from '../../api/attendeeSearch';
import { ApiError, AuthExpiredError, errorMessage, SessionChangedError, UnexpectedResponseError } from '../../api/errors';
import { admissionCopy, resultCopy } from '../checkin/resultCopy';

type Operation = 'admit' | 'reverse';
type Mutation =
  | { kind: 'confirm'; row: Attendee }
  | { kind: 'pending'; operation: Operation; row: Attendee }
  | { kind: 'outcome'; title: string; detail: string; row: Attendee };

export interface SearchState {
  query: string;
  data: AttendeeMatches | null;
  loading: boolean;
  fresh: boolean;
  error: string | null;
  mutation: Mutation | null;
}

const initialState = (): SearchState => ({ query: '', data: null, loading: false, fresh: false, error: null, mutation: null });

// Like TicketScanSession, this feature owns request generations and synchronous mutation guards.
// It lives only while search is open; no ticket cache is shared across events or scanner visits.
export class AttendeeSearchSession {
  private state = initialState();
  private generation = 0;
  private active = true;
  private listeners = new Set<() => void>();

  constructor(private readonly eventId: string, private readonly api: AttendeeSearchApi,
    private readonly onReconcileTotals: () => void, private readonly onAccessLost: () => void) {}

  getState = (): SearchState => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<SearchState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private get pending() { return this.state.mutation?.kind === 'pending'; }
  private current(generation: number) { return this.active && generation === this.generation; }

  setQuery = (query: string) => {
    if (!this.active || this.pending || query === this.state.query) return;
    ++this.generation;
    this.publish({ ...initialState(), query });
  };

  search = async (): Promise<void> => {
    if (!this.active || this.pending) return;
    const query = this.state.query.trim();
    const validation = queryError(query);
    const generation = ++this.generation;
    if (validation) {
      this.publish({ query, data: null, loading: false, fresh: false, error: validation, mutation: null });
      return;
    }
    this.publish({ query, loading: true, fresh: false, error: null,
      mutation: this.state.mutation?.kind === 'outcome' ? this.state.mutation : null });
    try {
      const data = await this.api.search(this.eventId, query);
      if (this.current(generation)) this.publish({ data, loading: false, fresh: true });
    } catch (error) {
      if (!this.current(generation) || this.handleAccess(error, true)) return;
      this.publish({ loading: false, fresh: false, error: errorMessage(error) });
    }
  };

  private usable(row: Attendee): boolean {
    return this.active && this.state.fresh && !this.state.loading && !this.pending &&
      this.state.data?.data.find((item) => item.ticketId === row.ticketId) === row;
  }

  admit = async (row: Attendee): Promise<void> => {
    if (!this.usable(row) || this.state.mutation?.kind === 'confirm' || row.status !== 'valid' || row.checkInId) return;
    await this.mutate('admit', row);
  };

  requestReversal = (row: Attendee) => {
    if (!this.usable(row) || !row.checkInId || this.state.data?.canReverseCheckIn !== true) return;
    this.publish({ mutation: { kind: 'confirm', row } });
  };
  cancelReversal = () => {
    if (this.active && this.state.mutation?.kind === 'confirm') this.publish({ mutation: null });
  };
  confirmReversal = async (): Promise<void> => {
    const mutation = this.state.mutation;
    if (mutation?.kind !== 'confirm' || !this.usable(mutation.row) ||
        !mutation.row.checkInId || this.state.data?.canReverseCheckIn !== true) return;
    await this.mutate('reverse', mutation.row);
  };

  private handleAccess(error: unknown, search: boolean): boolean {
    if (error instanceof AuthExpiredError || error instanceof SessionChangedError) {
      this.dispose();
      return true;
    }
    if (error instanceof ApiError && (error.status === 403 && error.code !== 'cannot_reverse_check_in' ||
        search && error.status === 404)) {
      this.dispose();
      this.onAccessLost();
      return true;
    }
    return false;
  }

  private async mutate(operation: Operation, row: Attendee): Promise<void> {
    const generation = ++this.generation;
    this.publish({ fresh: false, mutation: { kind: 'pending', operation, row }, error: null });
    let title: string;
    let detail: string;
    try {
      if (operation === 'admit') {
        const result = await this.api.admit(this.eventId, row.ticketId);
        if (!this.current(generation)) return;
        if (result.kind === 'admitted') {
          if (result.checkIn.ticketId !== row.ticketId) throw new UnexpectedResponseError();
          ({ title, detail } = admissionCopy);
        } else {
          ({ title, detail } = resultCopy[result.verification.result]);
          detail = `Check-in was refused. ${detail}`;
        }
      } else {
        await this.api.reverse(row.checkInId!);
        if (!this.current(generation)) return;
        title = 'Reversal confirmed';
        detail = 'The server confirms this check-in is reversed. Current ticket eligibility is shown only after search refreshes.';
      }
    } catch (error) {
      if (!this.current(generation) || this.handleAccess(error, false)) return;
      if (error instanceof ApiError && error.status === 403 && error.code === 'cannot_reverse_check_in') {
        title = 'Reversal not permitted';
        detail = 'Your permission to reverse check-ins has changed. The server refused this reversal.';
        if (this.state.data) this.publish({ data: { ...this.state.data, canReverseCheckIn: false } });
      } else if (error instanceof ApiError && error.status === 404) {
        title = 'Ticket or check-in unavailable';
        detail = 'The server could not find this record. Refreshing current search results.';
      } else if (error instanceof ApiError && error.status < 500 && error.status !== 408) {
        title = operation === 'admit' ? 'Check-in was not accepted' : 'Reversal was not accepted';
        detail = errorMessage(error);
      } else {
        title = operation === 'admit' ? 'Check-in outcome unknown' : 'Reversal outcome unknown';
        detail = 'The request may have completed, but confirmation was not received. Refresh current ticket status before another action. A refreshed status cannot identify which device completed the earlier request.';
      }
    }
    if (!this.current(generation)) return;
    this.publish({ mutation: { kind: 'outcome', title, detail, row } });
    // Never repeat a mutation automatically or optimistically change a row/count/active ID.
    // Read failures retain the confirmed outcome and old rows, with further actions disabled.
    this.onReconcileTotals();
    await this.search();
  }

  dispose = () => {
    this.active = false;
    ++this.generation;
    this.publish(initialState());
  };
}
