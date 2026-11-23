import { useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { ActivityIndicator, BackHandler, Keyboard, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createAttendeeSearchApi, queryError } from '../../api/attendeeSearch';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../components/Button';
import { colors, Notice, textStyles } from '../../components/Screen';
import { resultCopy } from '../checkin/resultCopy';
import { AttendeeSearchSession } from './AttendeeSearchSession';
import { LanguageContext, useT } from '../../platform/i18n';

interface Props {
  eventId: string;
  timeZone: string;
  onReconcileTotals: () => void;
  onAccessLost: () => void;
  onBack: () => void;
}

export function AttendeeSearch({ eventId, timeZone, onReconcileTotals, onAccessLost, onBack }: Props) {
  const t = useT();
  const language = useContext(LanguageContext);
  const refusal = 'Check-in was refused. ';
  const detail = (value: string) => value.startsWith(refusal)
    ? `${t(refusal.trim())} ${t(value.slice(refusal.length))}` : t(value);
  const { session } = useAuth();
  const api = useMemo(() => createAttendeeSearchApi(session), [session]);
  const flow = useMemo(() => new AttendeeSearchSession(eventId, api, onReconcileTotals, onAccessLost),
    [eventId, api, onReconcileTotals, onAccessLost]);
  const state = useSyncExternalStore(flow.subscribe, flow.getState);
  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => { onBack(); return true; });
    return () => { flow.dispose(); back.remove(); };
  }, [flow, onBack]);
  const pending = state.mutation?.kind === 'pending';
  const confirming = state.mutation?.kind === 'confirm';
  const disabled = pending || confirming || !state.fresh || state.loading;
  const search = () => { Keyboard.dismiss(); void flow.search(); };
  // Put the confirmation next to the operated ticket even in a long list of matches.
  // Keep it visible above the list if reconciliation no longer returns that ticket.
  const mutationNotice = <>
    {state.mutation?.kind === 'outcome' && <View style={styles.outcome}>
      <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.title}>{t(state.mutation.title)}</Text>
      <Text style={styles.label}>{state.mutation.row.fullName} · {state.mutation.row.ticketNumber}</Text>
      <Text style={styles.help}>{detail(state.mutation.detail)}</Text>
    </View>}
    {state.mutation?.kind === 'pending' && <>
      <Text accessibilityLiveRegion="polite" style={styles.label}>
        {t(state.mutation.operation === 'admit' ? 'Submitting check-in… Wait for confirmation before admitting.' : 'Submitting reversal… Wait for server confirmation.')}
      </Text>
      <Text style={styles.help}>{t('Leaving this screen will not cancel a request already received by the server. Search again if you leave before confirmation.')}</Text>
    </>}
  </>;

  return <View style={styles.panel}>
    <Text accessibilityRole="header" style={textStyles.title}>{t('Search attendees / tickets')}</Text>
    <Text style={styles.help}>{t('Search this event by attendee name, email, or ticket number. Enter 2–100 characters.')}</Text>
    <Text style={styles.label}>{t('Name, email, or ticket number')}</Text>
    <TextInput accessibilityLabel={t('Name, email, or ticket number')} value={state.query} onChangeText={flow.setQuery}
      editable={!pending} autoCapitalize="none" autoCorrect={false} returnKeyType="search"
      onSubmitEditing={search} style={styles.input} placeholder={t('Enter search text')} />
    <Button label={t('Search')} loading={state.loading} disabled={pending || queryError(state.query) !== null} onPress={search} />
    {state.loading && <View style={styles.loading}>
      <ActivityIndicator color={colors.primary} />
      <Text accessibilityLiveRegion="polite" style={styles.help}>{t('Searching this event…')}</Text>
    </View>}
    {state.error && <Notice>{t(state.error)}</Notice>}
    {state.data && !state.fresh && !state.loading && !pending && <Notice>{t('Showing the last loaded matches. Refresh results before checking in or reversing a check-in.')}</Notice>}
    {!state.data?.data.some((row) => row.ticketId === state.mutation?.row.ticketId) && mutationNotice}
    {state.mutation?.kind === 'confirm' && <Modal transparent animationType="fade" onRequestClose={flow.cancelReversal}>
      <SafeAreaView style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.modalContent}>
          <View accessibilityViewIsModal style={styles.confirmation}>
            <Text accessibilityRole="header" style={styles.title}>{t('Reverse this check-in?')}</Text>
            <Text style={styles.label}>{state.mutation.row.fullName} · {state.mutation.row.ticketNumber}</Text>
            <Text style={styles.help}>{t('This reverses the recorded admission. Confirm only if this attendee’s check-in should be undone. The audit record is kept.')}</Text>
            <Button label={t('Cancel reversal')} secondary onPress={flow.cancelReversal} />
            <Button label={t('Confirm reversal')} destructive onPress={() => { void flow.confirmReversal(); }} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>}
    {state.data && <>
      <Text accessibilityLiveRegion="polite" style={styles.help}>
        {state.data.data.length === 0 ? t('No matching attendees or tickets.') : t('{count} search matches.', { count: state.data.data.length })}
        {' '}{t('Search returns up to 50 matches, not the full attendee list.')}{state.data.data.length === 50 ? ` ${t('Narrow your search to find more specific matches.')}` : ''}
      </Text>
      <Button label={t('Refresh results')} secondary loading={state.loading} disabled={pending} onPress={search} />
      {state.data.data.map((row) => <View key={row.ticketId} style={styles.row}>
        <Text style={styles.title}>{row.fullName}</Text>
        <Text style={styles.detail}>{row.email}</Text>
        <Text style={styles.detail}>{t('Ticket')}: {row.ticketNumber}</Text>
        <Text style={styles.detail}>{row.ticketTypeName}</Text>
        <Text style={styles.label}>{t('Status')}: {t(resultCopy[row.status === 'checked_in' ? 'already_used' : row.status].title)}</Text>
        {row.seatLabel && <Text style={styles.detail}>{t('Seat')}: {row.seatLabel}</Text>}
        {row.checkedInAt && <Text style={styles.detail}>{t('Checked in')}: {new Date(row.checkedInAt).toLocaleString(language, { timeZone })} ({timeZone})</Text>}
        {row.ticketId === state.mutation?.row.ticketId && mutationNotice}
        {row.status === 'valid' && !row.checkInId && <Button label={t('Check in {ticket}', { ticket: row.ticketNumber })} disabled={disabled}
          onPress={() => { void flow.admit(row); }} />}
        {row.checkInId && state.data?.canReverseCheckIn === true && <Button label={t('Undo check-in {ticket}', { ticket: row.ticketNumber })}
          secondary disabled={disabled} onPress={() => { Keyboard.dismiss(); flow.requestReversal(row); }} />}
      </View>)}
    </>}
  </View>;
}

const styles = StyleSheet.create({
  panel: { marginVertical: 20, gap: 12 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, minHeight: 52, fontSize: 17, color: colors.text },
  label: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.text },
  help: { fontSize: 15, lineHeight: 23, color: colors.muted },
  title: { fontSize: 21, fontWeight: '700', color: colors.text },
  detail: { fontSize: 16, lineHeight: 24, color: colors.text },
  row: { borderTopWidth: 1, borderColor: colors.border, paddingVertical: 20, gap: 8 },
  outcome: { gap: 10, paddingVertical: 12 },
  backdrop: { flex: 1, backgroundColor: '#17233ACC' },
  modalContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  confirmation: { backgroundColor: colors.surface, width: '100%', maxWidth: 600, alignSelf: 'center', borderWidth: 2,
    borderColor: colors.error, borderRadius: 12, padding: 16, gap: 12 },
  loading: { flexDirection: 'row', gap: 12, alignItems: 'center' },
});
