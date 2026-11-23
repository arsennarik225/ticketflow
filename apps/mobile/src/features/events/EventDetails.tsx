import { useContext } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AssignedEvent } from '../../api/checkin';
import { colors } from '../../components/Screen';
import { Language, LanguageContext, useT } from '../../platform/i18n';

function eventTime(value: string, timeZone: string, language: Language): string {
  return new Intl.DateTimeFormat(language, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone,
  }).format(new Date(value));
}

export function EventDetails({ event, expanded = false }: { event: AssignedEvent; expanded?: boolean }) {
  const t = useT();
  const language = useContext(LanguageContext);
  const status = t(event.status);
  return (
    <View style={styles.details}>
      <Text accessibilityRole="header" style={[styles.title, expanded && styles.large]}>{event.title}</Text>
      <Text style={styles.status}>{status.charAt(0).toUpperCase() + status.slice(1)}</Text>
      <Text style={styles.detail}>{expanded ? `${t('Starts')}: ` : ''}{eventTime(event.startsAt, event.timeZone, language)}</Text>
      {expanded && <Text style={styles.detail}>{t('Ends')}: {eventTime(event.endsAt, event.timeZone, language)}</Text>}
      <Text style={styles.zone}>{event.timeZone}</Text>
      <Text style={styles.detail}>{event.venueName} · {event.city}</Text>
      {expanded && event.address && <Text style={styles.detail}>{event.address}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  details: { gap: 6 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text, flexShrink: 1 },
  large: { fontSize: 25 },
  status: { fontSize: 14, fontWeight: '600', color: colors.primary },
  detail: { fontSize: 16, lineHeight: 23, color: colors.text },
  zone: { fontSize: 13, lineHeight: 19, color: colors.muted },
});
