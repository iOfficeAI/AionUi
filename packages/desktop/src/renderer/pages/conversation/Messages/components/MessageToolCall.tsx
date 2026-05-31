/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageToolCall } from '@/common/chat/chatLib';
import { normalizeToolCall } from '@/common/chat/normalizeToolCall';
import FileChangesPanel from '@/renderer/components/base/FileChangesPanel';
import { useDiffPreviewHandlers } from '@/renderer/hooks/file/useDiffPreviewHandlers';
import { parseDiff } from '@/renderer/utils/file/diffUtils';
import { createTwoFilesPatch } from 'diff';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import ToolShell from './ToolShell';
import { STATE_LABEL_FALLBACK, STATE_LABEL_KEY, statusPillFromNormalized } from './StatusPill';
import './MessageToolGroupSummary.css';

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

const MessageToolCall: React.FC<{ message: IMessageToolCall }> = ({ message }) => {
  const { name } = message.content;
  const { t } = useTranslation();

  if (name === 'replace' || name === 'Edit') {
    return <ReplacePreview message={message} />;
  }

  const normalized = normalizeToolCall(message);
  if (!normalized) {
    return <div className='text-t-primary'>{name}</div>;
  }

  const hasDetail = Boolean(normalized.input || normalized.output);
  const state = statusPillFromNormalized(normalized.status);
  const stateLabel = t(STATE_LABEL_KEY[state], { defaultValue: STATE_LABEL_FALLBACK[state] });

  return (
    <ToolShell
      state={state}
      stateLabel={stateLabel}
      title={
        <>
          <span className='font-medium'>{normalized.name}</span>
          {normalized.description && (
            <span className='m-l-4px opacity-80'>{normalized.description}</span>
          )}
        </>
      }
      collapsible={hasDetail}
    >
      {hasDetail && (
        <div className='tool-detail-panel'>
          {normalized.input && (
            <div className='tool-detail-section'>
              <div className='tool-detail-label'>Input</div>
              <pre className='tool-detail-content'>{normalized.input}</pre>
            </div>
          )}
          {normalized.output && (
            <div className='tool-detail-section'>
              <div className='tool-detail-label'>Output</div>
              <pre className='tool-detail-content'>{normalized.output}</pre>
            </div>
          )}
        </div>
      )}
    </ToolShell>
  );
};

export default MessageToolCall;
