import { Text } from 'react-native';
import { User } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { Screen, textStyles } from '../components/Screen';

export function AccessDeniedScreen({ user }: { user: User }) {
  const { session } = useAuth();
  return (
    <Screen>
      <Text accessibilityRole="header" style={textStyles.title}>Event Admin access required</Text>
      <Text style={textStyles.email}>{user.email}</Text>
      <Text style={textStyles.body}>
        Ask the event organizer to confirm your staff assignment. Your account email must also be verified.
      </Text>
      <Button label="Check access again" onPress={() => { void session.restore(); }} />
      <Button label="Sign out" secondary onPress={() => { void session.signOut(); }} />
    </Screen>
  );
}
