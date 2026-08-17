/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IMessageAcpTerminalOutput } from '@/common/chat/chatLib';
import { Button, Card, Tag } from '@arco-design/web-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Live card for a client-hosted terminal (ACP terminal/*): the delegated
 * command runs in OUR process tree, so output streams in real time and the
 * stop button kills just this command — the agent observes the signal exit
 * and the turn continues.
 */
const MessageAcpTerminalOutput: React.FC<{ message: IMessageAcpTerminalOutput }> = ({ message }) => {
  const { t } = useTranslation();
  const { content, conversation_id } = message;
  const outputRef = useRef<HTMLPreElement>(null);
  const [killing, setKilling] = useState(false);

  const running = !content?.exit_status;

  // Tail-follow the output while the command runs.
  useEffect(() => {
    const el = outputRef.current;
    if (el && running) {
      el.scrollTop = el.scrollHeight;
    }
  }, [content?.output, running]);

  const handleStop = useCallback(async () => {
    if (!conversation_id || !content?.terminal_id) return;
    setKilling(true);
    try {
      await ipcBridge.conversation.killTerminal.invoke({
        conversation_id,
        terminal_id: content.terminal_id,
      });
    } catch (error) {
      console.error('[MessageAcpTerminalOutput] kill failed:', error);
      setKilling(false);
    }
  }, [conversation_id, content?.terminal_id]);

  if (!content?.terminal_id) {
    return null;
  }

  const exit = content.exit_status;
  const statusTag = running ? (
    <Tag color='arcoblue' size='small' data-testid='terminal-card-status'>
      {t('conversation.terminal.running', { defaultValue: 'Running' })}
    </Tag>
  ) : exit?.signaled ? (
    <Tag color='orange' size='small' data-testid='terminal-card-status'>
      {t('conversation.terminal.stopped', { defaultValue: 'Stopped' })}
    </Tag>
  ) : (
    <Tag color={exit?.exit_code === 0 ? 'green' : 'red'} size='small' data-testid='terminal-card-status'>
      {t('conversation.terminal.exited', { defaultValue: 'Exit {{code}}', code: exit?.exit_code ?? '?' })}
    </Tag>
  );

  return (
    <Card className='w-full mb-2' size='small' bordered>
      <div className='flex items-center gap-2 mb-2 min-w-0'>
        <code
          dir='ltr'
          className='text-13px font-mono text-t-primary truncate flex-1'
          data-testid='terminal-card-command'
        >
          $ {content.command}
        </code>
        {statusTag}
        {running && (
          <Button size='mini' status='danger' loading={killing} onClick={handleStop} data-testid='terminal-card-stop'>
            {t('conversation.terminal.stop', { defaultValue: 'Stop' })}
          </Button>
        )}
      </div>
      {(content.output || running) && (
        <pre
          ref={outputRef}
          data-testid='terminal-card-output'
          dir='ltr'
          className='bg-1 p-2 rounded text-xs font-mono overflow-x-auto overflow-y-auto max-h-320px whitespace-pre-wrap m-0'
        >
          {content.truncated
            ? `…${t('conversation.terminal.truncated', { defaultValue: '(earlier output truncated)' })}\n`
            : ''}
          {content.output || ''}
        </pre>
      )}
    </Card>
  );
};

export default MessageAcpTerminalOutput;
