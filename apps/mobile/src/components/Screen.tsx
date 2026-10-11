import { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const colors = {
  background: '#F4F6FA', surface: '#FFFFFF', text: '#17233A', muted: '#526078',
  primary: '#244FCC', border: '#B8C2D3', error: '#9F2229', success: '#206647',
};

interface ScreenProps {
  topAligned?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
}

export function Screen({ children, topAligned = false, refreshing = false, onRefresh }: PropsWithChildren<ScreenProps>) {
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={[styles.scroll, topAligned && styles.topAligned]}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
            tintColor={colors.primary} /> : undefined}>
          <View style={[styles.content, topAligned && styles.wide]}>
            <Text style={styles.brand}>BiletFlow</Text>
            <Text style={styles.eyebrow}>EVENT ADMIN</Text>
            <View style={[styles.card, topAligned && styles.operationalCard]}>{children}</View>
            <Text style={styles.footer}>Staff access · Online verification</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Notice({ children }: { children: string }) {
  return <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.notice}>{children}</Text>;
}

export const textStyles = StyleSheet.create({
  title: { fontSize: 27, fontWeight: '700', color: colors.text, marginBottom: 12 },
  body: { fontSize: 16, lineHeight: 24, color: colors.muted, marginBottom: 24 },
  email: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 24 },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  topAligned: { justifyContent: 'flex-start' },
  content: { width: '100%', maxWidth: 440, alignSelf: 'center' },
  wide: { maxWidth: 600 },
  brand: { fontSize: 32, fontWeight: '800', color: colors.text, letterSpacing: -1 },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '700', letterSpacing: 2, marginTop: 6, marginBottom: 28 },
  card: { backgroundColor: colors.surface, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#E2E7EF' },
  operationalCard: { padding: 16 },
  notice: { color: colors.error, fontSize: 15, lineHeight: 22, marginBottom: 18 },
  footer: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 24 },
});
