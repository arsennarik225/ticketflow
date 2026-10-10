import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from './Screen';

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  secondary?: boolean;
  destructive?: boolean;
}

export function Button({ label, onPress, disabled = false, loading = false, secondary = false, destructive = false }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [styles.button, secondary && styles.secondary, destructive && styles.destructive, (disabled || loading) && styles.disabled,
        pressed && styles.pressed]}
    >
      <View style={styles.row}>
        {loading && <ActivityIndicator color={secondary ? colors.primary : '#FFFFFF'} />}
        <Text style={[styles.label, secondary && styles.secondaryLabel]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 52, borderRadius: 12, backgroundColor: colors.primary, padding: 14, justifyContent: 'center', marginTop: 8 },
  secondary: { backgroundColor: '#EDF1FD' },
  destructive: { backgroundColor: colors.error },
  disabled: { opacity: 0.65 },
  pressed: { opacity: 0.8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  label: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  secondaryLabel: { color: colors.primary },
});
