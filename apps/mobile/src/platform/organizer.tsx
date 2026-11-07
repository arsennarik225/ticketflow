import {
  Caption,
  Choice,
  Disclosure,
  ExternalLink,
  FieldLabel,
  Fieldset,
  FormContainer,
  Heading,
  Inline,
  Input,
  NativeButton,
  Option,
  Paragraph,
  Section,
  Strong,
  Summary,
  Title,
} from './native';
import { FormValues } from './forms';
import { ProgressBar } from './native';
import { useState } from 'react';
import { Link, useNavigate, useParams } from './navigation';
import {
  api,
  download,
  idempotencyKey,
  query,
  send,
  type Event,
  type Model,
  type Order,
  type Page,
} from './api';
import { useUser } from './auth';
import { EventCard, EventDetails, SeatPicker } from './events';
import { date, money, useT } from './i18n';
import {
  Action,
  Form,
  List,
  number,
  options,
  Pager,
  Resource,
  SupportLink,
  Table,
  text,
  useResource,
  type Field,
} from './ui';

export function localDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
const optionalDate = (data: FormValues, name: string) =>
  text(data, name) ? new Date(text(data, name)).toISOString() : undefined;
const optionalNumber = (data: FormValues, name: string) =>
  text(data, name) === '' ? undefined : number(data, name);
export function tiyin(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('Invalid KZT amount');
  const [whole, fraction = ''] = value.split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(amount)) throw new Error('Invalid KZT amount');
  return { amount, currency: 'KZT' as const };
}
export function EventEditor({ event, onSave }: { event?: Event; onSave: (result: Event) => void }) {
  const t = useT();
  const fields: Field[] = [
    { name: 'title', label: 'Title', required: true, value: event?.title },
    { name: 'description', label: 'Description', type: 'textarea', value: event?.description },
    { name: 'category', label: 'Category', value: event?.category },
    { name: 'imageUrl', label: 'Image URL', type: 'url', value: event?.imageUrl },
    { name: 'venueName', label: 'Venue', required: true, value: event?.venueName },
    { name: 'address', label: 'Address', value: event?.address },
    { name: 'city', label: 'City', required: true, value: event?.city },
    {
      name: 'startsAt',
      label: 'Starts',
      type: 'datetime-local',
      required: true,
      value: localDate(event?.startsAt),
    },
    {
      name: 'endsAt',
      label: 'Ends',
      type: 'datetime-local',
      required: true,
      value: localDate(event?.endsAt),
    },
    {
      name: 'timeZone',
      label: 'Time zone',
      required: true,
      value: event?.timeZone || 'Asia/Almaty',
    },
    {
      name: 'visibility',
      label: 'Visibility',
      value: event?.visibility || 'public',
      options: options('public', 'unlisted', 'private'),
    },
    {
      name: 'registrationOpensAt',
      label: 'Registration opens',
      type: 'datetime-local',
      value: localDate(event?.registrationOpensAt),
    },
    {
      name: 'registrationClosesAt',
      label: 'Registration closes',
      type: 'datetime-local',
      value: localDate(event?.registrationClosesAt),
    },
    { name: 'capacity', label: 'Capacity', type: 'number', min: 0, value: event?.capacity },
    { name: 'refundPolicy', label: 'Refund policy', type: 'textarea', value: event?.refundPolicy },
  ];
  return (
    <>
      <Paragraph variant="muted">{t('Date inputs use this device’s time zone.')}</Paragraph>
      <Form
        fields={fields}
        onSubmit={async (data) => {
          const body = {
            ...Object.fromEntries(data),
            capacity: optionalNumber(data, 'capacity'),
            startsAt: optionalDate(data, 'startsAt'),
            endsAt: optionalDate(data, 'endsAt'),
            registrationOpensAt: optionalDate(data, 'registrationOpensAt'),
            registrationClosesAt: optionalDate(data, 'registrationClosesAt'),
            imageUrl: text(data, 'imageUrl') || undefined,
          };
          onSave(
            await send<Event>(
              event ? `/organizer/events/${event.id}` : '/organizer/events',
              body,
              event ? 'PATCH' : 'POST',
            ),
          );
        }}
      />
    </>
  );
}
export function OrganizerPage() {
  const t = useT();
  const user = useUser()!;
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const resource = useResource<Page<Event>>(
    user.roles.includes('organizer') ? `/organizer/events${query({ status, page })}` : null,
  );
  if (!user.roles.includes('organizer'))
    return (
      <Section variant="card">
        <Title>{t('Organizer profile')}</Title>
        <Link to="/account">{t('Organizer profile')}</Link>
      </Section>
    );
  return (
    <>
      <Section variant="toolbar">
        <Title>{t('Organizer')}</Title>
        <Link variant="button primary" to="/organizer/events/new">
          + {t('New event')}
        </Link>
      </Section>
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
          {['', 'draft', 'upcoming', 'active', 'completed', 'cancelled'].map((s) => (
            <Option key={s} value={s}>
              {t(s || 'All')}
            </Option>
          ))}
        </Choice>
      </FieldLabel>
      <Resource value={resource}>
        {(data) => (
          <>
            <Section variant="grid">
              {data.data.map((event) => (
                <EventCard key={event.id} event={event} organizer />
              ))}
            </Section>
            <Pager page={page} total={data.total} onChange={setPage} />
          </>
        )}
      </Resource>
    </>
  );
}
export function NewEventPage() {
  const t = useT();
  const navigate = useNavigate();
  return (
    <>
      <Title>{t('New event')}</Title>
      <Section variant="card">
        <EventEditor onSave={(event) => navigate(`/organizer/events/${event.id}`)} />
      </Section>
    </>
  );
}
export function ManageEventPage() {
  const { id } = useParams();
  const t = useT();
  const navigate = useNavigate();
  const resource = useResource<Event>(`/organizer/events/${id}`);
  const [tab, setTab] = useState('Overview');
  const [preview, setPreview] = useState(false);
  const user = useUser();
  const canWrite = user?.id === resource.data?.organizerId;
  return (
    <Resource value={resource}>
      {(event) => (
        <>
          <Link variant="back" to="/organizer">
            ← {t('Organizer')}
          </Link>
          <Title>{event.title}</Title>
          <Paragraph>
            <Inline variant="badge">{t(event.status)}</Inline> · {event.city}
          </Paragraph>
          <Section variant="actions">
            {canWrite && (
              <Action
                run={async () => {
                  await send(
                    `/organizer/events/${id}/${event.status === 'draft' ? 'publish' : 'unpublish'}`,
                  );
                  resource.reload();
                }}
              >
                {t(event.status === 'draft' ? 'Publish' : 'Unpublish')}
              </Action>
            )}
            {canWrite && (
              <Action
                run={async () => {
                  const copy = await send<Event>(`/organizer/events/${id}/duplicate`);
                  navigate(`/organizer/events/${copy.id}`);
                  setTab('Overview');
                }}
              >
                {t('Duplicate')}
              </Action>
            )}
            <NativeButton onPress={() => setPreview(!preview)}>{t('Preview')}</NativeButton>
            <SupportLink eventId={event.id} />
          </Section>
          {preview && (
            <Section variant="card">
              <EventDetails event={event} />
              <Table
                headers={['Ticket type', 'Price (KZT)', 'Available']}
                rows={(event.ticketTypes || []).map((type) => [
                  type.name,
                  money(type.price),
                  type.available,
                ])}
              />
            </Section>
          )}
          <Section variant="tabs" aria-label={t('Organizer')}>
            {[
              'Overview',
              'Ticket types',
              'Seating',
              'Activation',
              'Campaigns',
              'Orders',
              'Attendees',
              'Staff',
              'Analytics',
              'History',
              'Support',
            ]
              .filter(
                (name) =>
                  canWrite ||
                  ['Overview', 'Orders', 'Attendees', 'Analytics', 'History', 'Support'].includes(
                    name,
                  ),
              )
              .map((name) => (
                <NativeButton key={name} aria-pressed={tab === name} onPress={() => setTab(name)}>
                  {t(name)}
                </NativeButton>
              ))}
          </Section>
          {tab === 'Overview' && !canWrite && (
            <Section variant="card">
              <EventDetails event={event} />
            </Section>
          )}
          {tab === 'Overview' && canWrite && (
            <Section variant="two-col">
              <Section variant="card">
                <Heading>{t('Edit event')}</Heading>
                <EventEditor
                  key={event.id + event.startsAt}
                  event={event}
                  onSave={resource.reload}
                />
              </Section>
              <Section variant="card">
                <Heading>{t('Cancel event')}</Heading>
                <Form
                  submit="Cancel event"
                  fields={[{ name: 'reason', label: 'Reason', type: 'textarea', required: true }]}
                  onSubmit={async (data) => {
                    await send(`/organizer/events/${id}/cancel`, { reason: text(data, 'reason') });
                    resource.reload();
                  }}
                />
              </Section>
            </Section>
          )}
          {tab === 'Ticket types' && <TicketTypes event={event} onChange={resource.reload} />}
          {tab === 'Seating' && <Seating event={event} onChange={resource.reload} />}
          {tab === 'Activation' && <Activation event={event} onChange={resource.reload} />}
          {tab === 'Campaigns' && <Campaigns event={event} />}
          {tab === 'Orders' && <EventOrders eventId={event.id} />}
          {tab === 'Attendees' && <Attendees eventId={event.id} />}
          {tab === 'Staff' && <Staff eventId={event.id} />}
          {tab === 'Analytics' && <Analytics event={event} />}
          {tab === 'History' && <History eventId={event.id} />}
          {tab === 'Support' && <Link to={`/support?eventId=${event.id}`}>{t('Support')}</Link>}
        </>
      )}
    </Resource>
  );
}
function TicketTypes({ event, onChange }: { event: Event; onChange: () => void }) {
  const t = useT();
  const [editing, setEditing] = useState<Model<'TicketType'> | null>(null);
  const types = event.ticketTypes || [];
  return (
    <Section variant="two-col">
      <Section variant="card">
        <Table
          headers={[
            'Ticket type',
            'Price (KZT)',
            'Quantity',
            'Available',
            'Held',
            'Sold',
            'Refunded',
            'Checked in',
            'Edit',
          ]}
          rows={types.map((type) => [
            <>
              {type.name}
              {type.hidden && ` (${t('Hidden')})`}
            </>,
            money(type.price),
            type.quantity,
            type.available,
            type.held,
            type.sold,
            type.refunded,
            type.checkedIn,
            <NativeButton onPress={() => setEditing(type)}>{t('Edit')}</NativeButton>,
          ])}
        />
      </Section>
      <Section variant="card">
        <Heading>{t(editing ? 'Edit' : 'Add ticket type')}</Heading>
        <Form
          key={editing?.id || 'new'}
          fields={[
            { name: 'name', label: 'Name', required: true, value: editing?.name },
            {
              name: 'description',
              label: 'Description',
              type: 'textarea',
              value: editing?.description,
            },
            {
              name: 'price',
              label: 'Price (KZT)',
              type: 'number',
              min: 0,
              step: '0.01',
              required: true,
              value: (editing?.price.amount || 0) / 100,
            },
            {
              name: 'quantity',
              label: 'Quantity',
              type: 'number',
              min: 0,
              required: true,
              value: editing?.quantity ?? 100,
            },
            {
              name: 'maxPerOrder',
              label: 'Maximum per order',
              type: 'number',
              min: 1,
              value: editing?.maxPerOrder,
            },
            {
              name: 'salesStartAt',
              label: 'Sales start',
              type: 'datetime-local',
              value: localDate(editing?.salesStartAt),
            },
            {
              name: 'salesEndAt',
              label: 'Sales end',
              type: 'datetime-local',
              value: localDate(editing?.salesEndAt),
            },
            {
              name: 'seatCategory',
              label: 'Seat category',
              value: editing?.seatCategory || '',
              options: options('', 'premium', 'standard', 'balcony'),
            },
            { name: 'hidden', label: 'Hidden', type: 'checkbox', value: editing?.hidden },
          ]}
          onSubmit={async (data) => {
            await send(
              `/organizer/events/${event.id}/ticket-types${editing ? `/${editing.id}` : ''}`,
              {
                name: text(data, 'name'),
                description: text(data, 'description'),
                price: tiyin(text(data, 'price')),
                quantity: number(data, 'quantity'),
                maxPerOrder: optionalNumber(data, 'maxPerOrder'),
                salesStartAt: optionalDate(data, 'salesStartAt'),
                salesEndAt: optionalDate(data, 'salesEndAt'),
                seatCategory: text(data, 'seatCategory') || undefined,
                hidden: data.has('hidden'),
              },
              editing ? 'PATCH' : 'POST',
            );
            setEditing(null);
            onChange();
          }}
        />
        {editing && <NativeButton onPress={() => setEditing(null)}>{t('Cancel')}</NativeButton>}
      </Section>
    </Section>
  );
}
function Activation({ event, onChange }: { event: Event; onChange: () => void }) {
  const t = useT();
  const state = useResource<Model<'Activation'>>(`/organizer/events/${event.id}/activation`);
  const user = useUser()!;
  const update = () => {
    state.reload();
    onChange();
  };
  return (
    <>
      <Paragraph variant="notice">{t('Payment simulation — no real money is charged.')}</Paragraph>
      <Resource value={state}>
        {(data) => (
          <Section variant="card">
            <Heading>{t('Activation')}</Heading>
            <Paragraph>
              {t('Activation fee')}: {money(data.activationFee)}
            </Paragraph>
            {Object.entries(data.steps).map(([step, complete]) => (
              <Paragraph key={step}>
                {complete ? '✓' : '○'} {t(step)}: {t(complete ? 'Yes' : 'No')}
              </Paragraph>
            ))}
            {data.suspendedReason && <Paragraph variant="notice">{data.suspendedReason}</Paragraph>}
            <Action
              confirm="Pay activation fee"
              run={async () => {
                await send(`/organizer/events/${event.id}/activation/pay-fee`);
                update();
              }}
            >
              {t('Pay activation fee')}
            </Action>
          </Section>
        )}
      </Resource>
      <Section variant="grid" style={{ marginTop: '1rem' }}>
        <Section variant="card">
          <Heading>{t('Simulated identity verification')}</Heading>
          <Form
            fields={[
              { name: 'legalName', label: 'Legal name', required: true, value: user.fullName },
            ]}
            submit="Verify"
            onSubmit={async (data) => {
              await send('/me/identity-verification', { legalName: text(data, 'legalName') });
              update();
            }}
          />
        </Section>
        <Section variant="card">
          <Heading>{t('Payout account (simulation)')}</Heading>
          <Form
            fields={[
              {
                name: 'accountHolderName',
                label: 'Account holder',
                required: true,
                value: user.fullName,
              },
              { name: 'sandboxAccountToken', label: 'Sandbox account token', required: true },
            ]}
            submit="Connect"
            onSubmit={async (data) => {
              await send('/me/payout-account', Object.fromEntries(data), 'PUT');
              update();
            }}
          />
        </Section>
        <Section variant="card">
          <Paragraph>
            {t(
              'Paid-event terms: this is a simulation. Organizers are responsible for event details and refunds; activation fees are non-refundable.',
            )}
          </Paragraph>
          <Form
            fields={[
              { name: 'termsVersion', label: 'Terms version', required: true, value: '2026-09' },
            ]}
            submit="Accept paid-event terms"
            onSubmit={async (data) => {
              await send(`/organizer/events/${event.id}/activation/accept-terms`, {
                termsVersion: text(data, 'termsVersion'),
              });
              update();
            }}
          />
        </Section>
      </Section>
    </>
  );
}
function Campaigns({ event }: { event: Event }) {
  const t = useT();
  const resource = useResource<Page<Model<'Campaign'>>>(`/organizer/events/${event.id}/campaigns`);
  const [editing, setEditing] = useState<Model<'Campaign'> | null>(null);
  return (
    <Section variant="two-col">
      <Resource value={resource}>
        {(data) => (
          <List
            items={data.data}
            render={(campaign) => (
              <>
                <Heading>{campaign.name}</Heading>
                <Paragraph>
                  {t('Promo code')}: <Strong>{campaign.code}</Strong>
                </Paragraph>
                <Paragraph variant="notice">{t('Campaign QR — NOT A TICKET')}</Paragraph>
                <ExternalLink href={campaign.campaignUrl} target="_blank" rel="noreferrer">
                  {campaign.campaignUrl}
                </ExternalLink>
                <Paragraph>
                  {t('Redemptions')}: {campaign.redemptions} · {t('Sold')}: {campaign.ticketsSold}
                </Paragraph>
                <Paragraph>
                  {t('Gross sales')}: {money(campaign.grossRevenue)} · {t('Discount')}:{' '}
                  {money(campaign.discountTotal)} · {t('Net revenue')}: {money(campaign.revenue)}
                </Paragraph>
                <Section variant="actions">
                  <Action
                    run={() =>
                      download(`/organizer/campaigns/${campaign.id}/qr`, `${campaign.code}.png`)
                    }
                  >
                    {t('Download campaign QR')}
                  </Action>
                  <NativeButton onPress={() => setEditing(campaign)}>{t('Edit')}</NativeButton>
                </Section>
              </>
            )}
          />
        )}
      </Resource>
      <Section variant="card">
        <Heading>{t('Campaigns')}</Heading>
        <Form
          key={editing?.id || 'new'}
          fields={[
            { name: 'name', label: 'Name', required: true, value: editing?.name },
            {
              name: 'discountType',
              label: 'Discount type',
              value: editing?.discountType || 'percentage',
              options: options('percentage', 'fixed_amount'),
            },
            {
              name: 'percentOff',
              label: 'Percent off',
              type: 'number',
              min: 0,
              max: 100,
              step: '0.01',
              value: editing?.percentOff ?? 10,
            },
            {
              name: 'amountOff',
              label: 'Amount off (KZT)',
              type: 'number',
              min: 0,
              step: '0.01',
              value: (editing?.amountOff?.amount || 0) / 100,
            },
            {
              name: 'validFrom',
              label: 'Valid from',
              type: 'datetime-local',
              value: localDate(editing?.validFrom),
            },
            {
              name: 'validUntil',
              label: 'Valid until',
              type: 'datetime-local',
              value: localDate(editing?.validUntil),
            },
            {
              name: 'maxRedemptions',
              label: 'Maximum redemptions',
              type: 'number',
              min: 0,
              value: editing?.maxRedemptions,
            },
            { name: 'disabled', label: 'Disabled', type: 'checkbox', value: editing?.disabled },
          ]}
          onSubmit={async (data) => {
            const discountType = text(data, 'discountType');
            await send(
              editing
                ? `/organizer/campaigns/${editing.id}`
                : `/organizer/events/${event.id}/campaigns`,
              {
                name: text(data, 'name'),
                discountType,
                ...(discountType === 'percentage'
                  ? { percentOff: number(data, 'percentOff') }
                  : { amountOff: tiyin(text(data, 'amountOff')) }),
                validFrom: optionalDate(data, 'validFrom'),
                validUntil: optionalDate(data, 'validUntil'),
                maxRedemptions: optionalNumber(data, 'maxRedemptions'),
                disabled: data.has('disabled'),
                ticketTypeIds: data.getAll('ticketTypeIds'),
              },
              editing ? 'PATCH' : 'POST',
            );
            setEditing(null);
            resource.reload();
          }}
        >
          <Fieldset>
            <Heading>{t('Applicable ticket types')}</Heading>
            {event.ticketTypes?.map((type) => (
              <FieldLabel key={type.id} variant="check">
                <Inline>{type.name}</Inline>
                <Input
                  type="checkbox"
                  name="ticketTypeIds"
                  value={type.id}
                  defaultChecked={editing?.ticketTypeIds?.includes(type.id)}
                />
              </FieldLabel>
            ))}
          </Fieldset>
        </Form>
        {editing && <NativeButton onPress={() => setEditing(null)}>{t('Cancel')}</NativeButton>}
      </Section>
    </Section>
  );
}
function EventOrders({ eventId }: { eventId: string }) {
  const t = useT();
  const [page, setPage] = useState(1);
  const orders = useResource<Page<Order>>(`/organizer/events/${eventId}/orders?page=${page}`);
  return (
    <Resource value={orders}>
      {(data) => (
        <>
          <List
            items={data.data}
            render={(order) => (
              <>
                <Heading>{order.orderNumber}</Heading>
                <Paragraph>
                  {order.buyerName} · {order.buyerEmail} · {money(order.total)} · {t(order.status)}
                </Paragraph>
                {order.tickets?.map((ticket) => (
                  <Paragraph key={ticket.id}>
                    {ticket.ticketNumber} · {ticket.attendee?.fullName} · {t(ticket.status)}
                  </Paragraph>
                ))}
                {order.status === 'confirmed' && (
                  <Disclosure>
                    <Summary>
                      {t(order.total.amount > 0 ? 'Refund order' : 'Cancel registration')}
                    </Summary>
                    <Form
                      fields={[{ name: 'reason', label: 'Reason', required: true }]}
                      submit={order.total.amount > 0 ? 'Refund order' : 'Cancel registration'}
                      onSubmit={async (form) => {
                        await send(
                          `/organizer/orders/${order.id}/${order.total.amount > 0 ? 'refund' : 'cancel'}`,
                          { reason: text(form, 'reason') },
                          'POST',
                          idempotencyKey(),
                        );
                        orders.reload();
                      }}
                    />
                  </Disclosure>
                )}
                <SupportLink orderId={order.id} />
              </>
            )}
          />
          <Pager page={page} total={data.total} onChange={setPage} />
        </>
      )}
    </Resource>
  );
}
function Attendees({ eventId }: { eventId: string }) {
  const t = useT();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const resource = useResource<Page<Model<'Attendee'>>>(
    `/organizer/events/${eventId}/attendees${query({ q, page })}`,
  );
  return (
    <>
      <FormContainer
        variant="toolbar"
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
      <Resource value={resource}>
        {(data) => (
          <>
            <Table
              headers={['Ticket', 'Name', 'Email', 'Ticket type', 'Seating', 'Status']}
              rows={data.data.map((a) => [
                a.ticketNumber,
                a.fullName,
                a.email,
                a.ticketTypeName,
                a.seatLabel,
                t(a.status),
              ])}
            />
            <Pager page={page} total={data.total} onChange={setPage} />
          </>
        )}
      </Resource>
    </>
  );
}
function Staff({ eventId }: { eventId: string }) {
  const t = useT();
  const resource = useResource<Page<Model<'StaffAssignment'>>>(
    `/organizer/events/${eventId}/staff`,
  );
  return (
    <Section variant="two-col">
      <Resource value={resource}>
        {(data) => (
          <List
            items={data.data}
            render={(staff) => (
              <>
                <Heading>{staff.email}</Heading>
                <Paragraph>
                  {t('Allow undo')}: {t(staff.canReverseCheckIn ? 'Yes' : 'No')}
                </Paragraph>
                <Caption>{staff.userId}</Caption>
                <Action
                  confirm="Remove"
                  run={async () => {
                    await api(`/organizer/events/${eventId}/staff/${staff.id}`, {
                      method: 'DELETE',
                    });
                    resource.reload();
                  }}
                >
                  {t('Remove')}
                </Action>
              </>
            )}
          />
        )}
      </Resource>
      <Section variant="card">
        <Form
          fields={[
            { name: 'email', label: 'Email', type: 'email', required: true },
            { name: 'canReverseCheckIn', label: 'Allow undo', type: 'checkbox' },
          ]}
          submit="Assign staff"
          onSubmit={async (data) => {
            await send(`/organizer/events/${eventId}/staff`, {
              email: text(data, 'email'),
              canReverseCheckIn: data.has('canReverseCheckIn'),
            });
            resource.reload();
          }}
        />
      </Section>
    </Section>
  );
}
function DateFilters({
  ticketTypes,
  onChange,
  action = false,
}: {
  ticketTypes?: Model<'TicketType'>[];
  onChange: (params: Record<string, string>) => void;
  action?: boolean;
}) {
  const t = useT();
  return (
    <FormContainer
      variant="toolbar"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormValues(e.currentTarget);
        onChange({
          from: optionalDate(form, 'from') || '',
          to: optionalDate(form, 'to') || '',
          ...(action
            ? { action: text(form, 'action') }
            : { ticketTypeId: text(form, 'ticketTypeId') }),
        });
      }}
    >
      <FieldLabel>
        {t('From')}
        <Input type="datetime-local" name="from" />
      </FieldLabel>
      <FieldLabel>
        {t('To (exclusive)')}
        <Input type="datetime-local" name="to" />
      </FieldLabel>
      {action ? (
        <FieldLabel>
          {t('Action')}
          <Input name="action" placeholder="check_in" />
        </FieldLabel>
      ) : (
        <FieldLabel>
          {t('Ticket type')}
          <Choice name="ticketTypeId">
            <Option value="">{t('All')}</Option>
            {ticketTypes?.map((type) => (
              <Option key={type.id} value={type.id}>
                {type.name}
              </Option>
            ))}
          </Choice>
        </FieldLabel>
      )}
      <NativeButton>{t('Apply')}</NativeButton>
    </FormContainer>
  );
}
function Analytics({ event }: { event: Event }) {
  const t = useT();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const resource = useResource<Model<'EventAnalytics'>>(
    `/organizer/events/${event.id}/analytics${query(filters)}`,
  );
  return (
    <>
      <DateFilters ticketTypes={event.ticketTypes} onChange={setFilters} />
      <Paragraph variant="notice">{t('Payment simulation — no real money is charged.')}</Paragraph>
      <Resource value={resource}>
        {(data) => (
          <>
            <Section variant="metrics">
              {[
                ['Capacity', data.capacity],
                ['Sold', data.ticketsSold],
                ['Remaining', data.ticketsRemaining],
                ['Gross sales', money(data.grossSales)],
                ['Discount', money(data.discounts)],
                ['Refunded', money(data.refunds)],
                ['Fees', money(data.fees)],
                ['Net revenue', money(data.netRevenue)],
                ['Estimated payout', money(data.estimatedPayout)],
                ['Registered', data.attendance?.registered],
                ['Checked in', data.attendance?.checkedIn],
                ['Absent', data.attendance?.absent],
                ['Attendance', `${data.attendance?.checkInPercent || 0}%`],
              ].map(([label, value]) => (
                <Section variant="metric" key={label}>
                  {t(String(label))}
                  <Strong>{value ?? '—'}</Strong>
                </Section>
              ))}
            </Section>
            <Paragraph>
              {t('Sold')}: {data.percentSold}%
            </Paragraph>
            <ProgressBar value={data.percentSold || 0} label={t('Sold')} />
            <Heading>{t('Sales over time')}</Heading>
            <Table
              headers={['Date', 'Sold', 'Gross sales']}
              rows={(data.salesOverTime || []).map((point) => [
                point.date,
                point.ticketsSold,
                money(point.grossSales),
              ])}
            />
            <Heading>{t('Ticket types')}</Heading>
            <Table
              headers={['Ticket type', 'Quantity', 'Sold', 'Remaining', 'Gross sales']}
              rows={(data.byTicketType || []).map((type) => [
                type.name,
                type.quantity,
                type.sold,
                type.remaining,
                money(type.grossSales),
              ])}
            />
            <Heading>{t('Campaigns')}</Heading>
            <Table
              headers={[
                'Name',
                'Promo code',
                'Redemptions',
                'Sold',
                'Gross sales',
                'Discount',
                'Net revenue',
              ]}
              rows={(data.campaigns || []).map((c) => [
                c.name,
                c.code,
                c.redemptions,
                c.ticketsSold,
                money(c.grossSales),
                money(c.discounts),
                money(c.netRevenue),
              ])}
            />
          </>
        )}
      </Resource>
    </>
  );
}
function History({ eventId }: { eventId: string }) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const resource = useResource<Page<Model<'AuditEntry'>>>(
    `/organizer/events/${eventId}/history${query({ ...filters, page })}`,
  );
  return (
    <>
      <DateFilters
        action
        onChange={(f) => {
          setFilters(f);
          setPage(1);
        }}
      />
      <Resource value={resource}>
        {(data) => (
          <>
            <Table
              headers={['Date', 'Actor', 'Action', 'Description']}
              rows={data.data.map((item) => [
                date(item.createdAt),
                item.actorName,
                item.action,
                item.description,
              ])}
            />
            <Pager page={page} total={data.total} onChange={setPage} />
          </>
        )}
      </Resource>
    </>
  );
}
function Seating({ event, onChange }: { event: Event; onChange: () => void }) {
  const t = useT();
  const [venueId, setVenueId] = useState(event.venueId || '');
  const [blocked, setBlocked] = useState<string[]>([]);
  const venues = useResource<Page<Model<'VenueSummary'>>>('/venues');
  const venue = useResource<Model<'Venue'>>(venueId ? `/venues/${venueId}` : null);
  const current = useResource<Model<'SeatMap'>>(
    event.venueId ? `/organizer/events/${event.id}/seats` : null,
  );
  return (
    <Section variant="stack">
      <Section variant="card">
        <Heading>{t('Seating')}</Heading>
        <Paragraph variant="notice">
          {t('This replaces the previous seating configuration. Select seats to keep out of sale.')}
        </Paragraph>
        <Resource value={venues}>
          {(data) => (
            <Form
              fields={[]}
              onSubmit={async () => {
                await send(
                  `/organizer/events/${event.id}/seating`,
                  { venueId: venueId || null, blockedSeatIds: blocked },
                  'PUT',
                );
                onChange();
                current.reload();
              }}
            >
              <FieldLabel>
                {t('Venue')}
                <Choice
                  value={venueId}
                  onChange={(e) => {
                    setVenueId(e.target.value);
                    setBlocked([]);
                  }}
                >
                  <Option value="">{t('General admission')}</Option>
                  {data.data.map((v) => (
                    <Option key={v.id} value={v.id}>
                      {v.name} ({v.seatCount})
                    </Option>
                  ))}
                </Choice>
              </FieldLabel>
              <Resource value={venue}>
                {(layout) => (
                  <>
                    <Heading>{t('Block seats')}</Heading>
                    <SeatPicker
                      blocked
                      selected={blocked}
                      onChange={setBlocked}
                      map={{
                        eventId: event.id,
                        venueId: layout.id,
                        venueName: layout.name,
                        sections: layout.sections.map((section) => ({
                          name: section.name,
                          rows: section.rows.map((row) => ({
                            label: row.label,
                            seats: row.seats.map((seat) => ({
                              ...seat,
                              status: 'available' as const,
                            })),
                          })),
                        })),
                      }}
                    />
                  </>
                )}
              </Resource>
            </Form>
          )}
        </Resource>
      </Section>
      <Resource value={current}>
        {(map) => (
          <Section variant="card">
            <Heading>{t('Preview')}</Heading>
            <SeatPicker map={map} selected={[]} onChange={() => {}} />
          </Section>
        )}
      </Resource>
    </Section>
  );
}
