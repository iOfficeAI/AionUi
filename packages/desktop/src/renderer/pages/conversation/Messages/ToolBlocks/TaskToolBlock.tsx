/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UnifiedToolBlock } from '@/common/chat/unifiedToolBlock';
import { hasRunningStatus } from '@/common/chat/unifiedToolBlock';
import { truncate } from '@/common/chat/toolBlockPresentation';
import CategoryIcon from './CategoryIcon';
import StatusDot from './StatusDot';
import ToolBlockDetail from './ToolBlockDetail';
import ToolBlockShell from './ToolBlockShell';
import GenericToolBlock from './GenericToolBlock';

/** Compact step row inside a Task block; click to expand full detail. */
const StepRow: React.FC<{ step: UnifiedToolBlock }> = ({ step }) => {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = Boolean(step.input || step.output);
  const summary = truncate(step.command ?? step.fileName ?? step.summary ?? step.title, 60);
  return (
    <div>
      <div
        role='button'
        aria-expanded={expanded}
        className='flex items-center gap-8px py-4px px-8px rd-4px cursor-pointer'
        onClick={() => {
          if (hasDetail) setExpanded(!expanded);
        }}
      >
        <CategoryIcon category={step.category} small />
        <span className='tool-block__mono flex-1 min-w-0 truncate text-1'>{summary}</span>
        {step.lineRange && <span className='text-4 text-11px'>{step.lineRange}</span>}
        <StatusDot status={step.status} small />
      </div>
      {expanded && hasDetail && (
        <div className='m-l-24px'>
          <ToolBlockDetail block={step} outputError={step.status === 'error'} />
        </div>
      )}
    </div>
  );
};

interface TaskToolBlockProps {
  block: UnifiedToolBlock;
  /** Subagent steps (already filtered to this block's key via parentCallId). */
  steps: UnifiedToolBlock[];
}

/** Subagent call block: subagent type chip + prompt + compact nested steps.
 * Status aggregates from the steps (running step keeps the block running). */
const TaskToolBlock: React.FC<TaskToolBlockProps> = ({ block, steps }) => {
  const { t } = useTranslation();
  if (!block.prompt && !block.subagentType && steps.length === 0) {
    return <GenericToolBlock block={block} />;
  }
  const aggregatedStatus = hasRunningStatus(steps) ? 'running' : block.status;
  return (
    <ToolBlockShell
      category='task'
      status={aggregatedStatus}
      summary={truncate(block.summary, 60)}
      chips={
        steps.length > 0 ? (
          <span className='tool-block__count'>{t('messages.toolBlocks.taskStepsLabel', { count: steps.length })}</span>
        ) : undefined
      }
    >
      {block.subagentType && (
        <span
          className='tool-block__count'
          style={{ background: 'var(--tool-cat-task-bg)', color: 'var(--tool-cat-task-fg)' }}
        >
          {block.subagentType}
        </span>
      )}
      {block.prompt && (
        <div className='mb-6px'>
          <div className='tool-detail-label'>{t('messages.toolBlocks.taskPromptLabel')}</div>
          <div
            className='text-12px text-2'
            style={{ background: 'var(--color-fill-1)', borderRadius: 6, padding: '8px 10px', lineHeight: 1.6 }}
          >
            {block.prompt}
          </div>
        </div>
      )}
      {steps.length > 0 && (
        <div className='mb-6px'>
          <div className='tool-detail-label'>{t('messages.toolBlocks.taskStepsLabel', { count: steps.length })}</div>
          {steps.map((step) => (
            <StepRow key={step.key} step={step} />
          ))}
        </div>
      )}
      {block.output && (
        <div>
          <div className='tool-detail-label'>{t('messages.toolBlocks.outputLabel')}</div>
          <pre className='tool-detail-content tool-block__mono'>{block.output}</pre>
        </div>
      )}
    </ToolBlockShell>
  );
};

export default TaskToolBlock;
