import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
const optionalDate = (data: FormData, name: string) =>
  text(data, name) ? new Date(text(data, name)).toISOString() : undefined;
const optionalNumber = (data: FormData, name: string) =>
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
      <p className="muted">{t('Date inputs use this device’s time zone.')}</p>
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
      <div className="card">
        <h1>{t('Organizer profile')}</h1>
        <Link to="/account">{t('Organizer profile')}</Link>
      </div>
    );
  return (
    <>
      <div className="toolbar">
        <h1>{t('Organizer')}</h1>
        <Link className="button primary" to="/organizer/events/new">
          + {t('New event')}
        </Link>
      </div>
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
          {['', 'draft', 'upcoming', 'active', 'completed', 'cancelled'].map((s) => (
            <option key={s} value={s}>
              {t(s || 'All')}
            </option>
          ))}
        </select>
      </label>
      <Resource value={resource}>
        {(data) => (
          <>
            <div className="grid">
              {data.data.map((event) => (
                <EventCard key={event.id} event={event} organizer />
              ))}
            </div>
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
      <h1>{t('New event')}</h1>
      <div className="card">
        <EventEditor onSave={(event) => navigate(`/organizer/events/${event.id}`)} />
      </div>
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
          <Link className="back" to="/organizer">
            ← {t('Organizer')}
          </Link>
          <h1>{event.title}</h1>
          <p>
            <span className="badge">{t(event.status)}</span> · {event.city}
          </p>
          <div className="actions">
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
            <button onClick={() => setPreview(!preview)}>{t('Preview')}</button>
            <SupportLink eventId={event.id} />
          </div>
          {preview && (
            <section className="card">
              <EventDetails event={event} />
              <Table
                headers={['Ticket type', 'Price (KZT)', 'Available']}
                rows={(event.ticketTypes || []).map((type) => [
                  type.name,
                  money(type.price),
                  type.available,
                ])}
              />
            </section>
          )}
          <nav className="tabs" aria-label={t('Organizer')}>
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
                <button key={name} aria-pressed={tab === name} onClick={() => setTab(name)}>
                  {t(name)}
                </button>
              ))}
          </nav>
          {tab === 'Overview' && !canWrite && (
            <section className="card">
              <EventDetails event={event} />
            </section>
          )}
          {tab === 'Overview' && canWrite && (
            <div className="two-col">
              <section className="card">
                <h2>{t('Edit event')}</h2>
                <EventEditor
                  key={event.id + event.startsAt}
                  event={event}
                  onSave={resource.reload}
                />
              </section>
              <section className="card">
                <h2>{t('Cancel event')}</h2>
                <Form
                  submit="Cancel event"
                  fields={[{ name: 'reason', label: 'Reason', type: 'textarea', required: true }]}
                  onSubmit={async (data) => {
                    await send(`/organizer/events/${id}/cancel`, { reason: text(data, 'reason') });
                    resource.reload();
                  }}
                />
              </section>
            </div>
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
    <div className="two-col">
      <section className="card">
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
            <button onClick={() => setEditing(type)}>{t('Edit')}</button>,
          ])}
        />
      </section>
      <section className="card">
        <h2>{t(editing ? 'Edit' : 'Add ticket type')}</h2>
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
        {editing && <button onClick={() => setEditing(null)}>{t('Cancel')}</button>}
      </section>
    </div>
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
      <p className="notice">{t('Payment simulation — no real money is charged.')}</p>
      <Resource value={state}>
        {(data) => (
          <div className="card">
            <h2>{t('Activation')}</h2>
            <p>
              {t('Activation fee')}: {money(data.activationFee)}
            </p>
            {Object.entries(data.steps).map(([step, complete]) => (
              <p key={step}>
                {complete ? '✓' : '○'} {t(step)}: {t(complete ? 'Yes' : 'No')}
              </p>
            ))}
            {data.suspendedReason && <p className="notice">{data.suspendedReason}</p>}
            <Action
              confirm="Pay activation fee"
              run={async () => {
                await send(`/organizer/events/${event.id}/activation/pay-fee`);
                update();
              }}
            >
              {t('Pay activation fee')}
            </Action>
          </div>
        )}
      </Resource>
      <div className="grid" style={{ marginTop: '1rem' }}>
        <section className="card">
          <h2>{t('Simulated identity verification')}</h2>
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
        </section>
        <section className="card">
          <h2>{t('Payout account (simulation)')}</h2>
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
        </section>
        <section className="card">
          <p>
            {t(
              'Paid-event terms: this is a simulation. Organizers are responsible for event details and refunds; activation fees are non-refundable.',
            )}
          </p>
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
        </section>
      </div>
    </>
  );
}
function Campaigns({ event }: { event: Event }) {
  const t = useT();
  const resource = useResource<Page<Model<'Campaign'>>>(`/organizer/events/${event.id}/campaigns`);
  const [editing, setEditing] = useState<Model<'Campaign'> | null>(null);
  return (
    <div className="two-col">
      <Resource value={resource}>
        {(data) => (
          <List
            items={data.data}
            render={(campaign) => (
              <>
                <h2>{campaign.name}</h2>
                <p>
                  {t('Promo code')}: <strong>{campaign.code}</strong>
                </p>
                <p className="notice">{t('Campaign QR — NOT A TICKET')}</p>
                <a href={campaign.campaignUrl} target="_blank" rel="noreferrer">
                  {campaign.campaignUrl}
                </a>
                <p>
                  {t('Redemptions')}: {campaign.redemptions} · {t('Sold')}: {campaign.ticketsSold}
                </p>
                <p>
                  {t('Gross sales')}: {money(campaign.grossRevenue)} · {t('Discount')}:{' '}
                  {money(campaign.discountTotal)} · {t('Net revenue')}: {money(campaign.revenue)}
                </p>
                <div className="actions">
                  <Action
                    run={() =>
                      download(`/organizer/campaigns/${campaign.id}/qr`, `${campaign.code}.png`)
                    }
                  >
                    {t('Download campaign QR')}
                  </Action>
                  <button onClick={() => setEditing(campaign)}>{t('Edit')}</button>
                </div>
              </>
            )}
          />
        )}
      </Resource>
      <section className="card">
        <h2>{t('Campaigns')}</h2>
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
          <fieldset>
            <legend>{t('Applicable ticket types')}</legend>
            {event.ticketTypes?.map((type) => (
              <label key={type.id} className="check">
                <span>{type.name}</span>
                <input
                  type="checkbox"
                  name="ticketTypeIds"
                  value={type.id}
                  defaultChecked={editing?.ticketTypeIds?.includes(type.id)}
                />
              </label>
            ))}
          </fieldset>
        </Form>
        {editing && <button onClick={() => setEditing(null)}>{t('Cancel')}</button>}
      </section>
    </div>
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
                <h2>{order.orderNumber}</h2>
                <p>
                  {order.buyerName} · {order.buyerEmail} · {money(order.total)} · {t(order.status)}
                </p>
                {order.tickets?.map((ticket) => (
                  <p key={ticket.id}>
                    {ticket.ticketNumber} · {ticket.attendee?.fullName} · {t(ticket.status)}
                  </p>
                ))}
                {order.status === 'confirmed' && (
                  <details>
                    <summary>
                      {t(order.total.amount > 0 ? 'Refund order' : 'Cancel registration')}
                    </summary>
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
                  </details>
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
      <form
        className="toolbar"
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
    <div className="two-col">
      <Resource value={resource}>
        {(data) => (
          <List
            items={data.data}
            render={(staff) => (
              <>
                <h3>{staff.email}</h3>
                <p>
                  {t('Allow undo')}: {t(staff.canReverseCheckIn ? 'Yes' : 'No')}
                </p>
                <small>{staff.userId}</small>
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
      <section className="card">
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
      </section>
    </div>
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
    <form
      className="toolbar"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        onChange({
          from: optionalDate(form, 'from') || '',
          to: optionalDate(form, 'to') || '',
          ...(action
            ? { action: text(form, 'action') }
            : { ticketTypeId: text(form, 'ticketTypeId') }),
        });
      }}
    >
      <label>
        {t('From')}
        <input type="datetime-local" name="from" />
      </label>
      <label>
        {t('To (exclusive)')}
        <input type="datetime-local" name="to" />
      </label>
      {action ? (
        <label>
          {t('Action')}
          <input name="action" placeholder="check_in" />
        </label>
      ) : (
        <label>
          {t('Ticket type')}
          <select name="ticketTypeId">
            <option value="">{t('All')}</option>
            {ticketTypes?.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <button>{t('Apply')}</button>
    </form>
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
      <p className="notice">{t('Payment simulation — no real money is charged.')}</p>
      <Resource value={resource}>
        {(data) => (
          <>
            <div className="metrics">
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
                <div className="metric" key={label}>
                  {t(String(label))}
                  <strong>{value ?? '—'}</strong>
                </div>
              ))}
            </div>
            <p>
              {t('Sold')}: {data.percentSold}%
            </p>
            <div className="bar">
              <span style={{ width: `${data.percentSold}%` }} />
            </div>
            <h2>{t('Sales over time')}</h2>
            <Table
              headers={['Date', 'Sold', 'Gross sales']}
              rows={(data.salesOverTime || []).map((point) => [
                point.date,
                point.ticketsSold,
                money(point.grossSales),
              ])}
            />
            <h2>{t('Ticket types')}</h2>
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
            <h2>{t('Campaigns')}</h2>
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
    <div className="stack">
      <section className="card">
        <h2>{t('Seating')}</h2>
        <p className="notice">
          {t('This replaces the previous seating configuration. Select seats to keep out of sale.')}
        </p>
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
              <label>
                {t('Venue')}
                <select
                  value={venueId}
                  onChange={(e) => {
                    setVenueId(e.target.value);
                    setBlocked([]);
                  }}
                >
                  <option value="">{t('General admission')}</option>
                  {data.data.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.seatCount})
                    </option>
                  ))}
                </select>
              </label>
              <Resource value={venue}>
                {(layout) => (
                  <>
                    <h3>{t('Block seats')}</h3>
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
      </section>
      <Resource value={current}>
        {(map) => (
          <section className="card">
            <h2>{t('Preview')}</h2>
            <SeatPicker map={map} selected={[]} onChange={() => {}} />
          </section>
        )}
      </Resource>
    </div>
  );
}
