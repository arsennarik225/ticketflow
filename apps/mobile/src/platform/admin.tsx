import {
  Caption,
  Choice,
  Disclosure,
  FieldLabel,
  FormContainer,
  Heading,
  Input,
  NativeButton,
  Option,
  Paragraph,
  Section,
  Summary,
  Title,
} from './native';
import { FormValues } from './forms';
import { useState } from 'react';
import { Link } from './navigation';
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
      <Title>{t('Admin')}</Title>
      <Section variant="actions">
        <Link to="/support?handledBy=platform">{t('Support')}</Link>
        <Action run={() => download('/admin/reports/orders.csv', 'orders.csv')}>
          {t('Export orders CSV')}
        </Action>
      </Section>
      <Section variant="tabs">
        {tabs.map(([key, label]) => (
          <NativeButton
            key={key}
            aria-pressed={tab === key}
            onPress={() => {
              setTab(key);
              setPage(1);
              setQ('');
              setStatus('');
            }}
          >
            {t(label)}
          </NativeButton>
        ))}
      </Section>
      {['users', 'events', 'orders'].includes(tab) && (
        <FormContainer
          variant="toolbar"
          key={tab}
          onSubmit={(e) => {
            e.preventDefault();
            setQ(text(new FormValues(e.currentTarget), 'q'));
            setPage(1);
          }}
        >
          <FieldLabel>
            {t('Search')}
            <Input name="q" />
          </FieldLabel>
          <NativeButton>{t('Search')}</NativeButton>
        </FormContainer>
      )}
      {tab === 'users' && (
        <Resource value={users}>
          {(data) => (
            <>
              <List
                items={data.data}
                render={(user) => (
                  <>
                    <Heading>
                      {user.fullName} · {user.email}
                    </Heading>
                    <Caption>{user.id}</Caption>
                    <Paragraph>
                      {user.roles.join(', ')} · {t(user.suspendedAt ? 'Suspended' : 'active')}
                    </Paragraph>
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
                    <Heading>{event.title}</Heading>
                    <Paragraph>
                      {event.city} · {t(event.status)}
                    </Paragraph>
                    <Paragraph>{event.suspendedReason}</Paragraph>
                    <Moderate
                      path={`/admin/events/${event.id}`}
                      suspended={!!event.suspendedReason}
                      reload={events.reload}
                    />
                    <Section variant="actions">
                      <NativeButton onPress={() => setInspect(event.id)}>
                        {t('Activation')}
                      </NativeButton>
                      <Link to={`/organizer/events/${event.id}`}>{t('History')}</Link>
                      <Link to={`/support?eventId=${event.id}`}>{t('Support')}</Link>
                    </Section>
                    <Disclosure>
                      <Summary>{t('Suspend paid sales')}</Summary>
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
                    </Disclosure>
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
            <Section variant="card">
              <Heading>{t('Activation')}</Heading>
              <Paragraph>
                {t('Activation fee')}: {money(data.activationFee)}
              </Paragraph>
              {Object.entries(data.steps).map(([key, value]) => (
                <Paragraph key={key}>
                  {t(key)}: {t(value ? 'Yes' : 'No')}
                </Paragraph>
              ))}
              <Paragraph>{data.suspendedReason}</Paragraph>
              <NativeButton onPress={() => setInspect(null)}>{t('Back')}</NativeButton>
            </Section>
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
                    <Heading>
                      {order.orderNumber} · {order.eventTitle}
                    </Heading>
                    <Paragraph>
                      {order.buyerEmail} · {money(order.total)} · {t(order.status)}
                    </Paragraph>
                    <Paragraph variant="notice">
                      {t('Payment simulation — no real money is charged.')}
                    </Paragraph>
                    <Caption>{order.id}</Caption>
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
          <Paragraph variant="notice">
            {t('Payment simulation — no real money is charged.')}
          </Paragraph>
          <FieldLabel variant="toolbar">
            {t('Status')}
            <Choice
              style={{ width: 'auto' }}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              {['', 'succeeded', 'failed', 'refunded'].map((s) => (
                <Option key={s} value={s}>
                  {t(s || 'All')}
                </Option>
              ))}
            </Choice>
          </FieldLabel>
          <Resource value={payments}>
            {(data) => (
              <>
                <List
                  items={data.data}
                  render={(payment) => (
                    <>
                      <Heading>
                        {money(payment.amount)} · {t(payment.status)}
                      </Heading>
                      <Paragraph>
                        {payment.purpose} · {date(payment.createdAt)}
                      </Paragraph>
                      <Caption>{payment.failureCode}</Caption>
                      <Caption>{payment.id}</Caption>
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
                    <Heading>{report.eventTitle}</Heading>
                    <Paragraph>{report.reason}</Paragraph>
                    <Caption>{report.createdAt && date(report.createdAt)}</Caption>
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
            <Section variant="card">
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
            </Section>
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
    <Disclosure>
      <Summary>{t('Suspend')}</Summary>
      <Form
        fields={[{ name: 'reason', label: 'Reason', required: true }]}
        submit="Suspend"
        onSubmit={async (data) => {
          await send(`${path}/suspend`, { reason: text(data, 'reason') });
          reload();
        }}
      />
    </Disclosure>
  );
}
