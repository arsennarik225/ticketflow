import {
  Children,
  createContext,
  Fragment,
  isValidElement,
  ReactNode,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import { colors } from '../components/Screen';
import { FormValue, FormValues } from './forms';
import { useT } from './i18n';
import { openExternal } from './navigation';

type NativeProps = {
  children?: ReactNode;
  variant?: string;
  style?: Record<string, string | number>;
  role?: string;
  'aria-label'?: string;
  'aria-live'?: string;
  'aria-hidden'?: string;
};

function content(children: ReactNode): ReactNode {
  const result: ReactNode[] = [];
  let text = '';
  const flush = () => {
    if (text)
      result.push(
        <Text key={`text-${result.length}`} style={styles.text}>
          {text}
        </Text>,
      );
    text = '';
  };
  const append = (nodes: ReactNode) =>
    Children.forEach(nodes, (child) => {
      if (typeof child === 'string' || typeof child === 'number') text += child;
      else if (isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment)
        append(child.props.children);
      else if (child != null) {
        flush();
        result.push(child);
      }
    });
  append(children);
  flush();
  return result;
}
export function Section({ children, variant = '', role, ...props }: NativeProps) {
  const names = variant.split(' ');
  return (
    <View
      accessibilityRole={role === 'alert' ? 'alert' : undefined}
      accessibilityLiveRegion={
        props['aria-live'] === 'polite' || role === 'status' ? 'polite' : undefined
      }
      style={[
        styles.section,
        names.includes('card') && styles.card,
        names.some((name) => ['actions', 'seat-row', 'tabs'].includes(name)) && styles.row,
        names.includes('notice') && styles.notice,
      ]}
    >
      {content(children)}
    </View>
  );
}
export function Paragraph({ children, role }: NativeProps) {
  return (
    <View accessibilityRole={role === 'alert' ? 'alert' : undefined} style={styles.paragraph}>
      {content(children)}
    </View>
  );
}
export function Title({ children }: NativeProps) {
  return (
    <View accessibilityRole="header" style={styles.paragraph}>
      {Children.map(children, (child) =>
        typeof child === 'string' || typeof child === 'number' ? (
          <Text style={styles.title}>{child}</Text>
        ) : (
          child
        ),
      )}
    </View>
  );
}
export function Heading({ children }: NativeProps) {
  return (
    <View accessibilityRole="header" style={styles.paragraph}>
      {Children.map(children, (child) =>
        typeof child === 'string' || typeof child === 'number' ? (
          <Text style={styles.heading}>{child}</Text>
        ) : (
          child
        ),
      )}
    </View>
  );
}
export function Caption({ children }: NativeProps) {
  return <View style={styles.paragraph}>{content(children)}</View>;
}
export const Inline = Paragraph;
export const Strong = Heading;
export function ProgressBar({ value, label }: { value: number; label: string }) {
  const percent = Math.max(0, Math.min(100, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={styles.progress}
    >
      <View style={{ height: 12, backgroundColor: colors.primary, width: `${percent}%` }} />
    </View>
  );
}
export function CoverImage({
  src,
  alt,
}: NativeProps & { src: string; alt?: string; loading?: string }) {
  return (
    <Image
      source={{ uri: src }}
      accessibilityLabel={alt || undefined}
      style={styles.cover}
      resizeMode="cover"
    />
  );
}

type FieldRegistration = { name?: string; value: FormValue | null; validate: () => string | null };
type SubmitEvent = { preventDefault: () => void; currentTarget: FormValues };
const FormContext = createContext<{
  register: (id: string, field: FieldRegistration) => () => void;
  submit: () => void;
} | null>(null);
const DisabledContext = createContext(false);
const LabelContext = createContext('');

function labelText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') return String(child);
      if (isValidElement<{ children?: ReactNode }>(child)) {
        if ([Input, Choice, TextArea].includes(child.type as typeof Input)) return '';
        return labelText(child.props.children);
      }
      return '';
    })
    .join(' ')
    .trim();
}
export function FieldLabel({ children }: NativeProps) {
  return (
    <LabelContext.Provider value={labelText(children)}>
      <View style={styles.field}>{content(children)}</View>
    </LabelContext.Provider>
  );
}
export function Fieldset({ children, disabled = false }: NativeProps & { disabled?: boolean }) {
  const inherited = useContext(DisabledContext);
  return (
    <DisabledContext.Provider value={disabled || inherited}>
      <Section>{children}</Section>
    </DisabledContext.Provider>
  );
}
export function FormContainer({
  children,
  onSubmit,
}: NativeProps & { onSubmit: (event: SubmitEvent) => void }) {
  const fields = useRef(new Map<string, FieldRegistration>());
  const [error, setError] = useState<string | null>(null);
  const register = useRef((id: string, field: FieldRegistration) => {
    fields.current.set(id, field);
    return () => {
      fields.current.delete(id);
    };
  }).current;
  const submit = () => {
    const values = new FormValues();
    for (const field of fields.current.values()) {
      const failure = field.validate();
      if (failure) {
        setError(failure);
        return;
      }
      if (field.name && field.value !== null) values.append(field.name, field.value);
    }
    setError(null);
    onSubmit({ preventDefault() {}, currentTarget: values });
  };
  return (
    <FormContext.Provider value={{ register, submit }}>
      <Section>
        {children}
        {error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        )}
      </Section>
    </FormContext.Provider>
  );
}

interface InputProps extends NativeProps {
  name?: string;
  type?: string;
  value?: string | number;
  defaultValue?: string | number;
  defaultChecked?: boolean;
  required?: boolean;
  min?: number | string;
  max?: number | string;
  step?: string;
  disabled?: boolean;
  placeholder?: string;
  rows?: number;
  autoComplete?: string;
  onChange?: (event: { target: { value: string } }) => void;
}
function useField(props: InputProps, initial: FormValue | null) {
  const [stored, setStored] = useState(initial);
  const id = useId();
  const form = useContext(FormContext);
  const t = useT();
  const inheritedLabel = useContext(LabelContext);
  const label = props['aria-label'] || inheritedLabel || props.name || '';
  const value =
    props.value !== undefined && props.type !== 'checkbox' ? String(props.value) : stored;
  const disabled = useContext(DisabledContext) || !!props.disabled;
  useEffect(
    () =>
      form?.register(id, {
        name: props.name,
        value: disabled ? null : value,
        validate: () => {
          if (disabled) return null;
          const invalid = `${label}: ${t('Check the form fields.')}`;
          if (props.required && (value === null || value === '')) return invalid;
          if (typeof value !== 'string' || !value) return null;
          if (props.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return invalid;
          if (
            props.type === 'number' &&
            (!Number.isFinite(Number(value)) ||
              (props.min !== undefined && Number(value) < Number(props.min)) ||
              (props.max !== undefined && Number(value) > Number(props.max)) ||
              (props.step !== 'any' &&
                Math.abs(
                  Number(value) / Number(props.step || 1) -
                    Math.round(Number(value) / Number(props.step || 1)),
                ) > 1e-7))
          )
            return invalid;
          if (props.type === 'datetime-local' && !Number.isFinite(new Date(value).getTime()))
            return invalid;
          return null;
        },
      }),
    [
      form?.register,
      id,
      props.name,
      props.required,
      props.type,
      props.min,
      props.max,
      props.step,
      value,
      disabled,
      label,
    ],
  );
  const change = (next: FormValue | null) => {
    setStored(next);
    props.onChange?.({ target: { value: typeof next === 'string' ? next : '' } });
  };
  return { value, change, label, disabled };
}
export function Input(props: InputProps) {
  const initial =
    props.type === 'checkbox'
      ? props.defaultChecked
        ? String(props.value ?? 'on')
        : null
      : String(props.defaultValue ?? props.value ?? '');
  const { value, change, label, disabled } = useField(props, initial);
  const [pickingDate, setPickingDate] = useState<'date' | 'time' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = useT();
  if (props.type === 'checkbox')
    return (
      <Switch
        accessibilityLabel={label}
        value={value !== null}
        disabled={disabled}
        onValueChange={(checked) => change(checked ? String(props.value ?? 'on') : null)}
      />
    );
  if (props.type === 'file')
    return (
      <Section>
        <NativeButton
          disabled={disabled}
          onPress={async () => {
            try {
              const result = await DocumentPicker.getDocumentAsync({
                type: ['image/png', 'image/jpeg', 'application/pdf'],
                copyToCacheDirectory: true,
              });
              if (result.canceled) return;
              const asset = result.assets[0];
              if (!asset || (asset.size ?? 0) > 5 * 1024 * 1024) {
                setError('PNG, JPEG, PDF ≤ 5 MB');
                return;
              }
              change(asset);
              setError(null);
            } catch {
              setError(t('Something went wrong. Try again.'));
            }
          }}
        >
          {label || t('Attachment')}
        </NativeButton>
        {value && typeof value !== 'string' && <Caption>{value.name}</Caption>}
        {error && <Paragraph role="alert">{error}</Paragraph>}
      </Section>
    );
  if (props.type === 'datetime-local') {
    const parsed = typeof value === 'string' && value ? new Date(value) : new Date();
    const date = Number.isFinite(parsed.getTime()) ? parsed : new Date();
    return (
      <Section>
        <NativeButton disabled={disabled} onPress={() => setPickingDate('date')}>
          {label} · {value ? date.toLocaleString() : '—'}
        </NativeButton>
        {pickingDate && (
          <DateTimePicker
            value={date}
            mode={pickingDate}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(event, selected) => {
              if (event.type === 'dismissed') {
                setPickingDate(null);
                return;
              }
              if (selected)
                change(
                  new Date(selected.getTime() - selected.getTimezoneOffset() * 60000)
                    .toISOString()
                    .slice(0, 16),
                );
              if (Platform.OS !== 'ios') setPickingDate(pickingDate === 'date' ? 'time' : null);
            }}
          />
        )}
        {pickingDate && Platform.OS === 'ios' && (
          <NativeButton
            onPress={() => {
              if (!value)
                change(
                  new Date(date.getTime() - date.getTimezoneOffset() * 60000)
                    .toISOString()
                    .slice(0, 16),
                );
              setPickingDate(pickingDate === 'date' ? 'time' : null);
            }}
          >
            {t(pickingDate === 'date' ? 'Continue' : 'Save')}
          </NativeButton>
        )}
        {!!value && !props.required && (
          <NativeButton disabled={disabled} onPress={() => change('')}>
            {t('Remove')}
          </NativeButton>
        )}
      </Section>
    );
  }
  return (
    <TextInput
      accessibilityLabel={label}
      editable={!disabled}
      style={[styles.input, props.type === 'textarea' && styles.multiline]}
      value={typeof value === 'string' ? value : ''}
      onChangeText={change}
      placeholder={props.placeholder}
      secureTextEntry={props.type === 'password'}
      autoCapitalize={
        ['email', 'password', 'url'].includes(props.type || '') ? 'none' : 'sentences'
      }
      keyboardType={
        props.type === 'number'
          ? 'decimal-pad'
          : props.type === 'email'
            ? 'email-address'
            : props.type === 'tel'
              ? 'phone-pad'
              : 'default'
      }
      multiline={props.type === 'textarea'}
    />
  );
}
export function TextArea(props: InputProps) {
  return <Input {...props} type="textarea" />;
}
export function Option(_props: { value: string; children?: ReactNode }) {
  return null;
}
export function Choice(props: InputProps) {
  const options = Children.toArray(props.children).filter(
    isValidElement<{ value: string; children?: ReactNode }>,
  );
  const requested = String(props.defaultValue ?? props.value ?? '');
  const initial = options.some((option) => option.props.value === requested)
    ? requested
    : (options[0]?.props.value ?? '');
  const { value, change, disabled, label } = useField(props, initial);
  return (
    <View style={styles.picker}>
      <Picker
        accessibilityLabel={label}
        selectedValue={value}
        enabled={!disabled}
        onValueChange={(next) => change(String(next))}
      >
        {options.map((option) => (
          <Picker.Item
            key={option.props.value}
            value={option.props.value}
            label={labelText(option.props.children)}
          />
        ))}
      </Picker>
    </View>
  );
}
export function NativeButton({
  children,
  disabled,
  onPress,
  type,
  ...props
}: NativeProps & {
  disabled?: boolean;
  onPress?: () => void;
  type?: string;
  title?: string;
  'aria-pressed'?: boolean;
}) {
  const form = useContext(FormContext);
  const unavailable = useContext(DisabledContext) || disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props['aria-label'] || labelText(children)}
      accessibilityState={{ disabled: !!unavailable, selected: props['aria-pressed'] }}
      disabled={!!unavailable}
      style={[
        styles.button,
        props['aria-pressed'] && styles.selected,
        unavailable && styles.disabled,
      ]}
      onPress={onPress || (type !== 'button' ? form?.submit : undefined)}
    >
      <Text style={styles.buttonText}>{children}</Text>
    </Pressable>
  );
}
export function Summary({ children }: NativeProps) {
  return <Heading>{children}</Heading>;
}
export function Disclosure({ children }: NativeProps) {
  const [open, setOpen] = useState(false);
  const items = Children.toArray(children);
  const summary = items.find((item) => isValidElement(item) && item.type === Summary);
  return (
    <Section variant="card">
      <NativeButton onPress={() => setOpen(!open)} aria-pressed={open}>
        {labelText(summary)} {open ? '−' : '+'}
      </NativeButton>
      {open && items.filter((item) => item !== summary)}
    </Section>
  );
}
export function ExternalLink({
  href,
  children,
}: NativeProps & { href: string; target?: string; rel?: string }) {
  const [error, setError] = useState(false);
  const t = useT();
  return (
    <Section>
      <NativeButton
        onPress={() => {
          void openExternal(href).catch(() => setError(true));
        }}
      >
        {children}
      </NativeButton>
      {error && <Paragraph role="alert">{t('Something went wrong. Try again.')}</Paragraph>}
    </Section>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10, marginBottom: 10 },
  paragraph: {
    gap: 4,
    marginBottom: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  card: {
    padding: 16,
    borderRadius: 16,
    borderColor: '#DFE5EF',
    borderWidth: 1,
    backgroundColor: '#fff',
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  text: { color: colors.text, fontSize: 16, lineHeight: 23, flexShrink: 1 },
  progress: { height: 12, borderRadius: 6, backgroundColor: colors.border, overflow: 'hidden' },
  title: { color: colors.text, fontSize: 28, fontWeight: '700' },
  heading: { color: colors.text, fontSize: 19, fontWeight: '600' },
  field: { gap: 6, marginBottom: 12 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    color: colors.text,
    backgroundColor: '#fff',
    fontSize: 16,
  },
  multiline: { minHeight: 110, textAlignVertical: 'top' },
  picker: { borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
  button: {
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: colors.primary,
    justifyContent: 'center',
  },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  selected: { backgroundColor: '#14683E' },
  disabled: { opacity: 0.45 },
  cover: { width: '100%', height: 180, borderRadius: 12 },
  notice: { padding: 12, backgroundColor: '#FFF3D6', borderRadius: 8 },
  error: { color: colors.error, fontSize: 15 },
});
