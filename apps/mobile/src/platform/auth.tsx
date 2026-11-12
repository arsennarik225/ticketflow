import { Caption, Heading, Paragraph, Section, Title } from './native';
import { preferences } from './storage';
import { currentPath } from './navigation';
import { createContext, useContext } from 'react';
import { Link, useNavigate, useSearchParams } from './navigation';
import { api, saveSession, send, session, type Model, type Tokens, type User } from './api';
import { Form, PageList, text, useResource } from './ui';
import { date, useT } from './i18n';

export const AuthContext = createContext<User | null>(null);
export const useUser = () => useContext(AuthContext);
export function RequireAuth({ children, role }: { children: React.ReactNode; role?: string }) {
  const user = useUser();
  const t = useT();
  if (!user)
    return (
      <Section variant="card">
        <Paragraph>{t('Please sign in to continue.')}</Paragraph>
        <Link variant="button primary" to={`/login?next=${encodeURIComponent(currentPath())}`}>
          {t('Sign in')}
        </Link>
      </Section>
    );
  if (role && !user.roles.includes(role as User['roles'][number]))
    return <Section variant="notice">{t('You do not have permission for this action.')}</Section>;
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
    <Section variant="card form">
      <Title>{t(title)}</Title>
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
          ...(['reset', 'verify'].includes(mode) && !params.get('token')
            ? [{ name: 'link', label: 'Email link or token', required: true }]
            : []),
          ...(mode === 'register'
            ? [
                {
                  name: 'language',
                  label: 'Language',
                  value: preferences.getItem('biletflow.language') || 'ru',
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
              token: params.get('token') || tokenFromLink(text(data, 'link')),
              password: String(data.get('password') || ''),
            });
            saveSession(null);
            navigate('/login');
          } else {
            saveSession(
              await send<Tokens>('/auth/verify-email', {
                token: params.get('token') || tokenFromLink(text(data, 'link')),
              }),
            );
            navigate('/account');
          }
        }}
      >
        {(params.has('registered') || mode === 'register' || mode === 'forgot') && (
          <Paragraph>{t('Check your inbox.')}</Paragraph>
        )}
      </Form>
      <Section variant="actions">
        <Link to="/login">{t('Sign in')}</Link>
        <Link to="/register">{t('Register')}</Link>
        <Link to="/forgot-password">{t('Forgot password')}</Link>
        <Link to="/reset-password">{t('Reset password')}</Link>
        <Link to="/verify-email">{t('Verify email')}</Link>
      </Section>
    </Section>
  );
}
export function tokenFromLink(value: string): string {
  try {
    return new URL(value).searchParams.get('token') || value;
  } catch {
    return value;
  }
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
      <Title>{t('Account')}</Title>
      <Section variant="two-col">
        <Section variant="card">
          <Heading>{user.email}</Heading>
          {!user.emailVerified && (
            <Paragraph variant="notice">
              {t('Verify your email using the link in your inbox before publishing events.')}
              <Link to="/verify-email">{t('Verify email')}</Link>
            </Paragraph>
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
          <Heading style={{ marginTop: '2rem' }}>{t('Organizer profile')}</Heading>
          {profile.loading ? (
            <Paragraph>{t('Loading…')}</Paragraph>
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
        </Section>
        <Section variant="card">
          <Heading>{t('Notifications')}</Heading>
          <PageList<Model<'Notification'>>
            path="/me/notifications"
            render={(item) => (
              <>
                <Heading>{item.subject}</Heading>
                <Caption>{date(item.createdAt!)}</Caption>
                <Paragraph variant="pre-wrap">{item.body}</Paragraph>
              </>
            )}
          />
        </Section>
      </Section>
    </>
  );
}
