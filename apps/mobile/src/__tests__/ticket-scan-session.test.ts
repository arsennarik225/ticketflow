import { ApiError, AuthExpiredError, NetworkError, SessionChangedError, UnexpectedResponseError } from '../api/errors';
import { AdmissionResult, TicketCheckinApi, VerificationResult } from '../api/ticketCheckin';
import { TicketScanSession } from '../features/scanning/TicketScanSession';
import { deferred } from './helpers';
import { confirmedCheckIn, scannedTicket, scanEvent, validVerification } from './scanFixtures';

function setup() {
  const api: jest.Mocked<TicketCheckinApi> = {
    verify: jest.fn<Promise<VerificationResult>, [string, string]>().mockResolvedValue(validVerification),
    admit: jest.fn<Promise<AdmissionResult>, [string, string]>().mockResolvedValue({ kind: 'admitted', checkIn: confirmedCheckIn }),
  };
  const onAdmitted = jest.fn();
  const onAccessLost = jest.fn();
  const flow = new TicketScanSession(scanEvent.id, api, onAdmitted, onAccessLost);
  return { flow, api, onAdmitted, onAccessLost };
}

test('duplicate camera emissions lock synchronously until explicit Scan next ticket', async () => {
  const h = setup();
  const pending = deferred<VerificationResult>();
  h.api.verify.mockReturnValueOnce(pending.promise);
  const first = h.flow.scan('opaque-one');
  await h.flow.scan('opaque-two');
  await h.flow.admit();
  h.flow.next();
  expect(h.api.verify).toHaveBeenCalledTimes(1);
  expect(h.api.admit).not.toHaveBeenCalled();
  pending.resolve(validVerification);
  await first;
  await h.flow.scan('opaque-three');
  expect(h.api.verify).toHaveBeenCalledTimes(1);
  h.flow.next();
  await h.flow.scan('opaque-four');
  expect(h.api.verify).toHaveBeenLastCalledWith(scanEvent.id, 'opaque-four');
});

test('verification and admission are separate; repeated check-in taps cannot overlap or repeat a success', async () => {
  const h = setup();
  await h.flow.scan('opaque-qr');
  expect(h.api.admit).not.toHaveBeenCalled();
  expect(h.onAdmitted).not.toHaveBeenCalled();
  const pending = deferred<AdmissionResult>();
  h.api.admit.mockReturnValueOnce(pending.promise);
  const first = h.flow.admit();
  await h.flow.admit();
  await h.flow.scan('duplicate');
  h.flow.next();
  expect(h.api.admit).toHaveBeenCalledTimes(1);
  expect(h.api.admit).toHaveBeenCalledWith(scanEvent.id, 'opaque-qr');
  pending.resolve({ kind: 'admitted', checkIn: confirmedCheckIn });
  await first;
  await h.flow.admit();
  expect(h.flow.getState()).toEqual({ phase: 'admitted', checkIn: confirmedCheckIn });
  expect(h.onAdmitted).toHaveBeenCalledTimes(1);
  expect(h.api.admit).toHaveBeenCalledTimes(1);
});

test.each(['invalid', 'cancelled', 'refunded', 'already_used', 'wrong_event', 'rejected_campaign_qr'] as const)(
  'a rejected %s verification never permits admission', async (result) => {
    const h = setup();
    h.api.verify.mockResolvedValueOnce({ result });
    await h.flow.scan('opaque-qr');
    await h.flow.admit();
    expect(h.api.admit).not.toHaveBeenCalled();
    expect(h.flow.getState()).toMatchObject({ phase: 'verified', verification: { result } });
  },
);

test('a concurrent check-in refusal replaces the valid snapshot and never refreshes totals as success', async () => {
  const h = setup();
  await h.flow.scan('opaque-qr');
  h.api.admit.mockResolvedValueOnce({ kind: 'refused', verification: { result: 'already_used', ticket: scannedTicket } });
  await h.flow.admit();
  expect(h.flow.getState()).toMatchObject({ phase: 'verified', refused: true, verification: { result: 'already_used' } });
  expect(h.onAdmitted).not.toHaveBeenCalled();
  await h.flow.admit();
  expect(h.api.admit).toHaveBeenCalledTimes(1);
});

test.each([new NetworkError(), new UnexpectedResponseError(), new ApiError(503, undefined, {}), new ApiError(408, undefined, {})])(
  'uncertain admission requires re-verification, not automatic mutation retry (%s)', async (error) => {
    const h = setup();
    await h.flow.scan('opaque-qr');
    h.api.admit.mockRejectedValueOnce(error);
    await h.flow.admit();
    expect(h.flow.getState()).toEqual({ phase: 'uncertain' });
    expect(h.onAdmitted).not.toHaveBeenCalled();
    await h.flow.admit();
    expect(h.api.admit).toHaveBeenCalledTimes(1);
    h.api.verify.mockResolvedValueOnce({ result: 'already_used', ticket: scannedTicket });
    await h.flow.reverify();
    expect(h.flow.getState()).toMatchObject({ phase: 'verified', reconciliation: true, verification: { result: 'already_used' } });
    expect(h.api.verify).toHaveBeenLastCalledWith(scanEvent.id, 'opaque-qr');
    expect(h.api.admit).toHaveBeenCalledTimes(1);
  },
);

test('after uncertain admission, a valid re-verification still needs a new deliberate check-in action', async () => {
  const h = setup();
  await h.flow.scan('opaque-qr');
  h.api.admit.mockRejectedValueOnce(new NetworkError());
  await h.flow.admit();
  await h.flow.reverify();
  expect(h.api.admit).toHaveBeenCalledTimes(1);
  await h.flow.admit();
  expect(h.api.admit).toHaveBeenCalledTimes(2);
  expect(h.flow.getState().phase).toBe('admitted');
});

test('verification failures remain retryable and do not send admission', async () => {
  const h = setup();
  h.api.verify.mockRejectedValueOnce(new NetworkError());
  await h.flow.scan('opaque-qr');
  expect(h.flow.getState()).toMatchObject({ phase: 'verificationError', canReverify: true });
  await h.flow.reverify();
  expect(h.flow.getState().phase).toBe('verified');
  expect(h.api.admit).not.toHaveBeenCalled();
});

test.each(['', 'x'.repeat(2001)])('out-of-contract QR input does not issue a request or a futile retry', async (payload) => {
  const h = setup();
  await h.flow.scan(payload);
  await h.flow.reverify();
  expect(h.api.verify).not.toHaveBeenCalled();
  expect(h.flow.getState()).toMatchObject({ phase: 'verificationError', canReverify: false });
});

test.each([403, 404])('verification access loss %s invokes the existing selected-event exit', async (status) => {
  const h = setup();
  h.api.verify.mockRejectedValueOnce(new ApiError(status, 'access_lost', {}));
  await h.flow.scan('opaque-qr');
  expect(h.onAccessLost).toHaveBeenCalledTimes(1);
  expect(h.flow.getState().phase).toBe('blocked');
});

test.each([new AuthExpiredError(), new SessionChangedError()])('auth change blocks further scanner actions (%s)', async (error) => {
  const h = setup();
  await h.flow.scan('opaque-qr');
  h.api.admit.mockRejectedValueOnce(error);
  await h.flow.admit();
  h.flow.next();
  expect(h.flow.getState().phase).toBe('blocked');
  expect(h.onAdmitted).not.toHaveBeenCalled();
});

test.each(['verify', 'admit'] as const)('leaving a scanner discards a late %s response and its callbacks', async (operation) => {
  const h = setup();
  const pendingVerify = deferred<VerificationResult>();
  const pendingAdmit = deferred<AdmissionResult>();
  if (operation === 'admit') await h.flow.scan('opaque-qr');
  h.api.verify.mockReturnValueOnce(pendingVerify.promise);
  h.api.admit.mockReturnValueOnce(pendingAdmit.promise);
  const request = operation === 'verify' ? h.flow.scan('opaque-qr') : h.flow.admit();
  h.flow.dispose();
  const afterLeaving = h.flow.getState();
  pendingVerify.resolve(validVerification);
  pendingAdmit.resolve({ kind: 'admitted', checkIn: confirmedCheckIn });
  await request;
  expect(h.flow.getState()).toBe(afterLeaving);
  expect(h.onAdmitted).not.toHaveBeenCalled();
  expect(h.onAccessLost).not.toHaveBeenCalled();
});

test('backgrounding during admission makes its outcome uncertain and ignores a late success', async () => {
  const h = setup();
  await h.flow.scan('opaque-qr');
  const pending = deferred<AdmissionResult>();
  h.api.admit.mockReturnValueOnce(pending.promise);
  const request = h.flow.admit();
  h.flow.suspend();
  pending.resolve({ kind: 'admitted', checkIn: confirmedCheckIn });
  await request;
  h.flow.resume();
  expect(h.flow.getState().phase).toBe('uncertain');
  expect(h.onAdmitted).not.toHaveBeenCalled();
});

test('a mismatched ticket in a success response cannot confirm entry for the scanned ticket', async () => {
  const h = setup();
  await h.flow.scan('opaque-qr');
  h.api.admit.mockResolvedValueOnce({ kind: 'admitted', checkIn: { ...confirmedCheckIn, ticketId: 'other-ticket' } });
  await h.flow.admit();
  expect(h.flow.getState().phase).toBe('uncertain');
  expect(h.onAdmitted).not.toHaveBeenCalled();
});
