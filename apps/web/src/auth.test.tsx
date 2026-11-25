// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthPage } from './auth';
import { LanguageContext, type Language } from './i18n';
import { Form } from './ui';

const copy = {
  en: {
    inbox: 'Check your inbox.',
    reset: 'If an account exists for this email, check your inbox for password reset instructions.',
    saved: 'Saved',
    signIn: 'Sign in',
  },
  ru: {
    inbox: 'Проверьте почту.',
    reset: 'Если аккаунт с таким адресом существует, проверьте почту для восстановления пароля.',
    saved: 'Сохранено',
    signIn: 'Войти',
  },
  kk: {
    inbox: 'Поштаңызды тексеріңіз.',
    reset:
      'Егер осы электрондық поштаға тіркелген аккаунт болса, құпиясөзді қалпына келтіру нұсқауларын поштаңыздан қараңыз.',
    saved: 'Сақталды',
    signIn: 'Кіру',
  },
};
const languages: Language[] = ['en', 'ru', 'kk'];
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', vi.fn());
  localStorage.clear();
  sessionStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderAuth(path: string, language: Language = 'en') {
  localStorage.setItem('biletflow.language', language);
  await act(async () => {
    root.render(
      <LanguageContext.Provider value={language}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/register" element={<AuthPage mode="register" />} />
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/forgot-password" element={<AuthPage mode="forgot" />} />
          </Routes>
        </MemoryRouter>
      </LanguageContext.Provider>,
    );
  });
}

function enter(name: string, value: string) {
  container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!.value = value;
}

async function submit() {
  await act(async () => {
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

it.each(languages)(
  '%s registration does not claim email was sent before submission',
  async (language) => {
    await renderAuth('/register', language);
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.textContent).not.toContain(copy[language].inbox);
    expect(fetch).not.toHaveBeenCalled();
  },
);

it.each(languages)(
  '%s password recovery has no success message before submission',
  async (language) => {
    await renderAuth('/forgot-password', language);
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.textContent).not.toContain(copy[language].inbox);
    expect(container.textContent).not.toContain(copy[language].reset);
    expect(fetch).not.toHaveBeenCalled();
  },
);

it.each(['/register?registered=1', '/forgot-password?registered=1', '/login?registered=0'])(
  '%s does not display a registration confirmation',
  async (path) => {
    await renderAuth(path);
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.textContent).not.toContain(copy.en.inbox);
  },
);

it.each(languages)(
  '%s registration shows the inbox notice after a successful request',
  async (language) => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ id: 'new-user' }, { status: 201 }));
    await renderAuth('/register', language);
    enter('fullName', 'Test Attendee');
    enter('email', 'new@example.test');
    enter('password', 'test-password');
    await submit();

    expect(fetch).toHaveBeenCalledWith('/v1/auth/register', expect.any(Object));
    expect(container.querySelector('[role="status"]')?.textContent).toBe(copy[language].inbox);
    expect(container.querySelector('h1')?.textContent).toBe(copy[language].signIn);
    expect(container.textContent).not.toContain(copy[language].saved);
  },
);

it.each(languages)(
  '%s recovery uses the same neutral response for known and unknown emails',
  async (language) => {
    vi.mocked(fetch).mockImplementation(async () => new Response(null, { status: 202 }));
    await renderAuth('/forgot-password', language);

    for (const email of ['known@example.test', 'unknown@example.test']) {
      enter('email', email);
      await submit();
      expect(container.querySelector('[role="status"]')?.textContent).toBe(copy[language].reset);
      expect(container.textContent).not.toContain(copy[language].saved);
      expect(JSON.parse(String(vi.mocked(fetch).mock.lastCall![1]?.body))).toEqual({ email });
    }
  },
);

it('waits for password recovery acceptance before showing success', async () => {
  let finish!: (response: Response) => void;
  vi.mocked(fetch).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await renderAuth('/forgot-password');
  enter('email', 'attendee@example.test');
  await submit();

  expect(container.querySelector('[role="status"]')).toBeNull();
  expect(container.querySelector('fieldset')!.disabled).toBe(true);
  await act(async () => {
    finish(new Response(null, { status: 202 }));
  });
  expect(container.querySelector('[role="status"]')?.textContent).toBe(copy.en.reset);
  expect(container.querySelector('fieldset')!.disabled).toBe(false);
});

it('clears previous success on failure, preserves the email and permits a retry', async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(new Response(null, { status: 202 }))
    .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    .mockResolvedValueOnce(new Response(null, { status: 202 }));
  await renderAuth('/forgot-password');
  enter('email', 'attendee@example.test');
  await submit();
  expect(container.querySelector('[role="status"]')?.textContent).toBe(copy.en.reset);

  await submit();
  expect(container.querySelector('[role="status"]')).toBeNull();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('network_error');
  expect(container.querySelector<HTMLInputElement>('input[name="email"]')!.value).toBe(
    'attendee@example.test',
  );
  expect(container.querySelector('fieldset')!.disabled).toBe(false);

  await submit();
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.querySelector('[role="status"]')?.textContent).toBe(copy.en.reset);
});

it('keeps the existing Saved feedback for ordinary forms', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  await act(async () => {
    root.render(
      <LanguageContext.Provider value="en">
        <Form fields={[{ name: 'fullName', label: 'Full name' }]} onSubmit={save} />
      </LanguageContext.Provider>,
    );
  });
  enter('fullName', 'Test Attendee');
  await submit();
  expect(save).toHaveBeenCalledOnce();
  expect(container.querySelector('[role="status"]')?.textContent).toBe('Saved');
});
