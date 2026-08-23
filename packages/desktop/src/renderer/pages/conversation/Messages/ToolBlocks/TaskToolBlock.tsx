/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { UnifiedToolBlock } from '@/common/chat/unifiedToolBlock';
import { hasRunningStatus } from '@/common/chat/unifiedToolBlock';
import { getToolTitleKey } from '@/common/chat/toolBlockConstants';
import { truncate } from '@/common/chat/toolBlockPresentation';
import BashToolBlock from './BashToolBlock';
import EditToolBlock from './EditToolBlock';
import GenericToolBlock from './GenericToolBlock';
import ReadToolBlock from './ReadToolBlock';
import TodoToolBlock from './TodoToolBlock';
import ToolBlockShell from './ToolBlockShell';

/** Render a subagent step through the same single-block components as a
 * top-level tool call, so nested execution looks identical to flat execution. */
const renderStep = (step: UnifiedToolBlock): React.ReactNode => {
  switch (step.category) {
    case 'edit':
      return <EditToolBlock block={step} />;
    case 'bash':
      return <BashToolBlock block={step} />;
    case 'read':
      return <ReadToolBlock block={step} />;
    case 'todo':
      return <TodoToolBlock block={step} />;
    default:
      return <GenericToolBlock block={step} />;
  }
};

interface TaskToolBlockProps {
  block: UnifiedToolBlock;
  /** Subagent steps (already filtered to this block's key via parentCallId). */
  steps: UnifiedToolBlock[];
}

/** Subagent call block: subagent type chip + prompt + nested steps rendered as
 * full tool blocks. Status aggregates from the steps (running step keeps the
 * block running). */
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
      titleKey={getToolTitleKey(block.title)}
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
          <div className='flex flex-col gap-8px'>
            {steps.map((step) => (
              <div key={step.key}>{renderStep(step)}</div>
            ))}
          </div>
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
