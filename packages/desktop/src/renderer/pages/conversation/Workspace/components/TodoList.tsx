import type { PlanUpdate } from '@/common/types/platform/acpTypes';
import { Progress } from '@arco-design/web-react';
import { CheckOne, Loading, Round } from '@icon-park/react';
import type { TFunction } from 'i18next';
import React from 'react';

type TodoEntry = PlanUpdate['update']['entries'][number];

type TodoListProps = {
  t: TFunction;
  entries: TodoEntry[];
  completedCount: number;
  totalCount: number;
};

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-danger-6',
  medium: 'text-warning-6',
  low: 'text-t-tertiary',
};

const TodoList: React.FC<TodoListProps> = ({ t, entries, completedCount, totalCount }) => {
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className='flex flex-col size-full'>
      <div className='px-12px py-8px'>
        <div className='flex items-center justify-between mb-4px'>
          <span className='text-12px text-t-secondary'>
            {t('conversation.workspace.todos.progress', { completed: completedCount, total: totalCount })}
          </span>
          <span className='text-12px text-t-tertiary'>{percent}%</span>
        </div>
        <Progress percent={percent} showText={false} size='mini' color='rgb(var(--green-6))' />
      </div>
      <div className='flex flex-col gap-2px px-8px pb-8px overflow-y-auto flex-1'>
        {entries.map((entry, index) => (
          <div
            key={index}
            className='flex items-start gap-8px px-4px py-6px rd-6px hover:bg-bg-hover transition-colors'
          >
            <span className='shrink-0 mt-2px flex items-center justify-center size-18px'>
              {entry.status === 'completed' ? (
                <CheckOne size={16} className='text-success-6' strokeWidth={3} />
              ) : entry.status === 'in_progress' ? (
                <Loading size={16} className='text-primary-6' spin />
              ) : (
                <Round size={16} className='text-t-disabled' />
              )}
            </span>
            <span
              className={`text-13px leading-20px flex-1 min-w-0 break-words ${
                entry.status === 'completed' ? 'line-through text-t-disabled' : 'text-t-primary'
              }`}
            >
              {entry.content}
            </span>
            {entry.priority && (
              <span
                className={`shrink-0 text-10px font-medium uppercase mt-2px ${PRIORITY_COLORS[entry.priority] ?? ''}`}
              >
                {t(`conversation.workspace.todos.priority.${entry.priority}`, {
                  defaultValue: entry.priority,
                })}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TodoList;
