import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { AssignedEvent, AttendanceTotals } from '../api/checkin';
import { ApiError, errorMessage } from '../api/errors';
import { Button } from '../components/Button';
import { colors, Notice, Screen, textStyles } from '../components/Screen';
import { EventDetails } from '../features/events/EventDetails';
import { useRemoteResource } from '../features/events/useRemoteResource';
import { TicketScanner } from '../features/scanning/TicketScanner';
import { AttendeeSearch } from '../features/search/AttendeeSearch';

interface Props {
  event: AssignedEvent;
  loadAttendance: () => Promise<AttendanceTotals>;
  assignmentError: unknown;
  onRefreshAssignments: () => void;
  onAccessLost: () => void;
  onBack: () => void;
  onSignOut: () => void;
}

export function EventDashboardScreen({ event, loadAttendance, assignmentError, onRefreshAssignments,
  onAccessLost, onBack, onSignOut }: Props) {
  // This keyed screen owns the selected event's totals and canReverseCheckIn capability together.
  // The capability never authorizes a mutation.
  const attendance = useRemoteResource(loadAttendance);
  const [mode, setMode] = useState<'dashboard' | 'scan' | 'search'>('dashboard');
  const operating = mode !== 'dashboard';
  const closeTool = useCallback(() => { setMode('dashboard'); }, []);
  const refreshAttendance = attendance.refresh;
  const admissionConfirmed = useCallback(() => { void refreshAttendance(); }, [refreshAttendance]);
  const accessLost = attendance.error instanceof ApiError && [403, 404].includes(attendance.error.status);
  useEffect(() => { if (accessLost) onAccessLost(); }, [accessLost, onAccessLost]);

  const refresh = () => {
    void attendance.refresh();
    onRefreshAssignments();
  };
  const totals = accessLost ? null : attendance.data;
  const percentage = totals && totals.registered > 0 ? Math.round(totals.checkedIn / totals.registered * 100) : 0;
  return (
    <Screen topAligned refreshing={attendance.loading && totals !== null} onRefresh={operating ? undefined : refresh}>
      <Button label={operating ? 'Back to event' : 'Back to events'} secondary onPress={operating ? closeTool : onBack} />
      <View style={[styles.context, operating && styles.scannerContext]}>
        {operating ? <>
          <Text accessibilityRole="header" style={styles.eventTitle}>{event.title}</Text>
          <Text style={styles.help}>{event.venueName} · {event.city}</Text>
        </> : <EventDetails event={event} expanded />}
      </View>
      {mode === 'scan' && !accessLost && <TicketScanner eventId={event.id} onAdmitted={admissionConfirmed}
        onAccessLost={onAccessLost} onBack={closeTool} />}
      {mode === 'search' && !accessLost && <AttendeeSearch eventId={event.id} timeZone={event.timeZone}
        onReconcileTotals={admissionConfirmed} onAccessLost={onAccessLost} onBack={closeTool} />}
      <Text accessibilityRole="header" style={textStyles.title}>Attendance</Text>
      {assignmentError != null && <Notice>{`Event assignment could not be refreshed. ${errorMessage(assignmentError)}`}</Notice>}
      {(attendance.loading && !totals || accessLost) && <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
        <Text accessibilityLiveRegion="polite" style={textStyles.body}>Loading attendance…</Text>
      </View>}
      {attendance.error != null && !accessLost && <>
        <Notice>{errorMessage(attendance.error)}</Notice>
        <Button label="Try again" loading={attendance.loading} onPress={refresh} />
      </>}
      {totals && <>
        <View style={styles.metrics}>
          <View style={styles.metric}>
            <Text style={styles.label}>Registered</Text>
            <Text style={styles.number}>{totals.registered}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.label}>Checked in</Text>
            <Text style={styles.number}>{totals.checkedIn}</Text>
          </View>
        </View>
        <View accessibilityRole="progressbar" accessibilityLabel="Attendance progress"
          accessibilityValue={{ min: 0, max: 100, now: percentage, text: `${percentage}% checked in` }}>
          <Text style={styles.progressLabel}>{percentage}% checked in</Text>
          <View style={styles.track}><View style={[styles.progress, { width: `${percentage}%` }]} /></View>
        </View>
        {totals.registered === 0 && <Text style={styles.help}>No registrations yet.</Text>}
        {attendance.error != null && <Text style={styles.help}>Showing the last loaded totals. Refresh to get current attendance.</Text>}
        {attendance.loading && <Text accessibilityLiveRegion="polite" style={styles.help}>Updating attendance…</Text>}
      </>}
      <Button label="Refresh totals" loading={attendance.loading} onPress={refresh} />
      {!operating && !accessLost && <><Button label="Scan ticket QR" onPress={() => {
        setMode('scan');
        onRefreshAssignments();
      }} />
      <Button label="Search attendee / ticket" secondary onPress={() => {
        setMode('search');
        onRefreshAssignments();
      }} /></>}
      <Button label="Sign out" secondary onPress={onSignOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  context: { marginTop: 24, marginBottom: 28 },
  scannerContext: { marginTop: 20, marginBottom: 0 },
  eventTitle: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 8 },
  loading: { gap: 12, paddingTop: 16 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 20 },
  metric: { flexGrow: 1, flexBasis: 110 },
  label: { fontSize: 16, lineHeight: 24, color: colors.muted },
  number: { fontSize: 34, fontWeight: '700', color: colors.text, flexShrink: 1 },
  progressLabel: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 10 },
  track: { height: 8, backgroundColor: '#E2E7EF', borderRadius: 4, overflow: 'hidden', marginBottom: 16 },
  progress: { height: 8, backgroundColor: colors.primary },
  help: { fontSize: 15, lineHeight: 22, color: colors.muted, marginBottom: 12 },
});
