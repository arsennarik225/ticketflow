import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { AssignedEvent, AssignedEvents } from '../api/checkin';
import { ApiError, errorMessage } from '../api/errors';
import { Button } from '../components/Button';
import { colors, Notice, Screen, textStyles } from '../components/Screen';
import { EventDetails } from '../features/events/EventDetails';
import { useT } from '../platform/i18n';

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
  const t = useT();
  const forbidden = error instanceof ApiError && error.status === 403;
  const visibleEvents = forbidden ? null : events;
  return (
    <Screen topAligned refreshing={loading && events !== null} onRefresh={onRefresh}>
      <Text accessibilityRole="header" style={textStyles.title}>{t('Assigned events')}</Text>
      <Text style={styles.email}>{email}</Text>
      <Text style={styles.help}>{t('Choose the event you are working at.')}</Text>
      {message && <Notice>{t(message)}</Notice>}
      {loading && !visibleEvents && <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
        <Text accessibilityLiveRegion="polite" style={styles.help}>{t('Loading assigned events…')}</Text>
      </View>}
      {error != null && <>
        <Notice>{t(forbidden ? 'Assigned events are not accessible. Contact your event administrator or try again.' : errorMessage(error))}</Notice>
        {visibleEvents && <Text style={styles.help}>{t('Showing the last loaded events. Pull down or retry to update.')}</Text>}
        <Button label={t('Try again')} loading={loading} onPress={onRefresh} />
      </>}
      {visibleEvents?.data.length === 0 && <Text accessibilityLiveRegion="polite" style={textStyles.body}>{t('No assigned events are currently available.')}</Text>}
      {visibleEvents?.data.map((event) => <Pressable key={event.id}
        accessibilityRole="button" accessibilityLabel={t('Open {title}', { title: event.title })}
        accessibilityHint={t('View attendance for this event')} onPress={() => onSelect(event)}
        style={({ pressed }) => [styles.event, pressed && styles.pressed]}>
        <EventDetails event={event} />
        <Text style={styles.open}>{t('View attendance →')}</Text>
      </Pressable>)}
      <Button label={t('Refresh events')} secondary loading={loading} onPress={onRefresh} />
      <Button label={t('Sign out')} secondary onPress={onSignOut} />
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
