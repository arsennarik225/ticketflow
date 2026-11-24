import { act, fireEvent, render } from '@testing-library/react-native';
import { Linking, Platform, StyleSheet } from 'react-native';
import { Calendar, SeatPicker } from '../platform/events';
import type { Model } from '../platform/api';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../auth/AuthProvider';
import { RootNavigator } from '../navigation/RootNavigator';
import { deferred, harness, response, tokenResponse, user } from './helpers';
import { preferences } from '../platform/storage';
import { Form } from '../platform/ui';
import { LanguageContext } from '../platform/i18n';
import { eventPath, incomingPath } from '../platform/navigation';
import { FormValues } from '../platform/forms';
import { api, bindSession, download, idempotencyKey, send } from '../platform/api';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: 'file:///cache' } }));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(),
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'test-idempotency-key') }));
jest.mock('react-native-qrcode-svg', () => 'TicketQRCode');
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('../platform/storage', () => ({
  ...jest.requireActual('../platform/storage'),
  loadLanguage: jest.fn(async () => 'en'),
  saveLanguage: jest.fn(async () => {}),
}));
jest.setTimeout(30000);
beforeEach(() => {
  preferences.setItem('biletflow.language', 'en');
  process.env.EXPO_PUBLIC_API_URL = 'https://api.example.test/v1';
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
});

async function show(h: ReturnType<typeof harness>) {
  return render(
    <SafeAreaProvider>
      <AuthProvider session={h.session}>
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>,
  );
}

test('guest browsing and native email/password login admit attendees into the full app', async () => {
  const h = harness();
  const attendee = { ...user, roles: ['attendee'] };
  h.fetcher.mockResolvedValueOnce(response({ data: [], total: 0 }));
  const screen = await show(h);
  await screen.findByText('Find your next event');
  await fireEvent.press(screen.getByRole('button', { name: 'Menu' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  await fireEvent.changeText(screen.getByLabelText('Email *'), 'attendee@example.test');
  await fireEvent.changeText(screen.getByLabelText('Password *'), 'demo12345');
  h.fetcher
    .mockResolvedValueOnce(response({ ...tokenResponse, user: attendee }))
    .mockResolvedValueOnce(response(attendee))
    .mockImplementation(async () => response({ data: [], total: 0 }));
  await fireEvent.press(screen.getAllByRole('button', { name: 'Sign in' })[0]!);
  await screen.findByText('Find your next event');
  await fireEvent.press(screen.getByRole('button', { name: 'Menu' }));
  expect(screen.getByRole('button', { name: 'My tickets' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Check in' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Admin' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'My tickets' }));
  await screen.findByText('No results');
  expect(h.fetcher.mock.calls.some(([url]) => String(url).includes('/me/tickets'))).toBe(true);
});

test.each(
  [
    ['attendee'],
    ['attendee', 'organizer'],
    ['attendee', 'platform_admin'],
    ['attendee', 'event_admin'],
  ].map((roles) => [roles]),
)(
  'restored roles have native website access with scoped scanner/admin navigation: %j',
  async (roles) => {
    const h = harness(tokenResponse);
    h.fetcher
      .mockResolvedValueOnce(response({ ...user, roles }))
      .mockImplementation(async () => response({ data: [], total: 0 }));
    const screen = await show(h);
    await screen.findByText('Find your next event');
    await fireEvent.press(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getByRole('button', { name: 'Account' })).toBeTruthy();
    expect(!!screen.queryByRole('button', { name: 'Admin' })).toBe(
      roles.includes('platform_admin'),
    );
    expect(!!screen.queryByRole('button', { name: 'Check in' })).toBe(
      roles.includes('event_admin'),
    );
  },
);

test('native forms preserve repeated checkboxes, enforce required fields and submit numeric text intact', async () => {
  const submit = jest.fn(async (_values: FormValues) => {});
  const screen = await render(
    <LanguageContext.Provider value="en">
      <Form
        fields={[
          { name: 'name', label: 'Name', required: true },
          {
            name: 'price',
            label: 'Price (KZT)',
            type: 'number',
            step: '0.01',
            min: 0,
            value: '12.34',
          },
          { name: 'hidden', label: 'Hidden', type: 'checkbox', value: true },
        ]}
        onSubmit={submit}
      />
    </LanguageContext.Provider>,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  expect(submit).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Name *'), 'Standard');
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  expect(Object.fromEntries(submit.mock.calls[0]![0])).toEqual({
    name: 'Standard',
    price: '12.34',
    hidden: 'on',
  });
});

test('native API shares scanner tokens and keeps idempotency headers during rotation', async () => {
  const h = harness(tokenResponse);
  h.fetcher.mockResolvedValueOnce(response(user));
  await h.session.restore();
  bindSession(h.session);
  h.fetcher
    .mockResolvedValueOnce(response({}, 401))
    .mockResolvedValueOnce(response({ ...tokenResponse, accessToken: 'rotated' }))
    .mockResolvedValueOnce(response({ id: 'order-1' }));
  const key = idempotencyKey();
  expect(await send('/checkout/sessions/1/confirm', {}, 'POST', key)).toEqual({ id: 'order-1' });
  const attempts = h.fetcher.mock.calls.filter(([url]) => String(url).endsWith('/confirm'));
  expect(attempts).toHaveLength(2);
  for (const [, init] of attempts)
    expect(new Headers(init?.headers).get('Idempotency-Key')).toBe(key);
  expect(new Headers(attempts[1]![1]?.headers).get('Authorization')).toBe('Bearer rotated');
  await act(async () => {
    h.fetcher.mockResolvedValue(response(undefined, 204));
    await api('/auth/logout', { method: 'POST' });
  });
  expect(h.saved()).toBeNull();
});

test('native deep links accept app and matching website links, rejecting unrelated sites', () => {
  const base = 'https://biletflow.example/v1';
  expect(incomingPath('biletflow://verify-email?token=abc', base)).toBe('/verify-email?token=abc');
  expect(incomingPath('https://biletflow.example/events/1?campaign=promo', base)).toBe(
    '/events/1?campaign=promo',
  );
  expect(incomingPath('https://untrusted.example/events/1', base)).toBeNull();
  expect(eventPath('https://web.example/events/1?campaign=invite')).toBe(
    '/events/1?campaign=invite',
  );
  expect(eventPath('javascript:alert(1)')).toBeNull();
  expect(eventPath('https://web.example/admin')).toBeNull();
});

const showEvent = {
  id: 'event-1',
  title: 'Native concert',
  venueName: 'Hall',
  city: 'Almaty',
  startsAt: '2027-01-01T12:00:00Z',
  endsAt: '2027-01-01T14:00:00Z',
  timeZone: 'Asia/Almaty',
  status: 'upcoming',
  visibility: 'public',
  organizerId: 'owner-1',
  ticketTypes: [
    {
      id: 'type-1',
      name: 'General',
      price: { amount: 0, currency: 'KZT' },
      available: 10,
      onSale: true,
    },
  ],
};

test('native guest flow browses an event, holds a free ticket and confirms an order', async () => {
  const h = harness();
  const money = { amount: 0, currency: 'KZT' };
  const checkout = {
    id: 'checkout-1',
    eventId: showEvent.id,
    status: 'open',
    requiresPayment: false,
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    subtotal: money,
    discount: money,
    processingFee: money,
    total: money,
    items: [{ ticketTypeId: 'type-1', ticketTypeName: 'General', quantity: 1, unitPrice: money }],
  };
  const order = {
    id: 'order-1',
    eventId: showEvent.id,
    eventTitle: showEvent.title,
    orderNumber: 'ORD-1',
    status: 'confirmed',
    total: money,
    tickets: [],
  };
  h.fetcher.mockImplementation(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path === '/v1/events') return response({ data: [showEvent], total: 1 });
    if (path === '/v1/events/event-1') return response(showEvent);
    if (path === '/v1/checkout/sessions' && init?.method === 'POST') return response(checkout, 201);
    if (path === '/v1/checkout/sessions/checkout-1') return response(checkout);
    if (path.endsWith('/confirm')) return response(order, 201);
    return response({ error: { code: 'not_authenticated' } }, 401);
  });
  const screen = await show(h);
  await screen.findByText('Native concert');
  await fireEvent.press(screen.getByRole('button', { name: 'Native concert' }));
  await screen.findByText('Choose tickets');
  await fireEvent.changeText(screen.getByLabelText('General — Quantity'), '1');
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  await fireEvent.changeText(screen.getByLabelText('Full name 1 *'), 'Guest');
  await fireEvent.changeText(screen.getByLabelText('Email 1 *'), 'guest@example.test');
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByText('Checkout');
  await fireEvent.changeText(screen.getByLabelText('Email *'), 'guest@example.test');
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm order' }));
  await screen.findByText('Order confirmed');
  const hold = h.fetcher.mock.calls.find(
    ([url, init]) => String(url).endsWith('/checkout/sessions') && init?.method === 'POST',
  );
  expect(JSON.parse(String(hold?.[1]?.body))).toMatchObject({
    eventId: 'event-1',
    items: [{ ticketTypeId: 'type-1', quantity: 1 }],
  });
  const confirm = h.fetcher.mock.calls.find(([url]) => String(url).endsWith('/confirm'));
  expect(JSON.parse(String(confirm?.[1]?.body))).toEqual({ contactEmail: 'guest@example.test' });
  expect(new Headers(confirm?.[1]?.headers).get('Idempotency-Key')).toBeTruthy();
});

test('verified staff open the existing native scanner area through the new application menu', async () => {
  const h = harness(tokenResponse);
  h.fetcher
    .mockResolvedValueOnce(response(user))
    .mockImplementation(async () => response({ data: [], total: 0 }));
  const screen = await show(h);
  await screen.findByText('Find your next event');
  await fireEvent.press(screen.getByRole('button', { name: 'Menu' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Check in' }));
  await screen.findByText('Assigned events');
  expect(
    h.fetcher.mock.calls.some(([url]) => String(url).endsWith('/checkin/events?assignedOnly=true')),
  ).toBe(true);
});

test('the existing language selector translates the scanner area without reloading assignments', async () => {
  const h = harness(tokenResponse);
  h.fetcher
    .mockResolvedValueOnce(response(user))
    .mockImplementation(async () => response({ data: [], total: 0 }));
  const screen = await show(h);
  await screen.findByText('Find your next event');
  await fireEvent.press(screen.getByRole('button', { name: 'Menu' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Check in' }));
  await screen.findByText('Assigned events');
  const requests = h.fetcher.mock.calls.length;
  await fireEvent.press(screen.getByRole('button', { name: 'Language' }));
  await fireEvent.press(screen.getByRole('radio', { name: 'Русский' }));
  expect(screen.getByText('Назначенные события')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Обновить события' })).toBeEnabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Язык' }));
  await fireEvent.press(screen.getByRole('radio', { name: 'Қазақша' }));
  expect(screen.getByText('Тағайындалған іс-шаралар')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Іс-шараларды жаңарту' })).toBeEnabled();
  expect(preferences.getItem('biletflow.language')).toBe('kk');
  expect(screen.getByText('KK')).toBeTruthy();
  expect(h.fetcher).toHaveBeenCalledTimes(requests);
});

test('an attendee deep link to administration is rejected without requesting admin data', async () => {
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue('biletflow://admin');
  const h = harness(tokenResponse);
  h.fetcher
    .mockResolvedValueOnce(response({ ...user, roles: ['attendee'] }))
    .mockImplementation(async () => response({ data: [], total: 0 }));
  const screen = await show(h);
  await screen.findByText('You do not have permission for this action.');
  expect(h.fetcher.mock.calls.some(([url]) => String(url).includes('/admin/'))).toBe(false);
});

test('organizer can edit an event and add a priced ticket type from native forms', async () => {
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue('biletflow://organizer/events/event-1');
  const h = harness(tokenResponse);
  const organizer = { ...user, roles: ['attendee', 'organizer'] };
  const event = { ...showEvent, organizerId: user.id };
  h.fetcher.mockImplementation(async (url) => {
    if (String(url).endsWith('/me')) return response(organizer);
    return response(event);
  });
  const screen = await show(h);
  await screen.findByText('Edit event');
  await fireEvent.changeText(screen.getByLabelText('Title *'), 'Updated native concert');
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  const edit = h.fetcher.mock.calls.find(([, init]) => init?.method === 'PATCH');
  expect(JSON.parse(String(edit?.[1]?.body))).toMatchObject({
    title: 'Updated native concert',
    visibility: 'public',
    startsAt: showEvent.startsAt.replace('Z', '.000Z'),
  });
  await fireEvent.press(screen.getByRole('button', { name: 'Ticket types' }));
  await fireEvent.changeText(screen.getByLabelText('Name *'), 'Balcony');
  await fireEvent.changeText(screen.getByLabelText('Price (KZT) *'), '1250.75');
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  const ticket = h.fetcher.mock.calls.find(
    ([url, init]) => String(url).endsWith('/ticket-types') && init?.method === 'POST',
  );
  expect(JSON.parse(String(ticket?.[1]?.body))).toMatchObject({
    name: 'Balcony',
    price: { amount: 125075, currency: 'KZT' },
    quantity: 100,
  });
});

test('support submits the visible default category and retains a draft during foreground session validation', async () => {
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue('biletflow://support/new?eventId=event-1');
  const h = harness(tokenResponse);
  const attendee = { ...user, roles: ['attendee'] };
  const supportCase = {
    id: 'case-1',
    subject: 'Need my tickets',
    category: 'ticket_delivery',
    status: 'open',
    handledBy: 'platform',
    requesterUserId: user.id,
    messages: [],
  };
  h.fetcher.mockImplementation(async (url) =>
    response(String(url).endsWith('/me') ? attendee : supportCase),
  );
  const screen = await show(h);
  await screen.findByText('New case');
  await fireEvent.changeText(screen.getByLabelText('Subject *'), 'Need my tickets');
  await fireEvent.changeText(screen.getByLabelText('Message *'), 'Please resend my tickets.');
  const pending = deferred<Response>();
  h.fetcher.mockReturnValueOnce(pending.promise);
  let restore!: Promise<void>;
  await act(async () => {
    restore = h.session.restore();
  });
  expect(screen.getByLabelText('Message *').props.value).toBe('Please resend my tickets.');
  await act(async () => {
    pending.resolve(response(attendee));
    await restore;
  });
  await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
  await screen.findByText('Need my tickets');
  const created = h.fetcher.mock.calls.find(
    ([url, init]) => String(url).endsWith('/support/cases') && init?.method === 'POST',
  );
  expect(JSON.parse(String(created?.[1]?.body))).toEqual({
    category: 'ticket_delivery',
    subject: 'Need my tickets',
    message: 'Please resend my tickets.',
    eventId: 'event-1',
  });
});

test('support uploads a document picked on the device with its message', async () => {
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue('biletflow://support/case-1');
  jest.spyOn(DocumentPicker, 'getDocumentAsync').mockResolvedValue({
    canceled: false,
    assets: [
      {
        uri: 'file:///receipt.pdf',
        name: 'receipt.pdf',
        mimeType: 'application/pdf',
        size: 200,
        lastModified: 0,
      },
    ],
  });
  const h = harness(tokenResponse);
  const supportCase = {
    id: 'case-1',
    subject: 'Receipt',
    category: 'payment',
    status: 'open',
    handledBy: 'platform',
    requesterUserId: user.id,
    messages: [],
  };
  h.fetcher.mockImplementation(async (url) =>
    response(String(url).endsWith('/me') ? user : supportCase),
  );
  const screen = await show(h);
  await screen.findByText('Receipt');
  await fireEvent.press(screen.getByRole('button', { name: /Attachment.*PNG/ }));
  await fireEvent.press(screen.getByRole('button', { name: 'Attachment *' }));
  await screen.findByText('receipt.pdf');
  await fireEvent.changeText(screen.getByLabelText('Message'), 'My receipt');
  await fireEvent.press(screen.getAllByRole('button', { name: 'Send' })[1]!);
  const upload = h.fetcher.mock.calls.find(([url]) => String(url).endsWith('/attachments'));
  expect(upload?.[1]?.body).toBeInstanceOf(FormData);
  expect(new Headers(upload?.[1]?.headers).has('Content-Type')).toBe(false);
});

test('platform admin edits settings using integer tiyin and a native switch', async () => {
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue('biletflow://admin');
  const h = harness(tokenResponse);
  const admin = { ...user, roles: ['attendee', 'platform_admin'] };
  const settings = {
    activationFee: { amount: 10000, currency: 'KZT' },
    processingFeePercent: 2.5,
    processingFeePaidBy: 'attendee',
    checkoutHoldMinutes: 15,
    guestCheckoutEnabled: true,
    termsVersion: '2026-09',
  };
  h.fetcher.mockImplementation(async (url) =>
    response(
      String(url).endsWith('/me')
        ? admin
        : String(url).endsWith('/settings')
          ? settings
          : { data: [], total: 0 },
    ),
  );
  const screen = await show(h);
  await screen.findByText('Admin');
  await fireEvent.press(screen.getByRole('button', { name: 'Settings' }));
  await screen.findByLabelText('Activation fee *');
  await fireEvent.changeText(screen.getByLabelText('Activation fee *'), '150.25');
  await fireEvent(screen.getByRole('switch', { name: 'Guest checkout' }), 'valueChange', false);
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  const saved = h.fetcher.mock.calls.find(([, init]) => init?.method === 'PATCH');
  expect(JSON.parse(String(saved?.[1]?.body))).toEqual({
    ...settings,
    activationFee: { amount: 15025, currency: 'KZT' },
    guestCheckoutEnabled: false,
  });
});

test('native downloads share the file before deleting the temporary sensitive copy', async () => {
  const h = harness();
  await h.session.restore();
  bindSession(h.session);
  const bytes = new Uint8Array([37, 80, 68, 70, 255]);
  h.fetcher.mockResolvedValueOnce(new Response(bytes));
  const file = {
    uri: 'file:///cache/ticket.pdf',
    write: jest.fn(),
    delete: jest.fn(),
    exists: true,
  };
  (File as unknown as jest.Mock).mockImplementation(() => file);
  const sheet = deferred<void>();
  jest.mocked(Sharing.shareAsync).mockReturnValueOnce(sheet.promise);
  const result = download('/me/tickets/1/pdf', 'ticket.pdf');
  await act(async () => {});
  expect(file.write).toHaveBeenCalledWith(bytes);
  expect(Sharing.shareAsync).toHaveBeenCalledWith(file.uri);
  expect(file.delete).not.toHaveBeenCalled();
  sheet.resolve();
  await result;
  expect(file.delete).toHaveBeenCalledTimes(1);
});

test('accepting the displayed iPhone date and time fills a previously empty required field', async () => {
  const platform = jest.replaceProperty(Platform, 'OS', 'ios');
  try {
    const submit = jest.fn(async (_values: FormValues) => {});
    const screen = await render(
      <LanguageContext.Provider value="en">
        <Form
          fields={[{ name: 'startsAt', label: 'Starts', type: 'datetime-local', required: true }]}
          submit="Create"
          onSubmit={submit}
        />
      </LanguageContext.Provider>,
    );
    await fireEvent.press(screen.getByRole('button', { name: /^Starts/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Create' }));
    expect(submit).toHaveBeenCalledTimes(1);
    expect(
      Number.isFinite(new Date(String(submit.mock.calls[0]![0].get('startsAt'))).getTime()),
    ).toBe(true);
  } finally {
    platform.restore();
  }
});

test('My tickets discovers an attendee ticket independently of the buyer order list', async () => {
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue('biletflow://tickets');
  const h = harness(tokenResponse);
  const ticket = {
    id: 'ticket-for-me',
    orderId: 'someone-elses-order',
    ticketNumber: 'TKT-BOB',
    eventTitle: 'Gifted concert',
    ticketTypeName: 'General',
    attendee: { fullName: 'Bob' },
    status: 'valid',
  };
  h.fetcher.mockImplementation(async (url) =>
    response(
      String(url).endsWith('/me')
        ? { ...user, roles: ['attendee'] }
        : String(url).endsWith('/me/tickets/ticket-for-me')
          ? ticket
          : { data: [ticket], total: 1 },
    ),
  );
  const screen = await show(h);
  await screen.findByText('Gifted concert');
  expect(h.fetcher.mock.calls.some(([url]) => String(url).includes('/me/tickets?page=1'))).toBe(
    true,
  );
  expect(h.fetcher.mock.calls.some(([url]) => String(url).includes('/me/orders'))).toBe(false);
  await fireEvent.press(screen.getByRole('button', { name: 'Show QR' }));
  expect(
    h.fetcher.mock.calls.some(([url]) => String(url).endsWith('/me/tickets/ticket-for-me')),
  ).toBe(true);
});

test('account displays the masked payout account and connection status', async () => {
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue('biletflow://account');
  const h = harness(tokenResponse);
  h.fetcher.mockImplementation(async (url) =>
    response(
      String(url).endsWith('/me')
        ? { ...user, roles: ['attendee', 'organizer'] }
        : String(url).endsWith('/organizer-profile')
          ? {
              displayName: 'Events',
              contactEmail: user.email,
              payoutAccount: { maskedAccount: '•••• 1234', status: 'connected' },
            }
          : { data: [], total: 0 },
    ),
  );
  const screen = await show(h);
  await screen.findByText('•••• 1234');
  expect(screen.getByText('Status: connected')).toBeTruthy();
});

test('clearing optional event values sends explicit nulls to remove saved configuration', async () => {
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue('biletflow://organizer/events/event-1');
  const h = harness(tokenResponse);
  const event = {
    ...showEvent,
    organizerId: user.id,
    capacity: 100,
    imageUrl: 'https://example.test/image.png',
    registrationOpensAt: '2026-12-01T12:00:00Z',
    registrationClosesAt: '2026-12-31T12:00:00Z',
  };
  h.fetcher.mockImplementation(async (url) =>
    response(String(url).endsWith('/me') ? { ...user, roles: ['attendee', 'organizer'] } : event),
  );
  const screen = await show(h);
  await screen.findByText('Edit event');
  await fireEvent.changeText(screen.getByLabelText('Capacity'), '');
  await fireEvent.changeText(screen.getByLabelText('Image URL'), '');
  await fireEvent.press(screen.getAllByRole('button', { name: 'Remove' })[0]!);
  await fireEvent.press(screen.getAllByRole('button', { name: 'Remove' })[0]!);
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  const patch = h.fetcher.mock.calls.find(([, init]) => init?.method === 'PATCH');
  expect(JSON.parse(String(patch?.[1]?.body))).toMatchObject({
    capacity: null,
    imageUrl: null,
    registrationOpensAt: null,
    registrationClosesAt: null,
  });
});

test('history displays the affected entity supplied by the API', async () => {
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue('biletflow://organizer/events/event-1');
  const h = harness(tokenResponse);
  h.fetcher.mockImplementation(async (url) =>
    response(
      String(url).endsWith('/me')
        ? { ...user, roles: ['attendee', 'organizer'] }
        : String(url).includes('/history')
          ? {
              data: [
                {
                  id: 'audit-1',
                  createdAt: '2026-11-25T10:00:00Z',
                  actorName: 'Organizer',
                  action: 'order.refunded',
                  entityType: 'order',
                  entityId: 'order-42',
                  description: 'Refunded',
                },
              ],
              total: 1,
            }
          : { ...showEvent, organizerId: user.id },
    ),
  );
  const screen = await show(h);
  await screen.findByText('Edit event');
  await fireEvent.press(screen.getByRole('button', { name: 'History' }));
  await screen.findByText('order · order-42');
});

test('support filters use compact selection dialogs and preserve the event context', async () => {
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue('biletflow://support?eventId=event-1');
  const h = harness(tokenResponse);
  h.fetcher.mockImplementation(async (url) =>
    response(String(url).endsWith('/me') ? user : { data: [], total: 0 }),
  );
  const screen = await show(h);
  await screen.findByText('No results');
  expect(screen.queryByRole('radio', { name: 'Resolved' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Status' }));
  await fireEvent.press(screen.getByRole('radio', { name: 'resolved' }));
  expect(screen.getByRole('button', { name: 'Status' })).toHaveAccessibilityValue({
    text: 'resolved',
  });
  expect(screen.queryByRole('radio', { name: 'resolved' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Handled by' }));
  await fireEvent.press(screen.getByRole('radio', { name: 'platform' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Apply' }));
  const calls = h.fetcher.mock.calls.filter(([url]) => String(url).includes('/support/cases'));
  const last = new URL(String(calls.at(-1)?.[0]));
  expect(Object.fromEntries(last.searchParams)).toMatchObject({
    eventId: 'event-1',
    status: 'resolved',
    handledBy: 'platform',
    page: '1',
  });
});

test('admin payment search sends its query to the payment endpoint', async () => {
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue('biletflow://admin');
  const h = harness(tokenResponse);
  h.fetcher.mockImplementation(async (url) =>
    response(
      String(url).endsWith('/me')
        ? { ...user, roles: ['attendee', 'platform_admin'] }
        : { data: [], total: 0 },
    ),
  );
  const screen = await show(h);
  await screen.findByText('No results');
  await fireEvent.press(screen.getByRole('button', { name: 'Payments' }));
  await fireEvent.changeText(
    screen.getAllByLabelText('Search').find((node) => node.props.onChangeText)!,
    'ORD-42',
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Search' }));
  expect(
    h.fetcher.mock.calls.some(([url]) => String(url).includes('/admin/payments?q=ORD-42')),
  ).toBe(true);
});

test('seat map scrolls horizontally and distinguishes held, sold and unavailable seats', async () => {
  const onChange = jest.fn();
  const statuses = ['available', 'held', 'sold', 'unavailable'] as const;
  const map = {
    eventId: 'e',
    venueId: 'v',
    venueName: 'Hall',
    sections: [
      {
        name: 'Main',
        rows: [
          {
            label: 'A',
            seats: statuses.map((status, i) => ({
              id: `seat-${i}`,
              number: i + 1,
              priceCategory: 'standard',
              status,
              accessible: false,
              price: { amount: 10000, currency: 'KZT' },
            })),
          },
        ],
      },
    ],
  } as Model<'SeatMap'>;
  const screen = await render(
    <LanguageContext.Provider value="en">
      <SeatPicker map={map} selected={[]} onChange={onChange} />
    </LanguageContext.Provider>,
  );
  expect(screen.getByLabelText('Seating: Main').props.horizontal).toBe(true);
  const seats = statuses.map((_, i) =>
    screen.getByRole('button', { name: new RegExp(`Main A ${i + 1},`) }),
  );
  const colors = seats.map((seat) => StyleSheet.flatten(seat.props.style).backgroundColor);
  expect(new Set(colors).size).toBe(4);
  await fireEvent.press(seats[2]!);
  expect(onChange).not.toHaveBeenCalled();
  await fireEvent.press(seats[0]!);
  expect(onChange).toHaveBeenCalledWith(['seat-0']);
});

test('private-event calendar downloads keep the invitation token', async () => {
  const h = harness();
  await h.session.restore();
  bindSession(h.session);
  h.fetcher.mockResolvedValueOnce(new Response('BEGIN:VCALENDAR'));
  const file = {
    uri: 'file:///cache/event.ics',
    write: jest.fn(),
    delete: jest.fn(),
    exists: true,
  };
  (File as unknown as jest.Mock).mockImplementation(() => file);
  jest.mocked(Sharing.shareAsync).mockResolvedValueOnce(undefined);
  const event = {
    ...showEvent,
    calendarLinks: {
      ics: 'https://api.example.test/v1/events/event-1/calendar.ics',
      google: 'https://calendar.google.com/',
      outlook: 'https://outlook.live.com/',
    },
  } as Model<'Event'>;
  const screen = await render(
    <LanguageContext.Provider value="en">
      <Calendar event={event} campaign="private-invite" />
    </LanguageContext.Provider>,
  );
  await fireEvent.press(screen.getByRole('button', { name: '.ics' }));
  expect(h.fetcher).toHaveBeenCalledWith(
    'https://api.example.test/v1/events/event-1/calendar.ics?campaignToken=private-invite',
    expect.anything(),
  );
});
