import { useContext, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  api,
  ApiError,
  download,
  idempotencyKey,
  query,
  send,
  type Event,
  type Model,
  type Order,
  type Page,
  type Ticket,
} from './api';
import { date, LanguageContext, money, useT } from './i18n';
import { useUser } from './auth';
import {
  Action,
  ErrorNotice,
  Form,
  List,
  Pager,
  Resource,
  SupportLink,
  text,
  useResource,
} from './ui';

export function EventCard({ event, organizer = false }: { event: Event; organizer?: boolean }) {
  const t = useT();
  return (
    <article className="card event-card">
      <div className="event-cover">
        {event.imageUrl ? (
          <img src={event.imageUrl} alt="" loading="lazy" />
        ) : (
          <span aria-hidden="true">BF</span>
        )}
      </div>
      <div className="event-body">
        <small>{date(event.startsAt, event.timeZone)}</small>
        <h2>
          <Link to={organizer ? `/organizer/events/${event.id}` : `/events/${event.id}`}>
            {event.title}
          </Link>
        </h2>
        <p className="muted">
          {event.venueName} · {event.city}
        </p>
        <span className="badge">{t(event.status)}</span>
        {!organizer && (
          <p>
            {event.ticketTypes?.length
              ? money({
                  amount: Math.min(...event.ticketTypes.map((type) => type.price.amount)),
                  currency: 'KZT',
                })
              : '—'}
          </p>
        )}
      </div>
    </article>
  );
}
export function EventsPage() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') || 1);
  const resource = useResource<Page<Event>>(`/events?${params}`);
  return (
    <>
      <div className="hero">
        <p className="eyebrow">BiletFlow · Kazakhstan</p>
        <h1>{t('Find your next event')}</h1>
        <p>{t('Discover events across Kazakhstan.')}</p>
      </div>
      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setParams({ q: text(data, 'q'), city: text(data, 'city') });
        }}
      >
        <label>
          {t('Search')}
          <input name="q" defaultValue={params.get('q') || ''} />
        </label>
        <label>
          {t('City')}
          <input name="city" defaultValue={params.get('city') || ''} />
        </label>
        <button type="submit" className="primary">
          {t('Search')}
        </button>
      </form>
      <Resource value={resource}>
        {(data) => (
          <>
            <div className="grid">
              {data.data.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
            {!data.data.length && <p className="empty">{t('No results')}</p>}
            <Pager
              page={page}
              total={data.total}
              onChange={(p) => {
                const next = new URLSearchParams(params);
                next.set('page', String(p));
                setParams(next);
              }}
            />
          </>
        )}
      </Resource>
    </>
  );
}
export function Calendar({ event }: { event: Event }) {
  const t = useT();
  return event.calendarLinks ? (
    <div className="actions">
      <span>{t('Calendar')}:</span>
      <a href={event.calendarLinks.ics}>.ics</a>
      <a target="_blank" rel="noreferrer" href={event.calendarLinks.google}>
        Google
      </a>
      <a target="_blank" rel="noreferrer" href={event.calendarLinks.outlook}>
        Outlook
      </a>
    </div>
  ) : null;
}
export function EventDetails({ event }: { event: Event }) {
  return (
    <>
      <h1>{event.title}</h1>
      <p>
        {date(event.startsAt, event.timeZone)} — {date(event.endsAt, event.timeZone)} ·{' '}
        {event.timeZone}
      </p>
      <p>
        {event.venueName} · {event.address} · {event.city}
      </p>
      {event.imageUrl && <img className="event-image" src={event.imageUrl} alt="" />}
      <p className="pre-wrap">{event.description}</p>
      <Calendar event={event} />
    </>
  );
}
export function SeatPicker({
  map,
  selected,
  onChange,
  blocked = false,
}: {
  map: Model<'SeatMap'>;
  selected: string[];
  onChange: (ids: string[]) => void;
  blocked?: boolean;
}) {
  const t = useT();
  return (
    <>
      <p>
        <span className="badge">{t('Available')}</span> · {t('Selected')} ✓ · {t('Held')} H ·{' '}
        {t('Sold')} S · {t('Unavailable')} × · {t('Accessible')} ♿
      </p>
      {map.sections?.map((section) => (
        <section className="seat-section" key={section.name}>
          <h3>{section.name}</h3>
          {section.rows?.map((row) => (
            <div className="seat-row" key={row.label}>
              <span>{row.label}</span>
              {row.seats?.map((seat) => {
                const chosen = selected.includes(seat.id);
                const status = {
                  available: 'Available',
                  held: 'Held',
                  sold: 'Sold',
                  unavailable: 'Unavailable',
                }[seat.status];
                const label = `${section.name} ${row.label} ${seat.number}, ${t(status)}, ${money(seat.price)}${seat.accessible ? `, ${t('Accessible')}` : ''}`;
                return (
                  <button
                    type="button"
                    key={seat.id}
                    className={`seat ${chosen ? 'selected' : seat.status}`}
                    disabled={
                      !blocked &&
                      (seat.status !== 'available' || (!chosen && selected.length >= 20))
                    }
                    aria-label={label}
                    title={label}
                    aria-pressed={chosen}
                    onClick={() =>
                      onChange(
                        chosen ? selected.filter((id) => id !== seat.id) : [...selected, seat.id],
                      )
                    }
                  >
                    {seat.number}
                    {chosen
                      ? ' ✓'
                      : seat.status === 'held'
                        ? ' H'
                        : seat.status === 'sold'
                          ? ' S'
                          : seat.status === 'unavailable'
                            ? ' ×'
                            : ''}
                    {seat.accessible ? ' ♿' : ''}
                  </button>
                );
              })}
            </div>
          ))}
        </section>
      ))}
      <p>
        {t('Selected')}: {selected.length}
      </p>
    </>
  );
}
export function EventPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const campaign = params.get('campaign') || undefined;
  const resource = useResource<Event>(`/events/${id}${query({ campaignToken: campaign })}`);
  return (
    <Resource value={resource}>
      {(event) => <EventPurchase key={id} event={event} campaign={campaign} />}
    </Resource>
  );
}
function EventPurchase({ event, campaign }: { event: Event; campaign?: string }) {
  const t = useT();
  const language = useContext(LanguageContext);
  const navigate = useNavigate();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [seats, setSeats] = useState<string[]>([]);
  const [details, setDetails] = useState(false);
  const map = useResource<Model<'SeatMap'>>(
    event.venueId ? `/events/${event.id}/seats${query({ campaignToken: campaign })}` : null,
    5000,
  );
  useEffect(() => {
    if (!map.data) return;
    const available = new Set(
      map.data.sections.flatMap((section) =>
        section.rows.flatMap((row) =>
          row.seats.filter((seat) => seat.status === 'available').map((seat) => seat.id),
        ),
      ),
    );
    if (seats.some((id) => !available.has(id))) {
      setSeats((current) => current.filter((id) => available.has(id)));
      setDetails(false);
    }
  }, [map.data, seats]);
  const count = event.venueId ? seats.length : Object.values(quantities).reduce((a, b) => a + b, 0);
  const mapSeats =
    map.data?.sections?.flatMap((s) => s.rows?.flatMap((r) => r.seats || []) || []) || [];
  const estimate = event.venueId
    ? mapSeats.filter((s) => seats.includes(s.id)).reduce((n, s) => n + (s.price?.amount || 0), 0)
    : (event.ticketTypes || []).reduce(
        (n, type) => n + (quantities[type.id] || 0) * type.price.amount,
        0,
      );
  return (
    <>
      <Link className="back" to="/">
        ← {t('Events')}
      </Link>
      <div className="two-col">
        <section>
          <EventDetails event={event} />
          {event.refundPolicy && (
            <>
              <h2>{t('Refund policy')}</h2>
              <p className="pre-wrap">{event.refundPolicy}</p>
            </>
          )}
          <div className="actions">
            <SupportLink eventId={event.id} />
          </div>
          <details>
            <summary>{t('Report event')}</summary>
            <Form
              fields={[{ name: 'reason', label: 'Reason', required: true, type: 'textarea' }]}
              submit="Report event"
              onSubmit={async (data) => {
                await send(`/events/${event.id}/reports`, { reason: text(data, 'reason') });
              }}
            />
          </details>
        </section>
        <section className="card">
          <h2>{t(event.venueId ? 'Choose seats' : 'Choose tickets')}</h2>
          {event.appliedPromo && (
            <div className="notice success">
              {t('Promo code')}: {event.appliedPromo.code} ·{' '}
              {event.appliedPromo.discountType === 'percentage'
                ? `${event.appliedPromo.percentOff}%`
                : money(event.appliedPromo.amountOff)}
            </div>
          )}
          {event.promoError && (
            <ErrorNotice
              error={new ApiError(422, event.promoError.code!, event.promoError.message!)}
            />
          )}
          {event.venueId ? (
            <Resource value={map}>
              {(data) => (
                <SeatPicker
                  map={data}
                  selected={seats}
                  onChange={(ids) => {
                    setSeats(ids);
                    setDetails(false);
                  }}
                />
              )}
            </Resource>
          ) : (
            <div className="stack">
              {event.ticketTypes?.map((type) => (
                <label className="card" key={type.id}>
                  <strong>
                    {type.name} · {type.price.amount ? money(type.price) : t('Free')}
                  </strong>
                  <small>{type.description}</small>
                  <small>
                    {t('Available')}: {type.available}
                  </small>
                  <input
                    className="ticket-count"
                    aria-label={`${type.name} — ${t('Quantity')}`}
                    type="number"
                    min="0"
                    max={Math.min(type.available, type.maxPerOrder || 100)}
                    value={quantities[type.id] || 0}
                    disabled={!type.onSale}
                    onChange={(e) => {
                      setQuantities({
                        ...quantities,
                        [type.id]: Math.min(
                          type.available,
                          type.maxPerOrder || 100,
                          Math.max(0, Math.floor(Number(e.target.value))),
                        ),
                      });
                      setDetails(false);
                    }}
                  />
                </label>
              ))}
            </div>
          )}
          <p className="total">
            {t('Subtotal')}: {money({ amount: estimate, currency: 'KZT' })}
          </p>
          {!details && (
            <button
              className="primary"
              disabled={count < 1 || count > 100 || !!event.promoError}
              onClick={() => setDetails(true)}
            >
              {t('Continue')}
            </button>
          )}
          {details && (
            <>
              <h3>{t('Attendee details')}</h3>
              <Form
                key={count}
                submit="Continue"
                fields={Array.from({ length: count }, (_, i) => [
                  { name: `name${i}`, label: `${t('Full name')} ${i + 1}`, required: true },
                  {
                    name: `email${i}`,
                    label: `${t('Email')} ${i + 1}`,
                    type: 'email',
                    required: true,
                  },
                  { name: `phone${i}`, label: `${t('Phone')} ${i + 1}`, type: 'tel' },
                ]).flat()}
                onSubmit={async (data) => {
                  try {
                    const checkout = await send<Model<'CheckoutSession'>>('/checkout/sessions', {
                      eventId: event.id,
                      ...(event.venueId
                        ? { seatIds: seats }
                        : {
                            items: Object.entries(quantities)
                              .filter(([, n]) => n > 0)
                              .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity })),
                          }),
                      attendees: Array.from({ length: count }, (_, i) => ({
                        fullName: text(data, `name${i}`),
                        email: text(data, `email${i}`),
                        phone: text(data, `phone${i}`) || undefined,
                      })),
                      campaignToken: campaign,
                      language,
                    });
                    navigate(`/checkout/${checkout.id}`);
                  } catch (e) {
                    map.reload();
                    throw e;
                  }
                }}
              />
            </>
          )}
        </section>
      </div>
    </>
  );
}
export function CheckoutPage() {
  const { id } = useParams();
  const t = useT();
  const navigate = useNavigate();
  const resource = useResource<Model<'CheckoutSession'>>(`/checkout/sessions/${id}`);
  const [now, setNow] = useState(Date.now());
  const [confirmKey, setConfirmKey] = useState(() => {
    const key = sessionStorage.getItem(`checkout-key:${id}`) || idempotencyKey();
    sessionStorage.setItem(`checkout-key:${id}`, key);
    return key;
  });
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <>
      <h1>{t('Checkout')}</h1>
      {resource.error instanceof ApiError && resource.error.status === 410 && (
        <Link className="button" to="/">
          {t('Start again')}
        </Link>
      )}
      <Resource value={resource}>
        {(checkout) => {
          const remaining = Math.max(
            0,
            Math.ceil((new Date(checkout.expiresAt).getTime() - now) / 1000),
          );
          return (
            <div className="two-col">
              <section className="card">
                <h2>{t('Tickets')}</h2>
                {checkout.items?.map((item) => (
                  <p key={item.ticketTypeId}>
                    {item.ticketTypeName} × {item.quantity} · {money(item.unitPrice)}
                  </p>
                ))}
                <p role="timer">
                  {t('Time remaining')}: {Math.floor(remaining / 60)}:
                  {String(remaining % 60).padStart(2, '0')}
                </p>
                <p>
                  {t('Subtotal')}: {money(checkout.subtotal)}
                </p>
                <p>
                  {t('Discount')}: {money(checkout.discount)}
                </p>
                <p>
                  {t('Processing fee')}: {money(checkout.processingFee)}
                </p>
                <p className="total">
                  {t('Total')}: {money(checkout.total)}
                </p>
                {checkout.appliedPromo && (
                  <p>
                    {t('Promo code')}: {checkout.appliedPromo.code}
                  </p>
                )}
                <Form
                  fields={[{ name: 'code', label: 'Promo code', required: true }]}
                  submit="Apply"
                  onSubmit={async (data) => {
                    await send(
                      `/checkout/sessions/${id}/promo-code`,
                      { code: text(data, 'code') },
                      'PUT',
                    );
                    resource.reload();
                  }}
                />
                <div className="actions">
                  <Action
                    run={async () => {
                      await api(`/checkout/sessions/${id}`, { method: 'DELETE' });
                      navigate(`/events/${checkout.eventId}`);
                    }}
                  >
                    {t('Cancel')}
                  </Action>
                </div>
              </section>
              <section className="card">
                {remaining === 0 || checkout.status !== 'open' ? (
                  <>
                    <p className="notice">{t('Your hold expired. Start again.')}</p>
                    <Link to={`/events/${checkout.eventId}`}>{t('Start again')}</Link>
                  </>
                ) : (
                  <>
                    {checkout.requiresPayment && (
                      <p className="notice">
                        {t('Payment simulation — no real money is charged.')}
                      </p>
                    )}
                    <Form
                      fields={[
                        { name: 'contactEmail', label: 'Email', type: 'email', required: true },
                        ...(checkout.requiresPayment
                          ? [
                              {
                                name: 'paymentMethodToken',
                                label: 'Payment result',
                                options: [
                                  { value: 'tok_success', label: 'Success' },
                                  { value: 'tok_declined', label: 'Declined' },
                                  { value: 'tok_insufficient_funds', label: 'Insufficient funds' },
                                ],
                              },
                            ]
                          : []),
                      ]}
                      submit="Confirm order"
                      onSubmit={async (data) => {
                        try {
                          const order = await send<Order>(
                            `/checkout/sessions/${id}/confirm`,
                            {
                              contactEmail: text(data, 'contactEmail'),
                              ...(checkout.requiresPayment
                                ? { paymentMethodToken: text(data, 'paymentMethodToken') }
                                : {}),
                            },
                            'POST',
                            confirmKey,
                          );
                          sessionStorage.setItem(`order:${order.id}`, JSON.stringify(order));
                          navigate(`/orders/${order.id}`);
                        } catch (e) {
                          // A definite decline permits a new payment attempt. Network retries keep the key.
                          if (e instanceof ApiError && e.status === 402) {
                            const key = idempotencyKey();
                            sessionStorage.setItem(`checkout-key:${id}`, key);
                            setConfirmKey(key);
                          }
                          throw e;
                        }
                      }}
                    />
                  </>
                )}
              </section>
            </div>
          );
        }}
      </Resource>
    </>
  );
}
export function TicketCard({ ticket }: { ticket: Ticket }) {
  const t = useT();
  const user = useUser();
  return (
    <article className="card">
      <h3>
        {ticket.ticketTypeName} · {ticket.attendee?.fullName}
      </h3>
      <p>
        {ticket.ticketNumber} · <span className="badge">{t(ticket.status)}</span>
      </p>
      {ticket.seat && (
        <p>
          {ticket.seat.section} · {ticket.seat.row} · {ticket.seat.number}
          {ticket.seat.accessible && ' ♿'}
        </p>
      )}
      <div className="actions">
        {!['cancelled', 'refunded'].includes(ticket.status) &&
          (user ? (
            <Action
              run={() => download(`/me/tickets/${ticket.id}/pdf`, `${ticket.ticketNumber}.pdf`)}
            >
              {t('Download PDF')}
            </Action>
          ) : (
            <Link to={`/login?next=/orders/${ticket.orderId}`}>
              {t('Sign in')} · {t('Download PDF')}
            </Link>
          ))}
        <SupportLink ticketId={ticket.id} />
      </div>
      <small>{t('Print the downloaded PDF at 100% scale.')}</small>
    </article>
  );
}
export function OrdersPage() {
  const t = useT();
  const [page, setPage] = useState(1);
  const resource = useResource<Page<Order>>(`/me/orders?page=${page}`);
  return (
    <>
      <h1>{t('My orders')}</h1>
      <Resource value={resource}>
        {(data) => (
          <>
            <List
              items={data.data}
              render={(order) => (
                <>
                  <h2>
                    <Link to={`/orders/${order.id}`}>{order.eventTitle}</Link>
                  </h2>
                  <p>
                    {order.orderNumber} · {money(order.total)} · {t(order.status)}
                  </p>
                </>
              )}
            />
            <Pager page={page} total={data.total} onChange={setPage} />
          </>
        )}
      </Resource>
    </>
  );
}
export function OrderPage() {
  const { id } = useParams();
  const t = useT();
  const user = useUser();
  const resource = useResource<Order>(`/me/orders/${id}`);
  const cached: Order | null = (() => {
    try {
      return JSON.parse(sessionStorage.getItem(`order:${id}`) || 'null');
    } catch {
      return null;
    }
  })();
  const order = resource.data || (!user ? cached : null);
  const event = useResource<Event>(order ? `/events/${order.eventId}` : null);
  if (!order) return <Resource value={resource}>{() => null}</Resource>;
  return (
    <>
      <h1>{t(order.status === 'confirmed' ? 'Order confirmed' : 'Orders')}</h1>
      <p>
        {order.eventTitle} · {order.orderNumber} · {t(order.status)}
      </p>
      <p className="total">
        {t('Total')}: {money(order.total)}
      </p>
      <p>
        {t('Tickets were sent by email. Sign in with a verified email to find this order later.')}
      </p>
      {order.payment && (
        <p className="notice">{t('Payment simulation — no real money is charged.')}</p>
      )}
      {event.data && <Calendar event={event.data} />}
      <div className="actions">
        <SupportLink orderId={order.id} />
      </div>
      <div className="grid">
        {order.tickets?.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} />
        ))}
      </div>
    </>
  );
}
export function TicketPage() {
  const { id } = useParams();
  const resource = useResource<Ticket>(`/me/tickets/${id}`);
  return <Resource value={resource}>{(ticket) => <TicketCard ticket={ticket} />}</Resource>;
}
