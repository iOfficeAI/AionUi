/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { UnifiedToolBlock } from '@/common/chat/unifiedToolBlock';
import { getToolTitleKey } from '@/common/chat/toolBlockConstants';
import GenericToolBlock from './GenericToolBlock';
import ToolBlockShell from './ToolBlockShell';

const TODO_ITEM_ICON: Record<string, string> = {
  completed: '✓',
  in_progress: '',
  pending: '',
};

/** TodoWrite snapshot: progress chip + checklist with per-item status icons. */
const TodoToolBlock: React.FC<{ block: UnifiedToolBlock; updateCount?: number }> = ({ block, updateCount }) => {
  const { t } = useTranslation();
  const items = block.todoItems;
  if (!items || items.length === 0) return <GenericToolBlock block={block} />;
  const done = items.filter((i) => i.status === 'completed').length;
  return (
    <ToolBlockShell
      category='todo'
      status={block.status}
      titleKey={getToolTitleKey(block.title)}
      chips={
        <>
          {updateCount !== undefined && updateCount > 1 && (
            <span className='tool-block__count'>{t('messages.toolBlocks.updatedNTimes', { count: updateCount })}</span>
          )}
          <span className='tool-block__count'>
            {t('messages.toolBlocks.progressXY', { done, total: items.length })}
          </span>
        </>
      }
    >
      {items.map((item, index) => (
        <div
          key={index}
          className='flex items-center gap-10px py-4px px-8px rd-4px'
          style={item.status === 'in_progress' ? { background: 'var(--color-fill-1)' } : undefined}
        >
          <span
            className='tool-block__todo-check'
            data-status={item.status}
            style={
              item.status === 'completed'
                ? { background: 'var(--tool-cat-read-bg)', color: 'var(--tool-diff-add-fg)' }
                : item.status === 'in_progress'
                  ? { background: 'var(--tool-cat-edit-bg)' }
                  : { border: '1.5px solid var(--color-text-4)' }
            }
          >
            {TODO_ITEM_ICON[item.status]}
          </span>
          <span
            className={`text-12px ${item.status === 'completed' ? 'text-3 line-through' : item.status === 'in_progress' ? 'text-1 font-medium' : 'text-2'}`}
          >
            {item.content}
          </span>
        </div>
      ))}
    </ToolBlockShell>
  );
};

export default TodoToolBlock;
