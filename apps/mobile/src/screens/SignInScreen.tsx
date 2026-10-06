import { useRef, useState } from 'react';
import { Keyboard, StyleSheet, Text, TextInput } from 'react-native';
import { errorMessage } from '../api/errors';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { colors, Notice, Screen, textStyles } from '../components/Screen';

export function SignInScreen() {
  const { session, state } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const passwordInput = useRef<TextInput>(null);
  const submittingRef = useRef(false);

  async function submit() {
    if (submittingRef.current) return;
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    submittingRef.current = true;
    setSubmitting(true);
    setError(undefined);
    Keyboard.dismiss();
    try { await session.signIn(email, password); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { submittingRef.current = false; setSubmitting(false); setPassword(''); }
  }

  const message = error ?? (state.status === 'signedOut' ? state.message : undefined);
  return (
    <Screen>
      <Text accessibilityRole="header" style={textStyles.title}>Staff sign in</Text>
      <Text style={textStyles.body}>Sign in with the account assigned to your event.</Text>
      <Text style={styles.label}>Email</Text>
      <TextInput
        accessibilityLabel="Email" style={styles.input} value={email} onChangeText={setEmail}
        autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email"
        textContentType="username" returnKeyType="next" editable={!submitting}
        onSubmitEditing={() => passwordInput.current?.focus()}
        placeholder="you@example.com" placeholderTextColor={colors.muted}
      />
      <Text style={styles.label}>Password</Text>
      <TextInput
        ref={passwordInput} accessibilityLabel="Password" style={styles.input} value={password}
        onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false}
        autoComplete="current-password" textContentType="password" returnKeyType="go"
        editable={!submitting} onSubmitEditing={() => { void submit(); }}
      />
      {message && <Notice>{message}</Notice>}
      <Button label={submitting ? 'Signing in…' : 'Sign in'} loading={submitting}
        disabled={!email.trim() || !password} onPress={() => { void submit(); }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.text, fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text, marginBottom: 20 },
});
