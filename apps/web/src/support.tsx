import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, download, query, send, type Model, type Page } from './api';
import { useUser } from './auth';
import { date, useT } from './i18n';
import { Action, Form, List, options, Pager, Resource, text, useResource } from './ui';

export function SupportPage() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const resource = useResource<Page<Model<'SupportCase'>>>(
    `/support/cases${query({ ...Object.fromEntries(params), page })}`,
  );
  return (
    <>
      <div className="toolbar">
        <h1>{t('Support')}</h1>
        <Link className="button primary" to={`/support/new?${params}`}>
          + {t('New case')}
        </Link>
      </div>
      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const next = new URLSearchParams(params);
          for (const key of ['status', 'handledBy']) {
            const value = text(form, key);
            if (value) next.set(key, value);
            else next.delete(key);
          }
          setParams(next);
          setPage(1);
        }}
      >
        <label>
          {t('Status')}
          <select name="status" defaultValue={params.get('status') || ''}>
            {['', 'open', 'in_progress', 'waiting_for_customer', 'resolved'].map((s) => (
              <option key={s} value={s}>
                {t(s || 'All')}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('Handled by')}
          <select name="handledBy" defaultValue={params.get('handledBy') || ''}>
            {['', 'organizer', 'platform'].map((s) => (
              <option key={s} value={s}>
                {t(s || 'All')}
              </option>
            ))}
          </select>
        </label>
        <button>{t('Apply')}</button>
      </form>
      <Resource value={resource}>
        {(data) => (
          <>
            <List
              items={data.data}
              render={(item) => (
                <>
                  <h2>
                    <Link to={`/support/${item.id}`}>{item.subject}</Link>
                  </h2>
                  <p>
                    {t(item.category)} · {t(item.status)} · {t(item.handledBy || '')}
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
export function NewCasePage() {
  const t = useT();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  return (
    <>
      <h1>{t('New case')}</h1>
      <section className="card">
        <Form
          fields={[
            {
              name: 'category',
              label: 'Category',
              options: options(
                'ticket_delivery',
                'payment',
                'refund',
                'seating',
                'event_information',
                'check_in',
                'account',
                'technical',
              ),
            },
            { name: 'subject', label: 'Subject', required: true },
            { name: 'message', label: 'Message', type: 'textarea', required: true },
          ]}
          submit="Send"
          onSubmit={async (data) => {
            const item = await send<Model<'SupportCase'>>('/support/cases', {
              ...Object.fromEntries(data),
              eventId: params.get('eventId') || undefined,
              orderId: params.get('orderId') || undefined,
              ticketId: params.get('ticketId') || undefined,
            });
            navigate(`/support/${item.id}`);
          }}
        />
      </section>
    </>
  );
}
export function CasePage() {
  const { id } = useParams();
  const t = useT();
  const user = useUser()!;
  const resource = useResource<Model<'SupportCase'>>(`/support/cases/${id}`, 5000);
  const [reply, setReply] = useState(0);
  return (
    <Resource value={resource}>
      {(item) => {
        const canHandle =
          user.roles.includes('platform_admin') ||
          item.assigneeUserId === user.id ||
          (item.requesterUserId !== user.id &&
            user.roles.includes('organizer') &&
            item.handledBy === 'organizer');
        return (
          <>
            <Link className="back" to="/support">
              ← {t('Support')}
            </Link>
            <h1>{item.subject}</h1>
            <p>
              {t(item.category)} · {t(item.status)} · {t(item.handledBy || '')}
            </p>
            <div className="actions">
              {item.eventId && <Link to={`/events/${item.eventId}`}>{t('Events')}</Link>}
              {item.orderId && <Link to={`/orders/${item.orderId}`}>{t('Orders')}</Link>}
              {item.ticketId && <Link to={`/tickets/${item.ticketId}`}>{t('Ticket')}</Link>}
            </div>
            <div className="two-col">
              <section className="card">
                <div aria-live="polite">
                  {item.messages?.map((message) => (
                    <article
                      key={message.id}
                      className={`message ${message.authorUserId === user.id ? 'mine' : ''}`}
                    >
                      <strong>{message.authorName}</strong>
                      <small>{date(message.createdAt)}</small>
                      <p>{message.body}</p>
                      {message.attachments?.map((file) => (
                        <Action
                          key={file.id}
                          run={() => download(`/support/attachments/${file.id}`, file.filename)}
                        >
                          {file.filename}
                        </Action>
                      ))}
                    </article>
                  ))}
                </div>
                <Form
                  key={reply}
                  submit="Send"
                  fields={[{ name: 'body', label: 'Message', type: 'textarea', required: true }]}
                  onSubmit={async (data) => {
                    await send(`/support/cases/${id}/messages`, { body: text(data, 'body') });
                    setReply((v) => v + 1);
                    resource.reload();
                  }}
                />
                <details>
                  <summary>{t('Attachment')} (PNG, JPEG, PDF ≤ 5 MB)</summary>
                  <Form
                    fields={[
                      { name: 'file', label: 'Attachment', type: 'file', required: true },
                      { name: 'body', label: 'Message' },
                    ]}
                    submit="Send"
                    onSubmit={async (data) => {
                      await api(`/support/cases/${id}/attachments`, { method: 'POST', body: data });
                      resource.reload();
                    }}
                  />
                </details>
              </section>
              <section className="card">
                {canHandle && (
                  <Form
                    key={item.status + item.assigneeUserId}
                    fields={[
                      {
                        name: 'status',
                        label: 'Status',
                        value: item.status,
                        options: options('open', 'in_progress', 'waiting_for_customer', 'resolved'),
                      },
                      {
                        name: 'assigneeUserId',
                        label: 'Assign to user ID',
                        value: item.assigneeUserId,
                      },
                    ]}
                    onSubmit={async (data) => {
                      await send(
                        `/support/cases/${id}`,
                        {
                          status: text(data, 'status'),
                          assigneeUserId: text(data, 'assigneeUserId') || null,
                        },
                        'PATCH',
                      );
                      resource.reload();
                    }}
                  />
                )}
                {item.handledBy === 'organizer' && (
                  <details>
                    <summary>{t('Escalate to platform')}</summary>
                    <Form
                      fields={[
                        { name: 'reason', label: 'Reason', type: 'textarea', required: true },
                      ]}
                      submit="Escalate to platform"
                      onSubmit={async (data) => {
                        await send(`/support/cases/${id}/escalate`, {
                          reason: text(data, 'reason'),
                        });
                        resource.reload();
                      }}
                    />
                  </details>
                )}
              </section>
            </div>
          </>
        );
      }}
    </Resource>
  );
}
