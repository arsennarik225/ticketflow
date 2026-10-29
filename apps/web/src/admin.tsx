import { useState } from 'react';
import { Link } from 'react-router-dom';
import { download, query, send, type Event, type Model, type Page } from './api';
import { date, money, useT } from './i18n';
import { Action, Form, List, number, options, Pager, Resource, text, useResource } from './ui';
import { tiyin } from './organizer';

type Kind = 'users' | 'events' | 'orders' | 'payments' | 'event-reports' | 'settings';
export function AdminPage() {
  const t = useT();
  const [tab, setTab] = useState<Kind>('users');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [inspect, setInspect] = useState<string | null>(null);
  const path = `/admin/${tab}${query({ q: ['users', 'events', 'orders'].includes(tab) ? q : undefined, page, status: tab === 'payments' ? status : undefined })}`;
  const users = useResource<Page<Model<'AdminUser'>>>(tab === 'users' ? path : null);
  const events = useResource<Page<Event>>(tab === 'events' ? path : null);
  const orders = useResource<Page<Model<'Order'>>>(tab === 'orders' ? path : null);
  const payments = useResource<Page<Model<'Payment'>>>(tab === 'payments' ? path : null);
  const reports = useResource<Page<Model<'EventReport'>>>(tab === 'event-reports' ? path : null);
  const settings = useResource<Model<'PlatformSettings'>>(
    tab === 'settings' ? '/admin/settings' : null,
  );
  const activation = useResource<Model<'Activation'>>(
    inspect ? `/admin/events/${inspect}/activation` : null,
  );
  const tabs: [Kind, string][] = [
    ['users', 'Users'],
    ['events', 'Events'],
    ['orders', 'Orders'],
    ['payments', 'Payments'],
    ['event-reports', 'Reports'],
    ['settings', 'Settings'],
  ];
  return (
    <>
      <h1>{t('Admin')}</h1>
      <div className="actions">
        <Link to="/support?handledBy=platform">{t('Support')}</Link>
        <Action run={() => download('/admin/reports/orders.csv', 'orders.csv')}>
          {t('Export orders CSV')}
        </Action>
      </div>
      <nav className="tabs">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            aria-pressed={tab === key}
            onClick={() => {
              setTab(key);
              setPage(1);
              setQ('');
              setStatus('');
            }}
          >
            {t(label)}
          </button>
        ))}
      </nav>
      {['users', 'events', 'orders'].includes(tab) && (
        <form
          className="toolbar"
          key={tab}
          onSubmit={(e) => {
            e.preventDefault();
            setQ(text(new FormData(e.currentTarget), 'q'));
            setPage(1);
          }}
        >
          <label>
            {t('Search')}
            <input name="q" />
          </label>
          <button>{t('Search')}</button>
        </form>
      )}
      {tab === 'users' && (
        <Resource value={users}>
          {(data) => (
            <>
              <List
                items={data.data}
                render={(user) => (
                  <>
                    <h2>
                      {user.fullName} · {user.email}
                    </h2>
                    <small>{user.id}</small>
                    <p>
                      {user.roles.join(', ')} · {t(user.suspendedAt ? 'Suspended' : 'active')}
                    </p>
                    <Moderate
                      path={`/admin/users/${user.id}`}
                      suspended={!!user.suspendedAt}
                      reload={users.reload}
                    />
                  </>
                )}
              />
              <Pager page={page} total={data.total} onChange={setPage} />
            </>
          )}
        </Resource>
      )}
      {tab === 'events' && (
        <Resource value={events}>
          {(data) => (
            <>
              <List
                items={data.data}
                render={(event) => (
                  <>
                    <h2>{event.title}</h2>
                    <p>
                      {event.city} · {t(event.status)}
                    </p>
                    <p>{event.suspendedReason}</p>
                    <Moderate
                      path={`/admin/events/${event.id}`}
                      suspended={!!event.suspendedReason}
                      reload={events.reload}
                    />
                    <div className="actions">
                      <button onClick={() => setInspect(event.id)}>{t('Activation')}</button>
                      <Link to={`/organizer/events/${event.id}`}>{t('History')}</Link>
                      <Link to={`/support?eventId=${event.id}`}>{t('Support')}</Link>
                    </div>
                    <details>
                      <summary>{t('Suspend paid sales')}</summary>
                      <Form
                        fields={[{ name: 'reason', label: 'Reason', required: true }]}
                        submit="Suspend paid sales"
                        onSubmit={async (form) => {
                          await send(`/admin/events/${event.id}/paid-sales/suspend`, {
                            reason: text(form, 'reason'),
                          });
                          events.reload();
                          activation.reload();
                        }}
                      />
                    </details>
                    <Action
                      run={async () => {
                        await send(`/admin/events/${event.id}/paid-sales/resume`);
                        events.reload();
                        activation.reload();
                      }}
                    >
                      {t('Resume paid sales')}
                    </Action>
                  </>
                )}
              />
              <Pager page={page} total={data.total} onChange={setPage} />
            </>
          )}
        </Resource>
      )}
      {inspect && (
        <Resource value={activation}>
          {(data) => (
            <section className="card">
              <h2>{t('Activation')}</h2>
              <p>
                {t('Activation fee')}: {money(data.activationFee)}
              </p>
              {Object.entries(data.steps).map(([key, value]) => (
                <p key={key}>
                  {t(key)}: {t(value ? 'Yes' : 'No')}
                </p>
              ))}
              <p>{data.suspendedReason}</p>
              <button onClick={() => setInspect(null)}>{t('Back')}</button>
            </section>
          )}
        </Resource>
      )}
      {tab === 'orders' && (
        <Resource value={orders}>
          {(data) => (
            <>
              <List
                items={data.data}
                render={(order) => (
                  <>
                    <h2>
                      {order.orderNumber} · {order.eventTitle}
                    </h2>
                    <p>
                      {order.buyerEmail} · {money(order.total)} · {t(order.status)}
                    </p>
                    <p className="notice">{t('Payment simulation — no real money is charged.')}</p>
                    <small>{order.id}</small>
                  </>
                )}
              />
              <Pager page={page} total={data.total} onChange={setPage} />
            </>
          )}
        </Resource>
      )}
      {tab === 'payments' && (
        <>
          <p className="notice">{t('Payment simulation — no real money is charged.')}</p>
          <label className="toolbar">
            {t('Status')}
            <select
              style={{ width: 'auto' }}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              {['', 'succeeded', 'failed', 'refunded'].map((s) => (
                <option key={s} value={s}>
                  {t(s || 'All')}
                </option>
              ))}
            </select>
          </label>
          <Resource value={payments}>
            {(data) => (
              <>
                <List
                  items={data.data}
                  render={(payment) => (
                    <>
                      <h2>
                        {money(payment.amount)} · {t(payment.status)}
                      </h2>
                      <p>
                        {payment.purpose} · {date(payment.createdAt)}
                      </p>
                      <small>{payment.failureCode}</small>
                      <small>{payment.id}</small>
                    </>
                  )}
                />
                <Pager page={page} total={data.total} onChange={setPage} />
              </>
            )}
          </Resource>
        </>
      )}
      {tab === 'event-reports' && (
        <Resource value={reports}>
          {(data) => (
            <>
              <List
                items={data.data}
                render={(report) => (
                  <>
                    <h2>{report.eventTitle}</h2>
                    <p>{report.reason}</p>
                    <small>{report.createdAt && date(report.createdAt)}</small>
                    <Action
                      run={async () => {
                        setTab('events');
                        setQ(report.eventTitle || '');
                      }}
                    >
                      {t('Open')}
                    </Action>
                  </>
                )}
              />
              <Pager page={page} total={data.total} onChange={setPage} />
            </>
          )}
        </Resource>
      )}
      {tab === 'settings' && (
        <Resource value={settings}>
          {(data) => (
            <section className="card">
              <Form
                key={JSON.stringify(data)}
                fields={[
                  {
                    name: 'activationFee',
                    label: 'Activation fee',
                    type: 'number',
                    min: 0,
                    step: '0.01',
                    value: data.activationFee.amount / 100,
                    required: true,
                  },
                  {
                    name: 'processingFeePercent',
                    label: 'Processing fee (%)',
                    type: 'number',
                    min: 0,
                    max: 100,
                    step: '0.01',
                    value: data.processingFeePercent,
                    required: true,
                  },
                  {
                    name: 'processingFeePaidBy',
                    label: 'Processing fee paid by',
                    value: data.processingFeePaidBy,
                    options: options('organizer', 'attendee'),
                  },
                  {
                    name: 'checkoutHoldMinutes',
                    label: 'Hold minutes',
                    type: 'number',
                    min: 1,
                    max: 120,
                    value: data.checkoutHoldMinutes,
                    required: true,
                  },
                  {
                    name: 'guestCheckoutEnabled',
                    label: 'Guest checkout',
                    type: 'checkbox',
                    value: data.guestCheckoutEnabled,
                  },
                  {
                    name: 'termsVersion',
                    label: 'Terms version',
                    value: data.termsVersion,
                    required: true,
                  },
                ]}
                onSubmit={async (form) => {
                  await send(
                    '/admin/settings',
                    {
                      activationFee: tiyin(text(form, 'activationFee')),
                      processingFeePercent: number(form, 'processingFeePercent'),
                      processingFeePaidBy: text(form, 'processingFeePaidBy'),
                      checkoutHoldMinutes: number(form, 'checkoutHoldMinutes'),
                      guestCheckoutEnabled: form.has('guestCheckoutEnabled'),
                      termsVersion: text(form, 'termsVersion'),
                    },
                    'PATCH',
                  );
                  settings.reload();
                }}
              />
            </section>
          )}
        </Resource>
      )}
    </>
  );
}
function Moderate({
  path,
  suspended,
  reload,
}: {
  path: string;
  suspended: boolean;
  reload: () => void;
}) {
  const t = useT();
  return suspended ? (
    <Action
      run={async () => {
        await send(`${path}/unsuspend`);
        reload();
      }}
    >
      {t('Unsuspend')}
    </Action>
  ) : (
    <details>
      <summary>{t('Suspend')}</summary>
      <Form
        fields={[{ name: 'reason', label: 'Reason', required: true }]}
        submit="Suspend"
        onSubmit={async (data) => {
          await send(`${path}/suspend`, { reason: text(data, 'reason') });
          reload();
        }}
      />
    </details>
  );
}
