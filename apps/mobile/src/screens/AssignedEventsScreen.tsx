import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { AssignedEvent, AssignedEvents } from '../api/checkin';
import { ApiError, errorMessage } from '../api/errors';
import { Button } from '../components/Button';
import { colors, Notice, Screen, textStyles } from '../components/Screen';
import { EventDetails } from '../features/events/EventDetails';

interface Props {
  email: string;
  events: AssignedEvents | null;
  loading: boolean;
  error: unknown;
  message: string | null;
  onRefresh: () => void;
  onSelect: (event: AssignedEvent) => void;
  onSignOut: () => void;
}

export function AssignedEventsScreen({ email, events, loading, error, message, onRefresh, onSelect, onSignOut }: Props) {
  const forbidden = error instanceof ApiError && error.status === 403;
  const visibleEvents = forbidden ? null : events;
  return (
    <Screen topAligned refreshing={loading && events !== null} onRefresh={onRefresh}>
      <Text accessibilityRole="header" style={textStyles.title}>Assigned events</Text>
      <Text style={styles.email}>{email}</Text>
      <Text style={styles.help}>Choose the event you are working at.</Text>
      {message && <Notice>{message}</Notice>}
      {loading && !visibleEvents && <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
        <Text accessibilityLiveRegion="polite" style={styles.help}>Loading assigned events…</Text>
      </View>}
      {error != null && <>
        <Notice>{forbidden ? 'Assigned events are not accessible. Contact your event administrator or try again.' : errorMessage(error)}</Notice>
        {visibleEvents && <Text style={styles.help}>Showing the last loaded events. Pull down or retry to update.</Text>}
        <Button label="Try again" loading={loading} onPress={onRefresh} />
      </>}
      {visibleEvents?.data.length === 0 && <Text accessibilityLiveRegion="polite" style={textStyles.body}>
        No assigned events are currently available.
      </Text>}
      {visibleEvents?.data.map((event) => <Pressable key={event.id}
        accessibilityRole="button" accessibilityLabel={`Open ${event.title}`}
        accessibilityHint="View attendance for this event" onPress={() => onSelect(event)}
        style={({ pressed }) => [styles.event, pressed && styles.pressed]}>
        <EventDetails event={event} />
        <Text style={styles.open}>View attendance →</Text>
      </Pressable>)}
      <Button label="Refresh events" secondary loading={loading} onPress={onRefresh} />
      <Button label="Sign out" secondary onPress={onSignOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  email: { fontSize: 14, lineHeight: 20, color: colors.muted, marginBottom: 8 },
  help: { fontSize: 15, lineHeight: 22, color: colors.muted, marginBottom: 16 },
  loading: { gap: 12, paddingVertical: 20 },
  event: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, marginBottom: 12 },
  pressed: { backgroundColor: '#EDF1FD' },
  open: { color: colors.primary, fontSize: 15, fontWeight: '600', marginTop: 14 },
});
