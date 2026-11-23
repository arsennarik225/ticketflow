import { ActivityIndicator, Text } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { colors, Notice, Screen, textStyles } from '../components/Screen';
import { AccessDeniedScreen } from '../screens/AccessDeniedScreen';
import { EventWorkflow } from '../features/events/EventWorkflow';
import { SignInScreen } from '../screens/SignInScreen';
import { useT } from '../platform/i18n';

// One screen per session state: protected screens unmount on sign-out, with no back stack to reopen.
export function ScannerNavigator() {
  const t = useT();
  const { session, state } = useAuth();
  switch (state.status) {
    case 'signedOut': return <SignInScreen key="signedOut" />;
    case 'denied': return <AccessDeniedScreen key={`denied-${state.user.id}`} user={state.user} />;
    case 'authorized': return <EventWorkflow key={`authorized-${state.user.id}`} user={state.user} />;
    case 'unavailable': return (
      <Screen>
        <Text accessibilityRole="header" style={textStyles.title}>
          {t(state.action === 'clear' ? 'Finish signing out' : 'Unable to restore your session')}
        </Text>
        <Notice>{t(state.message)}</Notice>
        {state.action === 'restore' && <Button label={t('Try again')} onPress={() => { void session.restore(); }} />}
        <Button label={t(state.action === 'clear' ? 'Retry sign out' : 'Sign out')} secondary
          onPress={() => { void session.signOut(); }} />
      </Screen>
    );
    default: return (
      <Screen>
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={textStyles.title}>
          {t(state.status === 'restoring' ? 'Restoring your session…' : 'Signing out…')}
        </Text>
        <ActivityIndicator size="large" color={colors.primary} accessibilityLabel={t('Please wait')} />
      </Screen>
    );
  }
}
