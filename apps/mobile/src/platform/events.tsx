import {
  Caption,
  CoverImage,
  Disclosure,
  ExternalLink,
  FieldLabel,
  FormContainer,
  Heading,
  Inline,
  Input,
  NativeButton,
  Paragraph,
  Section,
  Strong,
  Summary,
  Title,
} from './native';
import { flowStorage } from './storage';
import { FormValues } from './forms';
import { useContext, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from './navigation';
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
import { TicketQr } from './TicketQr';
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
    <Section variant="card event-card">
      <Section variant="event-cover">
        {event.imageUrl ? (
          <CoverImage src={event.imageUrl} alt="" loading="lazy" />
        ) : (
          <Inline aria-hidden="true">BF</Inline>
        )}
      </Section>
      <Section variant="event-body">
        <Caption>{date(event.startsAt, event.timeZone)}</Caption>
        <Heading>
          <Link to={organizer ? `/organizer/events/${event.id}` : `/events/${event.id}`}>
            {event.title}
          </Link>
        </Heading>
        <Paragraph variant="muted">
          {event.venueName} · {event.city}
        </Paragraph>
        <Inline variant="badge">{t(event.status)}</Inline>
        {!organizer && (
          <Paragraph>
            {event.ticketTypes?.length
              ? money({
                  amount: Math.min(...event.ticketTypes.map((type) => type.price.amount)),
                  currency: 'KZT',
                })
              : '—'}
          </Paragraph>
        )}
      </Section>
    </Section>
  );
}
export function EventsPage() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') || 1);
  const resource = useResource<Page<Event>>(`/events?${params}`);
  return (
    <>
      <Section variant="hero">
        <Paragraph variant="eyebrow">BiletFlow · Kazakhstan</Paragraph>
        <Title>{t('Find your next event')}</Title>
        <Paragraph>{t('Discover events across Kazakhstan.')}</Paragraph>
      </Section>
      <FormContainer
        variant="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormValues(e.currentTarget);
          setParams({ q: text(data, 'q'), city: text(data, 'city') });
        }}
      >
        <FieldLabel>
          {t('Search')}
          <Input name="q" defaultValue={params.get('q') || ''} />
        </FieldLabel>
        <FieldLabel>
          {t('City')}
          <Input name="city" defaultValue={params.get('city') || ''} />
        </FieldLabel>
        <NativeButton type="submit" variant="primary">
          {t('Search')}
        </NativeButton>
      </FormContainer>
      <Resource value={resource}>
        {(data) => (
          <>
            <Section variant="grid">
              {data.data.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </Section>
            {!data.data.length && <Paragraph variant="empty">{t('No results')}</Paragraph>}
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
    <Section variant="actions">
      <Inline>{t('Calendar')}:</Inline>
      <Action run={() => download(`/events/${event.id}/calendar.ics`, `event-${event.id}.ics`)}>
        .ics
      </Action>
      <ExternalLink target="_blank" rel="noreferrer" href={event.calendarLinks.google}>
        Google
      </ExternalLink>
      <ExternalLink target="_blank" rel="noreferrer" href={event.calendarLinks.outlook}>
        Outlook
      </ExternalLink>
    </Section>
  ) : null;
}
export function EventDetails({ event }: { event: Event }) {
  return (
    <>
      <Title>{event.title}</Title>
      <Paragraph>
        {date(event.startsAt, event.timeZone)} — {date(event.endsAt, event.timeZone)} ·{' '}
        {event.timeZone}
      </Paragraph>
      <Paragraph>
        {event.venueName} · {event.address} · {event.city}
      </Paragraph>
      {event.imageUrl && <CoverImage variant="event-image" src={event.imageUrl} alt="" />}
      <Paragraph variant="pre-wrap">{event.description}</Paragraph>
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
      <Paragraph>
        <Inline variant="badge">{t('Available')}</Inline> · {t('Selected')} ✓ · {t('Held')} H ·{' '}
        {t('Sold')} S · {t('Unavailable')} × · {t('Accessible')} ♿
      </Paragraph>
      {map.sections?.map((section) => (
        <Section variant="seat-section" key={section.name}>
          <Heading>{section.name}</Heading>
          {section.rows?.map((row) => (
            <Section variant="seat-row" key={row.label}>
              <Inline>{row.label}</Inline>
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
                  <NativeButton
                    type="button"
                    key={seat.id}
                    variant={`seat ${chosen ? 'selected' : seat.status}`}
                    disabled={
                      !blocked &&
                      (seat.status !== 'available' || (!chosen && selected.length >= 20))
                    }
                    aria-label={label}
                    title={label}
                    aria-pressed={chosen}
                    onPress={() =>
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
                  </NativeButton>
                );
              })}
            </Section>
          ))}
        </Section>
      ))}
      <Paragraph>
        {t('Selected')}: {selected.length}
      </Paragraph>
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
      <Link variant="back" to="/">
        ← {t('Events')}
      </Link>
      <Section variant="two-col">
        <Section>
          <EventDetails event={event} />
          {event.refundPolicy && (
            <>
              <Heading>{t('Refund policy')}</Heading>
              <Paragraph variant="pre-wrap">{event.refundPolicy}</Paragraph>
            </>
          )}
          <Section variant="actions">
            <SupportLink eventId={event.id} />
          </Section>
          <Disclosure>
            <Summary>{t('Report event')}</Summary>
            <Form
              fields={[{ name: 'reason', label: 'Reason', required: true, type: 'textarea' }]}
              submit="Report event"
              onSubmit={async (data) => {
                await send(`/events/${event.id}/reports`, { reason: text(data, 'reason') });
              }}
            />
          </Disclosure>
        </Section>
        <Section variant="card">
          <Heading>{t(event.venueId ? 'Choose seats' : 'Choose tickets')}</Heading>
          {event.appliedPromo && (
            <Section variant="notice success">
              {t('Promo code')}: {event.appliedPromo.code} ·{' '}
              {event.appliedPromo.discountType === 'percentage'
                ? `${event.appliedPromo.percentOff}%`
                : money(event.appliedPromo.amountOff)}
            </Section>
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
            <Section variant="stack">
              {event.ticketTypes?.map((type) => (
                <FieldLabel variant="card" key={type.id}>
                  <Strong>
                    {type.name} · {type.price.amount ? money(type.price) : t('Free')}
                  </Strong>
                  <Caption>{type.description}</Caption>
                  <Caption>
                    {t('Available')}: {type.available}
                  </Caption>
                  <Input
                    variant="ticket-count"
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
                </FieldLabel>
              ))}
            </Section>
          )}
          <Paragraph variant="total">
            {t('Subtotal')}: {money({ amount: estimate, currency: 'KZT' })}
          </Paragraph>
          {!details && (
            <NativeButton
              variant="primary"
              disabled={count < 1 || count > 100 || !!event.promoError}
              onPress={() => setDetails(true)}
            >
              {t('Continue')}
            </NativeButton>
          )}
          {details && (
            <>
              <Heading>{t('Attendee details')}</Heading>
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
        </Section>
      </Section>
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
    const key = flowStorage.getItem(`checkout-key:${id}`) || idempotencyKey();
    flowStorage.setItem(`checkout-key:${id}`, key);
    return key;
  });
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <>
      <Title>{t('Checkout')}</Title>
      {resource.error instanceof ApiError && resource.error.status === 410 && (
        <Link variant="button" to="/">
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
            <Section variant="two-col">
              <Section variant="card">
                <Heading>{t('Tickets')}</Heading>
                {checkout.items?.map((item) => (
                  <Paragraph key={item.ticketTypeId}>
                    {item.ticketTypeName} × {item.quantity} · {money(item.unitPrice)}
                  </Paragraph>
                ))}
                <Paragraph role="timer">
                  {t('Time remaining')}: {Math.floor(remaining / 60)}:
                  {String(remaining % 60).padStart(2, '0')}
                </Paragraph>
                <Paragraph>
                  {t('Subtotal')}: {money(checkout.subtotal)}
                </Paragraph>
                <Paragraph>
                  {t('Discount')}: {money(checkout.discount)}
                </Paragraph>
                <Paragraph>
                  {t('Processing fee')}: {money(checkout.processingFee)}
                </Paragraph>
                <Paragraph variant="total">
                  {t('Total')}: {money(checkout.total)}
                </Paragraph>
                {checkout.appliedPromo && (
                  <Paragraph>
                    {t('Promo code')}: {checkout.appliedPromo.code}
                  </Paragraph>
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
                <Section variant="actions">
                  <Action
                    run={async () => {
                      await api(`/checkout/sessions/${id}`, { method: 'DELETE' });
                      navigate(`/events/${checkout.eventId}`);
                    }}
                  >
                    {t('Cancel')}
                  </Action>
                </Section>
              </Section>
              <Section variant="card">
                {remaining === 0 || checkout.status !== 'open' ? (
                  <>
                    <Paragraph variant="notice">{t('Your hold expired. Start again.')}</Paragraph>
                    <Link to={`/events/${checkout.eventId}`}>{t('Start again')}</Link>
                  </>
                ) : (
                  <>
                    {checkout.requiresPayment && (
                      <Paragraph variant="notice">
                        {t('Payment simulation — no real money is charged.')}
                      </Paragraph>
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
                          flowStorage.setItem(`order:${order.id}`, JSON.stringify(order));
                          navigate(`/orders/${order.id}`);
                        } catch (e) {
                          // A definite decline permits a new payment attempt. Network retries keep the key.
                          if (e instanceof ApiError && e.status === 402) {
                            const key = idempotencyKey();
                            flowStorage.setItem(`checkout-key:${id}`, key);
                            setConfirmKey(key);
                          }
                          throw e;
                        }
                      }}
                    />
                  </>
                )}
              </Section>
            </Section>
          );
        }}
      </Resource>
    </>
  );
}
export function TicketCard({ ticket, showQr = false }: { ticket: Ticket; showQr?: boolean }) {
  const t = useT();
  const user = useUser();
  return (
    <Section variant="card ticket-card">
      {ticket.eventTitle && <Heading>{ticket.eventTitle}</Heading>}
      <Heading>
        {ticket.ticketTypeName} · {ticket.attendee?.fullName}
      </Heading>
      <Paragraph>
        {ticket.ticketNumber} · <Inline variant="badge">{t(ticket.status)}</Inline>
      </Paragraph>
      {ticket.seat && (
        <Paragraph>
          {ticket.seat.section} · {ticket.seat.row} · {ticket.seat.number}
          {ticket.seat.accessible && ' ♿'}
        </Paragraph>
      )}
      {showQr && ticket.eventStartsAt && <Paragraph>{date(ticket.eventStartsAt)}</Paragraph>}
      {showQr && ticket.venueName && <Paragraph>{ticket.venueName}</Paragraph>}
      {showQr && ticket.status === 'valid' && <TicketQr payload={ticket.qrPayload} />}
      {showQr && ticket.status !== 'valid' && (
        <Paragraph variant="notice">
          {t(
            ticket.status === 'checked_in'
              ? 'This ticket has already been used.'
              : 'This ticket cannot be used for entry.',
          )}
        </Paragraph>
      )}
      <Section variant="actions">
        {!showQr && ticket.status === 'valid' && user && (
          <Link variant="button primary" to={`/tickets/${ticket.id}`}>
            {t('Show QR')}
          </Link>
        )}
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
      </Section>
      <Caption>{t('Print the downloaded PDF at 100% scale.')}</Caption>
    </Section>
  );
}
export function TicketsPage() {
  const t = useT();
  const [page, setPage] = useState(1);
  const resource = useResource<Page<Order>>(`/me/orders?page=${page}`);
  return (
    <>
      <Title>{t('My tickets')}</Title>
      <Resource value={resource}>
        {(data) => (
          <>
            <Section variant="grid">
              {data.data
                .flatMap((order) => order.tickets || [])
                .map((ticket) => (
                  <TicketCard key={ticket.id} ticket={ticket} />
                ))}
            </Section>
            {!data.data.some((order) => order.tickets?.length) && (
              <Paragraph variant="empty">{t('No results')}</Paragraph>
            )}
            <Pager page={page} total={data.total} onChange={setPage} />
          </>
        )}
      </Resource>
    </>
  );
}
export function OrdersPage() {
  const t = useT();
  const [page, setPage] = useState(1);
  const resource = useResource<Page<Order>>(`/me/orders?page=${page}`);
  return (
    <>
      <Title>{t('My orders')}</Title>
      <Resource value={resource}>
        {(data) => (
          <>
            <List
              items={data.data}
              render={(order) => (
                <>
                  <Heading>
                    <Link to={`/orders/${order.id}`}>{order.eventTitle}</Link>
                  </Heading>
                  <Paragraph>
                    {order.orderNumber} · {money(order.total)} · {t(order.status)}
                  </Paragraph>
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
      return JSON.parse(flowStorage.getItem(`order:${id}`) || 'null');
    } catch {
      return null;
    }
  })();
  const order = resource.data || (!user ? cached : null);
  const event = useResource<Event>(order ? `/events/${order.eventId}` : null);
  if (!order) return <Resource value={resource}>{() => null}</Resource>;
  return (
    <>
      <Title>{t(order.status === 'confirmed' ? 'Order confirmed' : 'Orders')}</Title>
      <Paragraph>
        {order.eventTitle} · {order.orderNumber} · {t(order.status)}
      </Paragraph>
      <Paragraph variant="total">
        {t('Total')}: {money(order.total)}
      </Paragraph>
      <Paragraph>
        {t('Tickets were sent by email. Sign in with a verified email to find this order later.')}
      </Paragraph>
      {order.payment && (
        <Paragraph variant="notice">
          {t('Payment simulation — no real money is charged.')}
        </Paragraph>
      )}
      {event.data && <Calendar event={event.data} />}
      <Section variant="actions">
        <SupportLink orderId={order.id} />
      </Section>
      <Section variant="grid">
        {order.tickets?.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} />
        ))}
      </Section>
    </>
  );
}
export function TicketPage() {
  const { id } = useParams();
  const t = useT();
  const resource = useResource<Ticket>(`/me/tickets/${id}`);
  return (
    <>
      <Link variant="back" to="/tickets">
        ← {t('My tickets')}
      </Link>
      <Section variant="ticket-page">
        <Resource value={resource}>{(ticket) => <TicketCard ticket={ticket} showQr />}</Resource>
      </Section>
    </>
  );
}
