import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
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
    <div className="notice error" role="alert">
      {t(
        error instanceof ApiError
          ? errorKey(error.code, error.status)
          : 'Something went wrong. Try again.',
      )}
      {error instanceof ApiError && <small>{error.code}</small>}
    </div>
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
      {value.loading && !value.data && <p role="status">{t('Loading…')}</p>}
      {value.error != null && (
        <>
          <ErrorNotice error={value.error} />
          <button onClick={value.reload}>{t('Try again')}</button>
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
  onSubmit: (values: FormData) => Promise<unknown>;
  submit?: string;
  children?: ReactNode;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  async function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await onSubmit(data);
      setSaved(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={handle} className="form">
      <fieldset disabled={busy}>
        {fields.map((field) => (
          <label key={field.name} className={field.type === 'checkbox' ? 'check' : ''}>
            <span>
              {t(field.label)}
              {field.required ? ' *' : ''}
            </span>
            {field.options ? (
              <select
                name={field.name}
                defaultValue={String(field.value ?? '')}
                required={field.required}
              >
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.label)}
                  </option>
                ))}
              </select>
            ) : field.type === 'textarea' ? (
              <textarea
                name={field.name}
                defaultValue={String(field.value ?? '')}
                required={field.required}
                rows={4}
              />
            ) : field.type === 'checkbox' ? (
              <input name={field.name} type="checkbox" defaultChecked={Boolean(field.value)} />
            ) : (
              <input
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
            {field.hint && <small>{t(field.hint)}</small>}
          </label>
        ))}
        {children}
        <ErrorNotice error={error} />
        <button className="primary" type="submit">
          {t(busy ? 'Loading…' : submit)}
        </button>
        {saved && (
          <span className="success-text" role="status">
            {t('Saved')}
          </span>
        )}
      </fieldset>
    </form>
  );
}
export const text = (data: FormData, name: string) => String(data.get(name) ?? '').trim();
export const number = (data: FormData, name: string) => Number(text(data, name));
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
    <div className="actions">
      <button disabled={page === 1} onClick={() => onChange(page - 1)}>
        {t('Previous')}
      </button>
      <span>
        {page} / {Math.ceil(total / 20)}
      </span>
      <button disabled={page * 20 >= total} onClick={() => onChange(page + 1)}>
        {t('Next')}
      </button>
    </div>
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
    <div className="stack">
      {items.map((item) => (
        <article className="card" key={item.id}>
          {render(item)}
        </article>
      ))}
    </div>
  ) : (
    <p className="empty">{t('No results')}</p>
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
  return (
    <span className="action">
      <button
        disabled={busy}
        onClick={async () => {
          if (confirm && !confirming) {
            setConfirming(true);
            return;
          }
          setBusy(true);
          setError(null);
          try {
            await run();
            setConfirming(false);
          } catch (e) {
            setError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? t('Loading…') : confirming ? `${t(confirm!)} ✓` : children}
      </button>
      {confirming && (
        <button disabled={busy} onClick={() => setConfirming(false)}>
          {t('Cancel')}
        </button>
      )}
      <ErrorNotice error={error} />
    </span>
  );
}
export function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  const t = useT();
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{t(h)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p>{t('No results')}</p>}
    </div>
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
