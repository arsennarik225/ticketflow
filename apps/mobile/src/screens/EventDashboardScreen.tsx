import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { AssignedEvent, AttendanceTotals } from '../api/checkin';
import { ApiError, errorMessage } from '../api/errors';
import { Button } from '../components/Button';
import { colors, Notice, Screen, textStyles } from '../components/Screen';
import { EventDetails } from '../features/events/EventDetails';
import { useRemoteResource } from '../features/events/useRemoteResource';

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
  // Future check-in mutations can call attendance.refresh(); the capability never authorizes a mutation.
  const attendance = useRemoteResource(loadAttendance);
  const accessLost = attendance.error instanceof ApiError && [403, 404].includes(attendance.error.status);
  useEffect(() => { if (accessLost) onAccessLost(); }, [accessLost, onAccessLost]);

  const refresh = () => {
    void attendance.refresh();
    onRefreshAssignments();
  };
  const totals = accessLost ? null : attendance.data;
  const percentage = totals && totals.registered > 0 ? Math.round(totals.checkedIn / totals.registered * 100) : 0;
  return (
    <Screen topAligned refreshing={attendance.loading && totals !== null} onRefresh={refresh}>
      <Button label="Back to events" secondary onPress={onBack} />
      <View style={styles.context}><EventDetails event={event} expanded /></View>
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
      <Button label="Sign out" secondary onPress={onSignOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  context: { marginTop: 24, marginBottom: 28 },
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
