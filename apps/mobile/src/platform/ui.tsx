import { FormValues } from './forms';
import {
  Caption,
  Choice,
  FieldLabel,
  Fieldset,
  FormContainer,
  Inline,
  Input,
  NativeButton,
  Option,
  Paragraph,
  Section,
  TextArea,
} from './native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from './navigation';
import { api, ApiError, type Page } from './api';
import { errorKey, useT } from './i18n';

export function useResource<T>(path: string | null, poll = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    setData(null);
    setError(null);
    if (!path) return;
    const controller = new AbortController();
    let active = true;
    async function load(first: boolean) {
      if (first) setLoading(true);
      try {
        const result = await api<T>(path!, { signal: controller.signal });
        if (active) {
          setData(result);
          setError(null);
        }
      } catch (e) {
        if (active && !controller.signal.aborted) setError(e);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load(true);
    const interval = poll ? setInterval(() => void load(false), poll) : undefined;
    return () => {
      active = false;
      controller.abort();
      clearInterval(interval);
    };
  }, [path, version, poll]);
  return { data, error, loading, reload: () => setVersion((v) => v + 1) };
}
export function ErrorNotice({ error }: { error: unknown }) {
  const t = useT();
  if (!error) return null;
  return (
    <Section variant="notice error" role="alert">
      {t(
        error instanceof ApiError
          ? errorKey(error.code, error.status)
          : 'Something went wrong. Try again.',
      )}
      {error instanceof ApiError && <Caption>{error.code}</Caption>}
    </Section>
  );
}
export function Resource<T>({
  value,
  children,
}: {
  value: ReturnType<typeof useResource<T>>;
  children: (data: T) => ReactNode;
}) {
  const t = useT();
  return (
    <>
      {value.loading && !value.data && <Paragraph role="status">{t('Loading…')}</Paragraph>}
      {value.error != null && (
        <>
          <ErrorNotice error={value.error} />
          <NativeButton onPress={value.reload}>{t('Try again')}</NativeButton>
        </>
      )}
      {value.data && children(value.data)}
    </>
  );
}
export type Field = {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  value?: string | number | boolean;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: string;
  hint?: string;
};
export function Form({
  fields,
  onSubmit,
  submit = 'Save',
  children,
}: {
  fields: Field[];
  onSubmit: (values: FormValues) => Promise<unknown>;
  submit?: string;
  children?: ReactNode;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const submitting = useRef(false);
  async function handle(event: { preventDefault: () => void; currentTarget: FormValues }) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    const data = new FormValues(event.currentTarget);
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await onSubmit(data);
      setSaved(true);
    } catch (e) {
      setError(e);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <FormContainer onSubmit={handle} variant="form">
      <Fieldset disabled={busy}>
        {fields.map((field) => (
          <FieldLabel key={field.name} variant={field.type === 'checkbox' ? 'check' : ''}>
            <Inline>
              {t(field.label)}
              {field.required ? ' *' : ''}
            </Inline>
            {field.options ? (
              <Choice
                name={field.name}
                defaultValue={String(field.value ?? '')}
                required={field.required}
              >
                {field.options.map((option) => (
                  <Option key={option.value} value={option.value}>
                    {t(option.label)}
                  </Option>
                ))}
              </Choice>
            ) : field.type === 'textarea' ? (
              <TextArea
                name={field.name}
                defaultValue={String(field.value ?? '')}
                required={field.required}
                rows={4}
              />
            ) : field.type === 'checkbox' ? (
              <Input
                name={field.name}
                type="checkbox"
                defaultChecked={Boolean(field.value)}
                required={field.required}
              />
            ) : (
              <Input
                name={field.name}
                type={field.type || 'text'}
                defaultValue={String(field.value ?? '')}
                required={field.required}
                min={field.min}
                max={field.max}
                step={field.step}
                autoComplete={field.type === 'password' ? 'current-password' : undefined}
              />
            )}
            {field.hint && <Caption>{t(field.hint)}</Caption>}
          </FieldLabel>
        ))}
        {children}
        <ErrorNotice error={error} />
        <NativeButton variant="primary" type="submit">
          {t(busy ? 'Loading…' : submit)}
        </NativeButton>
        {saved && (
          <Inline variant="success-text" role="status">
            {t('Saved')}
          </Inline>
        )}
      </Fieldset>
    </FormContainer>
  );
}
export const text = (data: FormValues, name: string) => String(data.get(name) ?? '').trim();
export const number = (data: FormValues, name: string) => Number(text(data, name));
export const options = (...values: string[]) => values.map((value) => ({ value, label: value }));
export function Pager({
  page,
  total,
  onChange,
}: {
  page: number;
  total?: number;
  onChange: (page: number) => void;
}) {
  const t = useT();
  if (!total || total <= 20) return null;
  return (
    <Section variant="actions">
      <NativeButton disabled={page === 1} onPress={() => onChange(page - 1)}>
        {t('Previous')}
      </NativeButton>
      <Inline>
        {page} / {Math.ceil(total / 20)}
      </Inline>
      <NativeButton disabled={page * 20 >= total} onPress={() => onChange(page + 1)}>
        {t('Next')}
      </NativeButton>
    </Section>
  );
}
export function List<T extends { id: string }>({
  items,
  render,
}: {
  items: T[];
  render: (item: T) => ReactNode;
}) {
  const t = useT();
  return items.length ? (
    <Section variant="stack">
      {items.map((item) => (
        <Section variant="card" key={item.id}>
          {render(item)}
        </Section>
      ))}
    </Section>
  ) : (
    <Paragraph variant="empty">{t('No results')}</Paragraph>
  );
}
export function Action({
  children,
  run,
  confirm,
}: {
  children: ReactNode;
  run: () => Promise<unknown>;
  confirm?: string;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [confirming, setConfirming] = useState(false);
  const running = useRef(false);
  return (
    <Inline variant="action">
      <NativeButton
        disabled={busy}
        onPress={async () => {
          if (running.current) return;
          if (confirm && !confirming) {
            setConfirming(true);
            return;
          }
          running.current = true;
          setBusy(true);
          setError(null);
          try {
            await run();
            setConfirming(false);
          } catch (e) {
            setError(e);
          } finally {
            running.current = false;
            setBusy(false);
          }
        }}
      >
        {busy ? t('Loading…') : confirming ? `${t(confirm!)} ✓` : children}
      </NativeButton>
      {confirming && (
        <NativeButton disabled={busy} onPress={() => setConfirming(false)}>
          {t('Cancel')}
        </NativeButton>
      )}
      <ErrorNotice error={error} />
    </Inline>
  );
}
export function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  const t = useT();
  return (
    <Section>
      {rows.map((row, i) => (
        <Section variant="card" key={i}>
          {row.map((cell, j) => (
            <Section key={j}>
              <Caption>{t(headers[j] || '')}</Caption>
              <Paragraph>{cell ?? '—'}</Paragraph>
            </Section>
          ))}
        </Section>
      ))}
      {!rows.length && <Paragraph>{t('No results')}</Paragraph>}
    </Section>
  );
}
export function SupportLink({
  eventId,
  orderId,
  ticketId,
}: {
  eventId?: string;
  orderId?: string;
  ticketId?: string;
}) {
  const t = useT();
  const params = new URLSearchParams();
  if (eventId) params.set('eventId', eventId);
  if (orderId) params.set('orderId', orderId);
  if (ticketId) params.set('ticketId', ticketId);
  return <Link to={`/support/new?${params}`}>{t('Support')}</Link>;
}
export function PageList<T extends { id: string }>({
  path,
  render,
}: {
  path: string;
  render: (item: T) => ReactNode;
}) {
  const [page, setPage] = useState(1);
  const resource = useResource<Page<T>>(`${path}${path.includes('?') ? '&' : '?'}page=${page}`);
  return (
    <Resource value={resource}>
      {(data) => (
        <>
          <List items={data.data} render={render} />
          <Pager page={page} total={data.total} onChange={setPage} />
        </>
      )}
    </Resource>
  );
}
