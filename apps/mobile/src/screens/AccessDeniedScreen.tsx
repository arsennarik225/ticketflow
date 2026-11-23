import { Text } from 'react-native';
import { User } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { Screen, textStyles } from '../components/Screen';
import { useT } from '../platform/i18n';

export function AccessDeniedScreen({ user }: { user: User }) {
  const t = useT();
  const { session } = useAuth();
  return (
    <Screen>
      <Text accessibilityRole="header" style={textStyles.title}>{t('Event Admin access required')}</Text>
      <Text style={textStyles.email}>{user.email}</Text>
      <Text style={textStyles.body}>{t('Ask the event organizer to confirm your staff assignment. Your account email must also be verified.')}</Text>
      <Button label={t('Check access again')} onPress={() => { void session.restore(); }} />
      <Button label={t('Sign out')} secondary onPress={() => { void session.signOut(); }} />
    </Screen>
  );
}
