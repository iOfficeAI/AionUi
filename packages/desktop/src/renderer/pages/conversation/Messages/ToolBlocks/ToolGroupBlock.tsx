/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type { IMessageToolGroup } from '@/common/chat/chatLib';
import type { UnifiedToolBlock } from '@/common/chat/unifiedToolBlock';
import { hasRunningStatus, normalizeUnifiedToolBlocks } from '@/common/chat/unifiedToolBlock';
import { groupIntoSegments, partitionByParent } from '@/common/chat/toolBlockGrouping';
import { truncate } from '@/common/chat/toolBlockPresentation';
import ButlerDiagnoseButton from '@/renderer/components/base/ButlerDiagnoseButton';
import FeedbackButton from '@/renderer/components/base/FeedbackButton';
import { ToolConfirmationOutcome } from '@/renderer/utils/common';
import ConfirmationCard from '../components/ToolConfirmationCard';
import CategoryIcon from './CategoryIcon';
import StatusDot from './StatusDot';
import TaskToolBlock from './TaskToolBlock';
import TodoToolBlock from './TodoToolBlock';
import ToolBlockDetail from './ToolBlockDetail';
import './ToolBlocks.css';

type ConfirmationItem = IMessageToolGroup['content'][number] & {
  confirmationDetails: NonNullable<IMessageToolGroup['content'][number]['confirmationDetails']>;
};

export interface ToolGroupBlockProps {
  /** Raw messages of the summary (any of the three types). */
  messages?: Parameters<typeof normalizeUnifiedToolBlocks>[0];
  /** Pre-normalized blocks (alternative to `messages`). */
  blocks?: UnifiedToolBlock[];
  /** tool_group confirmation items, rendered via the preserved confirmation card. */
  confirmationItems?: ConfirmationItem[];
  /** tool_group message id, used for confirmMessage IPC. */
  messageId?: string;
  conversationId?: string;
}

/** Diagnose + feedback action row shown for failed tool calls. */
const ErrorActions: React.FC<{ block: UnifiedToolBlock }> = ({ block }) => (
  <div className='mt-4px flex justify-end'>
    <ButlerDiagnoseButton
      errorText={[block.title, block.summary, block.output].filter(Boolean).join('\n')}
    />
    <FeedbackButton module='conversation-session' />
  </div>
);

const FileRow: React.FC<{ block: UnifiedToolBlock }> = ({ block }) => {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = Boolean(block.input || block.output);
  return (
    <div>
      <div
        role='button'
        className='flex items-center gap-8px py-6px px-8px rd-4px cursor-pointer'
        onClick={() => hasDetail && setExpanded(!expanded)}
      >
        <CategoryIcon category={block.category} small />
        <span className='tool-block__mono text-1 text-12px'>{block.fileName ?? block.summary ?? block.title}</span>
        {block.lineRange && <span className='text-4 text-11px'>{block.lineRange}</span>}
        {block.diff && (
          <span className='text-11px' style={{ color: 'var(--tool-diff-add-fg)' }}>
            +{block.diff.added}
          </span>
        )}
        <span style={{ marginLeft: 'auto' }}>
          <StatusDot status={block.status} small />
        </span>
      </div>
      {block.status === 'error' && <ErrorActions block={block} />}
      {expanded && hasDetail && (
        <div className='m-l-24px'>
          <ToolBlockDetail block={block} outputError={block.status === 'error'} />
        </div>
      )}
    </div>
  );
};

const BashTimeline: React.FC<{ blocks: UnifiedToolBlock[] }> = ({ blocks }) => {
  const done = blocks.filter((b) => b.status === 'completed').length;
  const { t } = useTranslation();
  const [openKey, setOpenKey] = useState<string | null>(null);
  return (
    <div className='flex flex-col gap-4px'>
      {blocks.map((block) => (
        <div key={block.key} className='flex gap-10px'>
          <div className='flex flex-col items-center pt-6px'>
            <StatusDot status={block.status} small />
            <div style={{ width: 1.5, flex: 1, background: 'var(--color-border-2)', marginTop: 3 }} />
          </div>
          <div className='flex-1 min-w-0 pb-8px'>
            <div
              role='button'
              className='tool-block__mono text-1 text-12px inline-block px-6px py-2px rd-4px cursor-pointer'
              style={{ background: 'var(--color-fill-2)' }}
              onClick={() => setOpenKey(openKey === block.key ? null : block.key)}
            >
              {truncate(block.command ?? block.summary ?? block.title, 60)}
            </div>
            {block.status === 'error' && <ErrorActions block={block} />}
            {openKey === block.key && (block.input || block.output) && (
              <div className='mt-4px'>
                <ToolBlockDetail block={block} showInput={false} outputError={block.status === 'error'} />
              </div>
            )}
          </div>
        </div>
      ))}
      <span className='self-end text-3 text-11px'>{t('messages.toolBlocks.progressXY', { done, total: blocks.length })}</span>
    </div>
  );
};

const SEGMENT_TITLE: Record<string, string> = {
  list: 'messages.toolBlocks.fileOpsTitle',
  'bash-timeline': 'messages.toolBlocks.bashTitle',
  todo: 'messages.toolBlocks.todoTitle',
};

/** Grouped rendering for a run of consecutive tool messages: file list rows,
 * bash timeline, merged todo snapshot, nested task steps. */
const ToolGroupBlock: React.FC<ToolGroupBlockProps> = ({
  messages,
  blocks: propBlocks,
  confirmationItems = [],
  messageId,
  conversationId,
}) => {
  const { t } = useTranslation();
  const normalized = useMemo(() => propBlocks ?? normalizeUnifiedToolBlocks(messages ?? []), [propBlocks, messages]);
  const { rootBlocks, childrenByParent } = useMemo(() => partitionByParent(normalized), [normalized]);
  const segments = useMemo(() => groupIntoSegments(rootBlocks), [rootBlocks]);
  const running = hasRunningStatus(normalized) || confirmationItems.some((i) => i.status === 'Confirming');

  const handleConfirm = (call_id: string, outcome: ToolConfirmationOutcome) => {
    if (!messageId || !conversationId) return;
    ipcBridge.conversation.confirmMessage
      .invoke({ confirm_key: outcome, msg_id: messageId, call_id, conversation_id: conversationId })
      .catch((error) => console.error('Failed to confirm message:', error));
  };

  return (
    <div className='tool-block'>
      {confirmationItems.map((item) => (
        <ConfirmationCard key={item.call_id} content={item} onConfirm={(outcome) => handleConfirm(item.call_id, outcome)} />
      ))}
      {segments.map((segment, index) => {
        if (segment.kind === 'single') {
          const block = segment.block;
          if (block.category === 'task')
            return <TaskToolBlock key={block.key} block={block} steps={childrenByParent.get(block.key) ?? []} />;
          if (block.category === 'todo') return <TodoToolBlock key={block.key} block={block} />;
          return (
            <div key={block.key}>
              <div className='tool-block__header'>
                <CategoryIcon category={block.category} small />
                <span className='tool-block__summary'>{block.fileName ?? block.summary ?? block.title}</span>
                <span style={{ marginLeft: 'auto' }}>
                  <StatusDot status={block.status} small />
                </span>
              </div>
              {block.status === 'error' && <ErrorActions block={block} />}
            </div>
          );
        }
        const titleKey = SEGMENT_TITLE[segment.kind];
        const doneCount = segment.kind === 'todo' ? undefined : segment.blocks.filter((b) => b.status === 'completed').length;
        return (
          <div key={index} className={index > 0 ? 'mt-4px' : undefined}>
            <div className='tool-block__header' style={{ cursor: 'default' }}>
              <CategoryIcon category={segment.kind === 'bash-timeline' ? 'bash' : segment.kind === 'todo' ? 'todo' : 'read'} />
              <span className='tool-block__title'>{t(titleKey)}</span>
              <span className='tool-block__count'>{segment.kind === 'todo' ? segment.updateCount : segment.blocks.length}</span>
              {doneCount !== undefined && (
                <span className='tool-block__count'>
                  {t('messages.toolBlocks.progressXY', { done: doneCount, total: segment.blocks.length })}
                </span>
              )}
              <span style={{ marginLeft: 'auto' }}>
                <StatusDot status={running ? 'running' : 'completed'} />
              </span>
            </div>
            <div className='tool-block__body-inner' style={{ paddingTop: 4, paddingBottom: 6 }}>
              {segment.kind === 'bash-timeline' && <BashTimeline blocks={segment.blocks} />}
              {segment.kind === 'list' && segment.blocks.map((b) => <FileRow key={b.key} block={b} />)}
              {segment.kind === 'todo' && <TodoToolBlock block={segment.latest} updateCount={segment.updateCount} />}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ToolGroupBlock;
