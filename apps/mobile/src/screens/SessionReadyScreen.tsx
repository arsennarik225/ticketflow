import { StyleSheet, Text, View } from 'react-native';
import { User } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { colors, Screen, textStyles } from '../components/Screen';

export function SessionReadyScreen({ user }: { user: User }) {
  const { session } = useAuth();
  return (
    <Screen>
      <View style={styles.badge}><Text style={styles.badgeText}>EVENT ADMIN ACCESS CONFIRMED</Text></View>
      <Text accessibilityRole="header" style={textStyles.title}>You're signed in</Text>
      <Text style={textStyles.body}>Your staff session is active.</Text>
      <Text style={textStyles.email}>{user.email}</Text>
      <Button label="Sign out" onPress={() => { void session.signOut(); }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  badge: { backgroundColor: '#E7F3EC', borderRadius: 8, padding: 10, marginBottom: 24, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: colors.success },
});
