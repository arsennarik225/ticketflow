import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ApiError, type Model, type Ticket, type User } from './api';
import { AuthContext, RequireAuth } from './auth';
import { CheckoutPage, SeatPicker, TicketCard, TicketPage, TicketsPage } from './events';
import { LanguageContext } from './i18n';
import { SupportPage } from './support';
import { useResource } from './ui';

vi.mock('./ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./ui')>()),
  useResource: vi.fn(),
}));
beforeEach(() => {
  vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {} });
  vi.mocked(useResource).mockReturnValue({
    data: null,
    error: null,
    loading: false,
    reload: vi.fn(),
  });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const attendee: User = {
  id: 'attendee-1',
  email: 'attendee@example.test',
  fullName: 'Test Attendee',
  emailVerified: true,
  roles: ['attendee'],
};
const ticket: Ticket = {
  id: 'ticket-1',
  ticketNumber: 'BF-123',
  orderId: 'order-1',
  status: 'valid',
  qrPayload: 'BILETFLOW:TICKET:ticket-1:signed-payload',
  eventTitle: 'Jazz Night',
  eventStartsAt: '2026-12-10T14:00:00Z',
  venueName: 'Concert Hall',
  ticketTypeName: 'Standard',
  attendee: { fullName: 'Test Attendee', email: attendee.email },
  seat: { section: 'Parterre', row: 'A', number: 5, accessible: false },
};

function ticketMarkup(value: Ticket, showQr = true, user: User | null = attendee) {
  return renderToStaticMarkup(
    <LanguageContext.Provider value="en">
      <AuthContext.Provider value={user}>
        <MemoryRouter>
          <TicketCard ticket={value} showQr={showQr} />
        </MemoryRouter>
      </AuthContext.Provider>
    </LanguageContext.Provider>,
  );
}

it('a valid phone ticket displays a scannable QR, event, attendee and assigned seat', () => {
  const html = ticketMarkup(ticket);
  expect(html).toContain('aria-label="Ticket QR code"');
  expect(html).toContain('shape-rendering="crispEdges"');
  expect(html).toContain('fill="#fff"');
  expect(html).toContain('Show this QR code at the entrance.');
  for (const value of ['Jazz Night', 'Test Attendee', 'BF-123', 'Parterre', 'Concert Hall']) {
    expect(html).toContain(value);
  }
  expect(html).not.toContain('href="/tickets/ticket-1"');
});

it.each(['cancelled', 'refunded', 'checked_in'] as const)(
  '%s tickets have no admission QR or Show QR link',
  (status) => {
    const html = ticketMarkup({ ...ticket, status });
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('Show QR');
    expect(html).toContain(
      status === 'checked_in' ? 'already been used' : 'cannot be used for entry',
    );
  },
);

it('signed-in buyers can open the QR screen from an order; guests are asked to sign in', () => {
  expect(ticketMarkup(ticket, false)).toContain('href="/tickets/ticket-1"');
  const guest = ticketMarkup(ticket, false, null);
  expect(guest).not.toContain('href="/tickets/ticket-1"');
  expect(guest).not.toContain('<svg');
  expect(guest).toContain('href="/login?next=/orders/order-1"');
});

it('My tickets reuses the paginated orders API and shows links to each ticket', () => {
  vi.mocked(useResource).mockReturnValue({
    data: { data: [{ id: 'order-1', tickets: [ticket] }], total: 21 },
    error: null,
    loading: false,
    reload: vi.fn(),
  });
  const html = renderToStaticMarkup(
    <LanguageContext.Provider value="en">
      <AuthContext.Provider value={attendee}>
        <MemoryRouter>
          <TicketsPage />
        </MemoryRouter>
      </AuthContext.Provider>
    </LanguageContext.Provider>,
  );
  expect(useResource).toHaveBeenCalledWith('/me/orders?page=1');
  expect(html).toContain('My tickets');
  expect(html).toContain('href="/tickets/ticket-1"');
  expect(html).toContain('Next');
});

it.each(['attendee', 'organizer', 'platform_admin', 'event_admin'] as const)(
  'the ticket screen accepts a signed-in %s account',
  (role) => {
    vi.mocked(useResource).mockReturnValue({
      data: ticket,
      error: null,
      loading: false,
      reload: vi.fn(),
    });
    const html = renderToStaticMarkup(
      <LanguageContext.Provider value="en">
        <AuthContext.Provider value={{ ...attendee, roles: [role] }}>
          <MemoryRouter initialEntries={['/tickets/ticket-1']}>
            <Routes>
              <Route
                path="/tickets/:id"
                element={
                  <RequireAuth>
                    <TicketPage />
                  </RequireAuth>
                }
              />
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </LanguageContext.Provider>,
    );
    expect(useResource).toHaveBeenCalledWith('/me/tickets/ticket-1');
    expect(html).toContain('aria-label="Ticket QR code"');
    expect(html).toContain('href="/tickets"');
  },
);

it('All support filters omit empty enums while retaining event context', () => {
  renderToStaticMarkup(
    <MemoryRouter initialEntries={['/support?status=&handledBy=&eventId=event-1']}>
      <SupportPage />
    </MemoryRouter>,
  );
  const path = vi.mocked(useResource).mock.calls[0][0]!;
  const params = new URL(path, 'https://example.test').searchParams;
  expect(params.has('status')).toBe(false);
  expect(params.has('handledBy')).toBe(false);
  expect(params.get('eventId')).toBe('event-1');
});

it('an already-expired checkout offers a way to start again after a page reload', () => {
  vi.mocked(useResource).mockReturnValue({
    data: null,
    error: new ApiError(410, 'checkout_expired', 'Expired'),
    loading: false,
    reload: vi.fn(),
  });
  const html = renderToStaticMarkup(
    <LanguageContext.Provider value="en">
      <MemoryRouter initialEntries={['/checkout/expired']}>
        <Routes>
          <Route path="/checkout/:id" element={<CheckoutPage />} />
        </Routes>
      </MemoryRouter>
    </LanguageContext.Provider>,
  );
  expect(html).toContain('href="/"');
  expect(html).toContain('Start again');
});

it('seat selection respects the API limit without locking selected seats', () => {
  const map: Model<'SeatMap'> = {
    eventId: 'e',
    venueId: 'v',
    venueName: 'Hall',
    sections: [
      {
        name: 'Floor',
        rows: [
          {
            label: 'A',
            seats: Array.from({ length: 21 }, (_, i) => ({
              id: String(i),
              number: i + 1,
              status: 'available',
              priceCategory: 'standard',
              accessible: false,
            })),
          },
        ],
      },
    ],
  };
  const html = renderToStaticMarkup(
    <SeatPicker
      map={map}
      selected={Array.from({ length: 20 }, (_, i) => String(i))}
      onChange={() => {}}
    />,
  );
  expect(html.match(/disabled=""/g)).toHaveLength(1);
  expect(html.match(/aria-pressed="true"/g)).toHaveLength(20);
});
