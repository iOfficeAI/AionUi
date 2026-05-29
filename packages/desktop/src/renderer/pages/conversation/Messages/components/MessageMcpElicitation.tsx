/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessagePermission, TMessage } from '@/common/chat/chatLib';
import { ipcBridge } from '@/common';
import { useUpdateMessageList } from '@/renderer/pages/conversation/Messages/hooks';
import { Button, Card, Input, Tag, Typography } from '@arco-design/web-react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

/**
 * MCP elicitation prompt: a free-form, schema-driven input request raised by a
 * tool mid-call. Mirrors the MCP `elicitation/create` flow but folded onto the
 * existing `IMessagePermission` carrier because aioncore parks elicitations on
 * the same Confirmation queue as shell approvals (the HTTP-only MCP server
 * can't do server→client reverse calls natively).
 *
 * Behaviour:
 *   - Schema is forwarded as a JSON string in `options[0].params.schema`. We
 *     do a best-effort parse to extract top-level `properties` so the form can
 *     label each field; non-parseable schemas fall back to a single textarea.
 *   - Submit → POST `{ value: 'submit', payload: <form-object> }`. The
 *     backend unwraps `payload` and hands it to the parked tool call.
 *   - Cancel → POST `{ value: 'cancel' }`. Tool sees `Declined` and fails
 *     closed.
 *
 * Sub-agent attribution: `parent_session_id` set on the content means this
 * elicitation came from a child OpenCode session — we surface that with a
 * tag so the user knows it's a sub-agent asking, not the main agent.
 */
const MessageMcpElicitation: React.FC<{ message: IMessagePermission }> = React.memo(({ message }) => {
  const { t } = useTranslation();
  const updateMessageList = useUpdateMessageList();
  const content = message.content || ({} as IMessagePermission['content']);
  const { description, title, call_id, options = [], parent_session_id, session_id } = content;

  const schema = useMemo(() => {
    const raw = options[0]?.params?.schema;
    if (!raw || typeof raw !== 'string') return null;
    try {
      return JSON.parse(raw) as { properties?: Record<string, { description?: string; type?: string }> };
    } catch {
      return null;
    }
  }, [options]);

  const fields = useMemo(() => {
    if (!schema?.properties) return [] as Array<{ name: string; description?: string; type?: string }>;
    return Object.entries(schema.properties).map(([name, spec]) => ({
      name,
      description: spec.description,
      type: spec.type,
    }));
  }, [schema]);

  const initialResponded = Boolean((content as { responded?: boolean }).responded);
  const [values, setValues] = useState<Record<string, string>>({});
  const [rawResponse, setRawResponse] = useState('');
  const [isResponding, setIsResponding] = useState(false);
  const [hasResponded, setHasResponded] = useState(initialResponded);

  const buildPayload = (): unknown => {
    if (fields.length > 0) {
      const payload: Record<string, unknown> = {};
      for (const f of fields) {
        const v = values[f.name] ?? '';
        if (f.type === 'number' || f.type === 'integer') {
          const n = Number(v);
          payload[f.name] = Number.isFinite(n) ? n : v;
        } else if (f.type === 'boolean') {
          payload[f.name] = v === 'true' || v === '1';
        } else {
          payload[f.name] = v;
        }
      }
      return payload;
    }
    // No schema → try to parse as JSON, fall back to `{ raw: <text> }`.
    const trimmed = rawResponse.trim();
    if (!trimmed) return { raw: '' };
    try {
      return JSON.parse(trimmed);
    } catch {
      return { raw: trimmed };
    }
  };

  const persistResolution = (response: unknown) => {
    updateMessageList((list) =>
      list.map((m) => {
        if (m.id !== message.id) return m;
        return {
          ...m,
          content: { ...(m.content as object), responded: true, response },
        } as unknown as TMessage;
      })
    );
  };

  const handleSubmit = async () => {
    if (hasResponded) return;
    setIsResponding(true);
    try {
      const payload = buildPayload();
      await ipcBridge.conversation.confirmation.confirm.invoke({
        conversation_id: message.conversation_id,
        call_id,
        msg_id: message.msg_id || '',
        data: { value: 'submit', payload },
        always_allow: false,
      });
      setHasResponded(true);
      persistResolution(payload);
    } catch (error) {
      console.error('Error submitting elicitation:', error);
    } finally {
      setIsResponding(false);
    }
  };

  const handleCancel = async () => {
    if (hasResponded) return;
    setIsResponding(true);
    try {
      await ipcBridge.conversation.confirmation.confirm.invoke({
        conversation_id: message.conversation_id,
        call_id,
        msg_id: message.msg_id || '',
        data: { value: 'cancel' },
        always_allow: false,
      });
      setHasResponded(true);
      persistResolution(null);
    } catch (error) {
      console.error('Error cancelling elicitation:', error);
    } finally {
      setIsResponding(false);
    }
  };

  const isSubagent = Boolean(parent_session_id);
  const sessionLabel = isSubagent
    ? t('messages.remoteMcpElicitation.fromSubagent')
    : session_id
      ? t('messages.remoteMcpElicitation.fromParent')
      : t('messages.remoteMcpElicitation.fromUnknown');

  return (
    <Card
      className='mb-4'
      bordered={false}
      style={{ background: 'var(--bg-1)' }}
      data-testid='message-mcp-elicitation-card'
    >
      <div className='space-y-4'>
        <div className='flex items-center gap-2 flex-wrap'>
          {isSubagent && (
            <Tag color='arcoblue' size='small'>
              {t('messages.remoteSubagent.tag')}
            </Tag>
          )}
          <span className='text-2xl'>🔌</span>
          <Text className='block font-medium'>{title || t('messages.remoteMcpElicitation.title')}</Text>
        </div>
        <div className='text-xs text-t-secondary'>{sessionLabel}</div>
        {description && <div className='text-sm text-t-primary break-words'>{description}</div>}
        {!hasResponded && (
          <div className='space-y-3'>
            {fields.length > 0 ? (
              fields.map((f) => (
                <div key={f.name} className='space-y-1'>
                  <div className='text-xs text-t-secondary'>
                    {f.name}
                    {f.type ? ` (${f.type})` : ''}
                  </div>
                  {f.description && <div className='text-xs text-t-secondary'>{f.description}</div>}
                  <Input
                    size='small'
                    value={values[f.name] ?? ''}
                    onChange={(v) => setValues((prev) => ({ ...prev, [f.name]: v }))}
                    placeholder={f.description || f.name}
                    data-testid={`mcp-elicitation-field-${f.name}`}
                  />
                </div>
              ))
            ) : (
              <div className='space-y-1'>
                <div className='text-xs text-t-secondary'>{t('messages.remoteMcpElicitation.freeText')}</div>
                <Input.TextArea
                  rows={4}
                  value={rawResponse}
                  onChange={setRawResponse}
                  placeholder={t('messages.remoteMcpElicitation.freeTextHint')}
                  data-testid='mcp-elicitation-textarea'
                />
              </div>
            )}
            <div className='flex gap-2'>
              <Button
                type='primary'
                size='mini'
                loading={isResponding}
                onClick={handleSubmit}
                data-testid='mcp-elicitation-submit'
              >
                {t('messages.remoteMcpElicitation.submit')}
              </Button>
              <Button size='mini' disabled={isResponding} onClick={handleCancel} data-testid='mcp-elicitation-cancel'>
                {t('messages.remoteMcpElicitation.cancel')}
              </Button>
            </div>
          </div>
        )}
        {hasResponded && (
          <div
            className='mt-10px p-2 rounded-md border'
            style={{ backgroundColor: 'var(--color-success-light-1)', borderColor: 'rgb(var(--success-3))' }}
          >
            <Text className='text-sm' style={{ color: 'rgb(var(--success-6))' }}>
              ✓ {t('messages.responseSentSuccessfully')}
            </Text>
          </div>
        )}
      </div>
    </Card>
  );
});

export default MessageMcpElicitation;
