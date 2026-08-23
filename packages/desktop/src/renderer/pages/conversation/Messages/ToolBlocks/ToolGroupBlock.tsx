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
import { getToolIconKey, truncate } from '@/common/chat/toolBlockPresentation';
import ButlerDiagnoseButton from '@/renderer/components/base/ButlerDiagnoseButton';
import FeedbackButton from '@/renderer/components/base/FeedbackButton';
import type { ToolConfirmationOutcome } from '@/renderer/utils/common';
import ConfirmationCard from '../components/ToolConfirmationCard';
import BashToolBlock from './BashToolBlock';
import CategoryIcon from './CategoryIcon';
import EditToolBlock from './EditToolBlock';
import GenericToolBlock from './GenericToolBlock';
import ReadToolBlock from './ReadToolBlock';
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
    <ButlerDiagnoseButton errorText={[block.title, block.summary, block.output].filter(Boolean).join('\n')} />
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
        className={`flex items-center gap-8px py-6px px-8px rd-4px${hasDetail ? ' cursor-pointer' : ''}`}
        onClick={() => hasDetail && setExpanded(!expanded)}
      >
        <CategoryIcon category={block.category} iconKey={getToolIconKey(block.title)} small />
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
              {truncate(block.summary ?? block.command ?? block.title, 60)}
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
      <span className='self-end text-3 text-11px'>
        {t('messages.toolBlocks.progressXY', { done, total: blocks.length })}
      </span>
    </div>
  );
};

const SEGMENT_TITLE: Record<string, string> = {
  list: 'messages.toolBlocks.fileOpsTitle',
  'bash-timeline': 'messages.toolBlocks.bashTitle',
  todo: 'messages.toolBlocks.todoTitle',
};

/** Isolated (non-grouped) block: render through the same single-block
 * components as UnifiedToolRenderer so it stays expandable. */
const renderSingleBlock = (block: UnifiedToolBlock, steps: UnifiedToolBlock[]) => {
  switch (block.category) {
    case 'edit':
      return <EditToolBlock block={block} />;
    case 'bash':
      return <BashToolBlock block={block} />;
    case 'read':
      return <ReadToolBlock block={block} />;
    case 'task':
      return <TaskToolBlock block={block} steps={steps} />;
    case 'todo':
      return <TodoToolBlock block={block} />;
    default:
      return <GenericToolBlock block={block} />;
  }
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
    <div className='tool-block-group'>
      {confirmationItems.map((item) => (
        <ConfirmationCard
          key={item.call_id}
          content={item}
          onConfirm={(outcome) => handleConfirm(item.call_id, outcome)}
        />
      ))}
      {segments.map((segment) => {
        if (segment.kind === 'single') {
          const block = segment.block;
          return (
            <div key={block.key}>
              {renderSingleBlock(block, childrenByParent.get(block.key) ?? [])}
              {block.status === 'error' && <ErrorActions block={block} />}
            </div>
          );
        }
        if (segment.kind === 'todo') {
          return <TodoToolBlock key={segment.latest.key} block={segment.latest} updateCount={segment.updateCount} />;
        }
        const titleKey = SEGMENT_TITLE[segment.kind];
        const doneCount = segment.blocks.filter((b) => b.status === 'completed').length;
        return (
          <div key={segment.blocks[0].key} className='tool-block'>
            <div className='tool-block__header' style={{ cursor: 'default' }}>
              <CategoryIcon category={segment.kind === 'bash-timeline' ? 'bash' : 'read'} />
              <span className='tool-block__title'>{t(titleKey)}</span>
              <span className='tool-block__count'>{segment.blocks.length}</span>
              <span className='tool-block__count'>
                {t('messages.toolBlocks.progressXY', { done: doneCount, total: segment.blocks.length })}
              </span>
              <span style={{ marginLeft: 'auto' }}>
                <StatusDot status={running ? 'running' : 'completed'} />
              </span>
            </div>
            <div style={{ padding: '2px 8px 8px' }}>
              {segment.kind === 'bash-timeline' && <BashTimeline blocks={segment.blocks} />}
              {segment.kind === 'list' && segment.blocks.map((b) => <FileRow key={b.key} block={b} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ToolGroupBlock;
