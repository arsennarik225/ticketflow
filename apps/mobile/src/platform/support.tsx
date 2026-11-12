import {
  Caption,
  Choice,
  Disclosure,
  FieldLabel,
  FormContainer,
  Heading,
  NativeButton,
  Option,
  Paragraph,
  Section,
  Strong,
  Summary,
  Title,
} from './native';
import { FormValues } from './forms';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from './navigation';
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
      <Section variant="toolbar">
        <Title>{t('Support')}</Title>
        <Link variant="button primary" to={`/support/new?${params}`}>
          + {t('New case')}
        </Link>
      </Section>
      <FormContainer
        variant="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormValues(e.currentTarget);
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
        <FieldLabel>
          {t('Status')}
          <Choice name="status" defaultValue={params.get('status') || ''}>
            {['', 'open', 'in_progress', 'waiting_for_customer', 'resolved'].map((s) => (
              <Option key={s} value={s}>
                {t(s || 'All')}
              </Option>
            ))}
          </Choice>
        </FieldLabel>
        <FieldLabel>
          {t('Handled by')}
          <Choice name="handledBy" defaultValue={params.get('handledBy') || ''}>
            {['', 'organizer', 'platform'].map((s) => (
              <Option key={s} value={s}>
                {t(s || 'All')}
              </Option>
            ))}
          </Choice>
        </FieldLabel>
        <NativeButton>{t('Apply')}</NativeButton>
      </FormContainer>
      <Resource value={resource}>
        {(data) => (
          <>
            <List
              items={data.data}
              render={(item) => (
                <>
                  <Heading>
                    <Link to={`/support/${item.id}`}>{item.subject}</Link>
                  </Heading>
                  <Paragraph>
                    {t(item.category)} · {t(item.status)} · {t(item.handledBy || '')}
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
export function NewCasePage() {
  const t = useT();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  return (
    <>
      <Title>{t('New case')}</Title>
      <Section variant="card">
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
      </Section>
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
            <Link variant="back" to="/support">
              ← {t('Support')}
            </Link>
            <Title>{item.subject}</Title>
            <Paragraph>
              {t(item.category)} · {t(item.status)} · {t(item.handledBy || '')}
            </Paragraph>
            <Section variant="actions">
              {item.eventId && <Link to={`/events/${item.eventId}`}>{t('Events')}</Link>}
              {item.orderId && <Link to={`/orders/${item.orderId}`}>{t('Orders')}</Link>}
              {item.ticketId && <Link to={`/tickets/${item.ticketId}`}>{t('Ticket')}</Link>}
            </Section>
            <Section variant="two-col">
              <Section variant="card">
                <Section aria-live="polite">
                  {item.messages?.map((message) => (
                    <Section
                      key={message.id}
                      variant={`message ${message.authorUserId === user.id ? 'mine' : ''}`}
                    >
                      <Strong>{message.authorName}</Strong>
                      <Caption>{date(message.createdAt)}</Caption>
                      <Paragraph>{message.body}</Paragraph>
                      {message.attachments?.map((file) => (
                        <Action
                          key={file.id}
                          run={() => download(`/support/attachments/${file.id}`, file.filename)}
                        >
                          {file.filename}
                        </Action>
                      ))}
                    </Section>
                  ))}
                </Section>
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
                <Disclosure>
                  <Summary>{t('Attachment')} (PNG, JPEG, PDF ≤ 5 MB)</Summary>
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
                </Disclosure>
              </Section>
              <Section variant="card">
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
                  <Disclosure>
                    <Summary>{t('Escalate to platform')}</Summary>
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
                  </Disclosure>
                )}
              </Section>
            </Section>
          </>
        );
      }}
    </Resource>
  );
}
