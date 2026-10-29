import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ApiError, type Model } from './api';
import { CheckoutPage, SeatPicker } from './events';
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
