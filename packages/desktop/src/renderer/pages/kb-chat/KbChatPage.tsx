/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input } from '@arco-design/web-react';
import { useLocation, useParams } from 'react-router-dom';
import { KbChatHeader } from '@/renderer/components/kb-chat/KbChatHeader';
import { useKbChat } from '@/renderer/hooks/kb-chat/useKbChat';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import styles from './KbChatPage.module.css';

export const KbChatPage: React.FC = () => {
  const { user } = useAuth();
  const token = user?.token ?? null;
  const { kbId = '' } = useParams<{ kbId: string }>();
  const location = useLocation();
  const kbName = (location.state as { kbName?: string } | null)?.kbName ?? kbId;
  const { status, messages, send, abort, retry, lastError } = useKbChat({ kbId, token });
  const { t } = useTranslation();

  return (
    <div className={styles.root}>
      <KbChatHeader kbName={kbName} />
      <div className={styles.body}>
        {messages.length === 0 && <div className={styles.empty}>{t('kb-chat.empty')}</div>}
        {messages.map((m, i) => (
          <div key={i} className={styles.message}>
            <strong>{m.role === 'user' ? 'You' : 'KB'}:</strong> {m.content}
          </div>
        ))}
        {status === 'streaming' && (
          <div className={styles.loading} data-testid='kb-chat-loading'>
            <span className={styles.loadingDot} />
            <span className={styles.loadingDot} />
            <span className={styles.loadingDot} />
            <span className={styles.loadingText}>{t('kb-chat.loading', { defaultValue: 'KB is thinking…' })}</span>
          </div>
        )}
        {status === 'error' && lastError && (
          <div className={styles.error}>
            {t(`kb-chat.error.${lastError.code}`, { message: lastError.message, defaultValue: lastError.message })}
            <Button onClick={retry} size='mini'>
              {t('kb-chat.actions.retry')}
            </Button>
          </div>
        )}
      </div>
      <KbChatInput disabled={status === 'streaming'} streaming={status === 'streaming'} onSend={send} onStop={abort} />
    </div>
  );
};

type KbChatInputProps = {
  disabled: boolean;
  streaming: boolean;
  onSend: (q: string) => void;
  onStop: () => void;
};

const KbChatInput: React.FC<KbChatInputProps> = ({ disabled, streaming, onSend, onStop }) => {
  const { t } = useTranslation();
  const [value, setValue] = useState('');

  const submit = (): void => {
    const q = value.trim();
    if (!q) return;
    onSend(q);
    setValue('');
  };

  return (
    <div className={styles.inputBar}>
      <Input.TextArea
        className={styles.input}
        placeholder={t('kb-chat.input.placeholder')}
        value={value}
        onChange={(v) => setValue(v)}
        onPressEnter={(e) => {
          if (e.shiftKey) return;
          e.preventDefault();
          submit();
        }}
        autoSize={{ minRows: 3, maxRows: 8 }}
      />
      {streaming ? (
        <Button onClick={onStop}>{t('kb-chat.actions.stop')}</Button>
      ) : (
        <Button type='primary' disabled={disabled || !value.trim()} onClick={submit}>
          {t('kb-chat.actions.send')}
        </Button>
      )}
    </div>
  );
};

export default KbChatPage;
