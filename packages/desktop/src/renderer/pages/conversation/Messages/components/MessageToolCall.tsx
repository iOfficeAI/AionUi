/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IMessageToolCall } from '@/common/chat/chatLib';
import { normalizeToolCall } from '@/common/chat/normalizeToolCall';
import type { NormalizedToolStatus } from '@/common/chat/normalizeToolCall';
import { formatRetainedOutputSize } from '@/common/chat/retainedToolOutput';
import FileChangesPanel from '@/renderer/components/base/FileChangesPanel';
import { useDiffPreviewHandlers } from '@/renderer/hooks/file/useDiffPreviewHandlers';
import { parseDiff } from '@/renderer/utils/file/diffUtils';
import { Badge, Button, Message } from '@arco-design/web-react';
import { IconDown, IconRight } from '@arco-design/web-react/icon';
import { createTwoFilesPatch } from 'diff';
import React, { useCallback, useMemo, useState } from 'react';
import type { BadgeProps } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import './MessageToolGroupSummary.css';

const statusToBadge = (status: NormalizedToolStatus): BadgeProps['status'] => {
  switch (status) {
    case 'completed':
      return 'success';
    case 'error':
      return 'error';
    case 'running':
      return 'processing';
    default:
      return 'default';
  }
};

const ReplacePreview: React.FC<{ message: IMessageToolCall }> = ({ message }) => {
  const file_path = message.content.args?.file_path || message.content.input?.file_path || '';
  const old_string = message.content.args?.old_string ?? message.content.input?.old_string ?? '';
  const new_string = message.content.args?.new_string ?? message.content.input?.new_string ?? '';

  const diffText = useMemo(() => {
    return createTwoFilesPatch(file_path, file_path, old_string, new_string, '', '', { context: 3 });
  }, [file_path, old_string, new_string]);

  const fileInfo = useMemo(() => parseDiff(diffText, file_path), [diffText, file_path]);
  const display_name = file_path.split(/[/\\]/).pop() || file_path;
  const { handleFileClick, handleDiffClick } = useDiffPreviewHandlers({ diffText, display_name, file_path });

  return (
    <FileChangesPanel
      title={fileInfo.file_name}
      files={[fileInfo]}
      onFileClick={handleFileClick}
      onDiffClick={handleDiffClick}
      defaultExpanded={true}
    />
  );
};

const GenericToolCall: React.FC<{ message: IMessageToolCall }> = ({ message }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [fullOutput, setFullOutput] = useState<string | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);

  const normalized = useMemo(() => normalizeToolCall(message), [message]);
  const retained = normalized?.retainedOutput;
  const displayOutput = fullOutput ?? normalized?.output;
  const hasDetail = Boolean(normalized?.input || displayOutput);
  const canLoadFull = Boolean(retained && normalized?.conversationId && !fullOutput);

  const handleLoadFull = useCallback(async () => {
    if (!retained || !normalized?.conversationId || loadingFull) return;
    try {
      setLoadingFull(true);
      const result = await ipcBridge.conversation.getRetainedOutput.invoke({
        conversation_id: normalized.conversationId,
        reference: retained.reference,
      });
      if (!result?.content) {
        Message.error(t('conversation.retainedOutput.loadFailed'));
        return;
      }
      setFullOutput(result.content);
    } catch (error) {
      console.error('load retained tool output failed:', error);
      Message.error(t('conversation.retainedOutput.loadFailed'));
    } finally {
      setLoadingFull(false);
    }
  }, [loadingFull, normalized?.conversationId, retained, t]);

  if (!normalized) {
    return <div className='text-t-primary'>{message.content.name}</div>;
  }

  return (
    <div className='flex flex-col'>
      <div className='flex flex-row color-#86909C gap-12px items-center'>
        <Badge
          status={statusToBadge(normalized.status)}
          className={normalized.status === 'running' ? 'badge-breathing' : ''}
        />
        <span
          className={
            'flex-1 min-w-0' +
            (expanded ? ' break-all' : ' truncate') +
            (hasDetail ? ' cursor-pointer hover:color-#4E5969' : '')
          }
          onClick={hasDetail ? () => setExpanded(!expanded) : undefined}
        >
          <span className='font-medium text-13px'>{normalized.name}</span>
          {normalized.description && <span className='m-l-4px opacity-80 text-13px'>{normalized.description}</span>}
        </span>
        {hasDetail && (
          <span
            className='flex-shrink-0 cursor-pointer hover:color-#4E5969 transition-colors'
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <IconDown style={{ fontSize: 12 }} /> : <IconRight style={{ fontSize: 12 }} />}
          </span>
        )}
      </div>
      {expanded && hasDetail && (
        <div className='tool-detail-panel m-l-20px m-t-4px'>
          {normalized.input && (
            <div className='tool-detail-section'>
              <div className='tool-detail-label'>Input</div>
              <pre className='tool-detail-content'>{normalized.input}</pre>
            </div>
          )}
          {displayOutput && (
            <div className='tool-detail-section'>
              <div className='tool-detail-label'>Output</div>
              {retained && !fullOutput ? (
                <div className='mb-6px text-12px text-t-secondary'>
                  {t('conversation.retainedOutput.previewNote', {
                    size: formatRetainedOutputSize(retained.size),
                  })}
                </div>
              ) : null}
              <pre className='tool-detail-content'>{displayOutput}</pre>
              {canLoadFull ? (
                <Button
                  className='mt-8px'
                  size='mini'
                  type='outline'
                  loading={loadingFull}
                  onClick={() => void handleLoadFull()}
                  data-testid='btn-load-retained-tool-output'
                >
                  {loadingFull
                    ? t('conversation.retainedOutput.loading')
                    : t('conversation.retainedOutput.loadFull', {
                        size: formatRetainedOutputSize(retained!.size),
                      })}
                </Button>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const MessageToolCall: React.FC<{ message: IMessageToolCall }> = ({ message }) => {
  const { name } = message.content;
  if (name === 'replace' || name === 'Edit') {
    return <ReplacePreview message={message} />;
  }
  return <GenericToolCall message={message} />;
};

export default MessageToolCall;
