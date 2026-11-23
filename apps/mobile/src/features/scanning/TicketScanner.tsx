import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, AppState, BackHandler, StyleSheet, Text, View } from 'react-native';
import { createTicketCheckinApi, VerifiedTicket } from '../../api/ticketCheckin';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../components/Button';
import { colors, Notice, textStyles } from '../../components/Screen';
import { QrCamera } from './QrCamera';
import { TicketScanSession } from './TicketScanSession';
import { admissionCopy, resultCopy } from '../checkin/resultCopy';
import { useT } from '../../platform/i18n';

function TicketDetails({ ticket }: { ticket: VerifiedTicket }) {
  const t = useT();
  return <View style={styles.details}>
    <Text style={styles.identity}>{ticket.attendee.fullName}</Text>
    <Text style={styles.detail}>{t('Ticket')}: {ticket.ticketNumber}</Text>
    <Text style={styles.detail}>{ticket.ticketTypeName}</Text>
    {ticket.seat && <Text style={styles.detail}>
      {t('Seat: {section}, row {row}, number {number}', {
        section: ticket.seat.section, row: ticket.seat.row, number: ticket.seat.number,
      })}{ticket.seat.accessible ? ` · ${t('Accessible')}` : ''}
    </Text>}
  </View>;
}

interface Props {
  eventId: string;
  onAdmitted: () => void;
  onAccessLost: () => void;
  onBack: () => void;
}

export function TicketScanner({ eventId, onAdmitted, onAccessLost, onBack }: Props) {
  const t = useT();
  const { session } = useAuth();
  const api = useMemo(() => createTicketCheckinApi(session), [session]);
  const flow = useMemo(() => new TicketScanSession(eventId, api, onAdmitted, onAccessLost),
    [eventId, api, onAdmitted, onAccessLost]);
  const state = useSyncExternalStore(flow.subscribe, flow.getState);
  const [active, setActive] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  useEffect(() => {
    if (AppState.currentState === 'background' || AppState.currentState === 'inactive') flow.suspend();
    else flow.resume();
    const appState = AppState.addEventListener('change', (next) => {
      setActive(next === 'active');
      if (next === 'active') flow.resume(); else flow.suspend();
    });
    const back = BackHandler.addEventListener('hardwareBackPress', () => { onBack(); return true; });
    return () => { flow.dispose(); appState.remove(); back.remove(); };
  }, [flow, onBack]);

  const canNext = !['scanning', 'paused', 'verifying', 'admitting', 'blocked'].includes(state.phase);
  return <View style={styles.panel}>
    <Text accessibilityRole="header" style={textStyles.title}>{t('Ticket scanner')}</Text>
    {!active && <Notice>{t('Scanner paused while the app is inactive.')}</Notice>}
    {active && state.phase === 'scanning' && <QrCamera onScan={(payload) => { void flow.scan(payload); }} />}
    {state.phase === 'verifying' && <>
      <ActivityIndicator color={colors.primary} />
      <Text accessibilityLiveRegion="polite" style={textStyles.body}>
        {t(state.reconciliation ? 'Checking current ticket status…' : 'Verifying ticket…')}
      </Text>
    </>}
    {state.phase === 'verified' && <>
      <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.result}>{t(resultCopy[state.verification.result].title)}</Text>
      <Text style={textStyles.body}>{t(resultCopy[state.verification.result].detail)}</Text>
      {state.refused && <Notice>{t('Check-in was refused. The latest server result is shown above.')}</Notice>}
      {state.reconciliation && <Text style={textStyles.body}>
        {t(state.verification.result === 'already_used'
          ? 'The server now confirms an active check-in. It cannot identify which device completed the earlier request.'
          : 'This is the current server status. The earlier request outcome was not confirmed.')}
      </Text>}
      {state.verification.ticket && <TicketDetails ticket={state.verification.ticket} />}
      {state.verification.result === 'valid' && <Button label={t('Check in')} disabled={!active} onPress={() => { void flow.admit(); }} />}
    </>}
    {state.phase === 'admitting' && <>
      <TicketDetails ticket={state.ticket} />
      <Text accessibilityLiveRegion="polite" style={textStyles.body}>{t('Submitting check-in… Wait for confirmation before admitting.')}</Text>
      <Button label={t('Checking in…')} loading onPress={() => { void flow.admit(); }} />
    </>}
    {state.phase === 'admitted' && <>
      <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.result}>{t(admissionCopy.title)}</Text>
      <Text style={textStyles.body}>{t(admissionCopy.detail)}</Text>
      <Text style={textStyles.body}>{t('To scan another ticket or check this ticket again, tap Scan next ticket.')}</Text>
      <Text style={styles.identity}>{state.checkIn.attendeeName}</Text>
      <Text style={styles.detail}>{t('Ticket')}: {state.checkIn.ticketNumber}</Text>
    </>}
    {state.phase === 'uncertain' && <>
      <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.result}>{t('Check-in outcome unknown')}</Text>
      <Notice>{t('The request may have completed, but confirmation was not received. Do not assume entry succeeded or failed. Verify this ticket again before taking another action.')}</Notice>
      <Button label={t('Reverify ticket')} disabled={!active} onPress={() => { void flow.reverify(); }} />
    </>}
    {(state.phase === 'verificationError' || state.phase === 'admissionError') && <>
      <Text accessibilityRole="header" style={styles.result}>
        {t(state.phase === 'verificationError' ? 'Unable to verify ticket' : 'Check-in was not accepted')}
      </Text>
      <Notice>{t(state.message)}</Notice>
      {state.phase === 'verificationError' && state.reconciliation && <Notice>{t('The earlier check-in outcome is still unknown.')}</Notice>}
      {(state.phase === 'admissionError' || state.canReverify) &&
        <Button label={t('Reverify ticket')} disabled={!active} onPress={() => { void flow.reverify(); }} />}
    </>}
    {state.phase === 'blocked' && <Text style={textStyles.body}>{t('Access changed. Returning to your authorized screens…')}</Text>}
    {canNext && <Button label={t('Scan next ticket')} secondary disabled={!active} onPress={flow.next} />}
    {state.phase === 'admitting' && <Text style={styles.caution}>{t('Leaving this screen will not cancel a request already received by the server. Reverify the ticket if you leave before confirmation.')}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  panel: { marginVertical: 20 },
  result: { fontSize: 23, fontWeight: '700', color: colors.text, marginBottom: 12 },
  details: { gap: 6, marginBottom: 16 },
  identity: { fontSize: 20, fontWeight: '600', color: colors.text, marginBottom: 8 },
  detail: { fontSize: 16, lineHeight: 24, color: colors.text },
  caution: { fontSize: 14, lineHeight: 21, color: colors.muted, marginTop: 16 },
});
