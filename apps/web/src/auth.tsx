import { createContext, useContext } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, saveSession, send, session, type Model, type Tokens, type User } from './api';
import { Form, PageList, Resource, text, useResource } from './ui';
import { date, useT } from './i18n';

export const AuthContext = createContext<User | null>(null);
export const useUser = () => useContext(AuthContext);
export function RequireAuth({ children, role }: { children: React.ReactNode; role?: string }) {
  const user = useUser();
  const t = useT();
  if (!user)
    return (
      <div className="card">
        <p>{t('Please sign in to continue.')}</p>
        <Link
          className="button primary"
          to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
        >
          {t('Sign in')}
        </Link>
      </div>
    );
  if (role && !user.roles.includes(role as User['roles'][number]))
    return <div className="notice">{t('You do not have permission for this action.')}</div>;
  return <>{children}</>;
}
export function AuthPage({ mode }: { mode: 'login' | 'register' | 'forgot' | 'reset' | 'verify' }) {
  const t = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const title = {
    login: 'Sign in',
    register: 'Register',
    forgot: 'Forgot password',
    reset: 'Reset password',
    verify: 'Verify email',
  }[mode];
  return (
    <div className="card form">
      <h1>{t(title)}</h1>
      <Form
        key={mode}
        submit={mode === 'forgot' ? 'Send reset link' : title}
        fields={[
          ...(mode === 'register'
            ? [{ name: 'fullName', label: 'Full name', required: true }]
            : []),
          ...(['login', 'register', 'forgot'].includes(mode)
            ? [{ name: 'email', label: 'Email', type: 'email', required: true }]
            : []),
          ...(['login', 'register', 'reset'].includes(mode)
            ? [{ name: 'password', label: 'Password', type: 'password', required: true }]
            : []),
          ...(mode === 'register'
            ? [
                {
                  name: 'language',
                  label: 'Language',
                  value: localStorage.getItem('biletflow.language') || 'ru',
                  options: [
                    { value: 'ru', label: 'Русский' },
                    { value: 'kk', label: 'Қазақша' },
                    { value: 'en', label: 'English' },
                  ],
                },
              ]
            : []),
        ]}
        onSubmit={async (data) => {
          if (mode === 'login') {
            saveSession(
              await send<Tokens>('/auth/login', {
                email: text(data, 'email'),
                password: String(data.get('password') || ''),
              }),
            );
            const next = params.get('next') || '/';
            navigate(next.startsWith('/') && !next.startsWith('//') ? next : '/');
          } else if (mode === 'register') {
            await send('/auth/register', {
              fullName: text(data, 'fullName'),
              email: text(data, 'email'),
              password: String(data.get('password') || ''),
              language: text(data, 'language'),
            });
            navigate('/login?registered=1');
          } else if (mode === 'forgot') {
            await send('/auth/password/forgot', { email: text(data, 'email') });
          } else if (mode === 'reset') {
            await send('/auth/password/reset', {
              token: params.get('token') || '',
              password: String(data.get('password') || ''),
            });
            saveSession(null);
            navigate('/login');
          } else {
            saveSession(
              await send<Tokens>('/auth/verify-email', { token: params.get('token') || '' }),
            );
            navigate('/account');
          }
        }}
      >
        {(params.has('registered') || mode === 'register' || mode === 'forgot') && (
          <p>{t('Check your inbox.')}</p>
        )}
      </Form>
      <div className="actions">
        <Link to="/login">{t('Sign in')}</Link>
        <Link to="/register">{t('Register')}</Link>
        <Link to="/forgot-password">{t('Forgot password')}</Link>
      </div>
    </div>
  );
}
export function AccountPage() {
  const user = useUser()!;
  const t = useT();
  const profile = useResource<Model<'OrganizerProfile'>>(
    user.roles.includes('organizer') ? '/me/organizer-profile' : null,
  );
  async function refreshUser() {
    const current = session();
    if (current) saveSession({ ...current, user: await api<User>('/me') });
  }
  return (
    <>
      <h1>{t('Account')}</h1>
      <div className="two-col">
        <section className="card">
          <h2>{user.email}</h2>
          {!user.emailVerified && (
            <p className="notice">
              {t('Verify your email using the link in your inbox before publishing events.')}
            </p>
          )}
          <Form
            key={user.id}
            fields={[
              { name: 'fullName', label: 'Full name', value: user.fullName, required: true },
              {
                name: 'language',
                label: 'Language',
                value: user.language || 'ru',
                options: [
                  { value: 'ru', label: 'Русский' },
                  { value: 'kk', label: 'Қазақша' },
                  { value: 'en', label: 'English' },
                ],
              },
            ]}
            onSubmit={async (data) => {
              await send(
                '/me',
                { fullName: text(data, 'fullName'), language: text(data, 'language') },
                'PATCH',
              );
              await refreshUser();
            }}
          />
          <h2 style={{ marginTop: '2rem' }}>{t('Organizer profile')}</h2>
          {profile.loading ? (
            <p>{t('Loading…')}</p>
          ) : (
            <Form
              key={profile.data?.displayName || 'new'}
              fields={[
                {
                  name: 'displayName',
                  label: 'Display name',
                  required: true,
                  value: profile.data?.displayName || user.fullName,
                },
                {
                  name: 'contactEmail',
                  label: 'Contact email',
                  type: 'email',
                  required: true,
                  value: profile.data?.contactEmail || user.email,
                },
                {
                  name: 'contactPhone',
                  label: 'Phone',
                  type: 'tel',
                  value: profile.data?.contactPhone,
                },
                {
                  name: 'description',
                  label: 'Description',
                  type: 'textarea',
                  value: profile.data?.description,
                },
              ]}
              onSubmit={async (data) => {
                await send('/me/organizer-profile', Object.fromEntries(data), 'PUT');
                await refreshUser();
                profile.reload();
              }}
            />
          )}
        </section>
        <section className="card">
          <h2>{t('Notifications')}</h2>
          <PageList<Model<'Notification'>>
            path="/me/notifications"
            render={(item) => (
              <>
                <h3>{item.subject}</h3>
                <small>{date(item.createdAt!)}</small>
                <p className="pre-wrap">{item.body}</p>
              </>
            )}
          />
        </section>
      </div>
    </>
  );
}
