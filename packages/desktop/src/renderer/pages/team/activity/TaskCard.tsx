/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import { Popover, Tag, Tooltip } from '@arco-design/web-react';
import { Down, ListView, Lock, Up } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import type { ITeamTaskItem } from '@/common/types/team/teamTypes';
import { ACTIVITY_USER_IDENTITY } from './activityTypes';
import type { ActivityIdentityResolver } from './MessageCard';
import { clampStyle, useIsClamped } from './useIsClamped';
import { useActivityTaskIndex } from './ActivityTaskIndexContext';
import { formatActivityTime } from './activityTime';

type Props = {
  task: ITeamTaskItem;
  identity: ActivityIdentityResolver;
};

const STATUS_COLOR: Record<string, string> = {
  pending: 'gray',
  in_progress: 'arcoblue',
  completed: 'green',
  deleted: 'red',
};

/**
 * A single `blocked_by` dependency chip. Shows the resolved blocker subject
 * (falling back to a short id). Clicking jumps to + highlights the blocker's
 * card when it is on the board; otherwise it reveals a popover with the
 * blocker's subject/status/owner.
 */
const BlockedByTag: React.FC<{ dep: string }> = ({ dep }) => {
  const { t } = useTranslation();
  const { resolve, highlightTask } = useActivityTaskIndex();
  const [open, setOpen] = useState(false);
  const info = resolve(dep);
  const label = info
    ? t('team.activity.blockedByNamed', { name: info.subject, defaultValue: 'blocked by {{name}}' })
    : t('team.activity.blockedBy', { id: dep.slice(0, 6), defaultValue: 'blocked by #{{id}}' });

  const panel = (
    <div className='flex flex-col gap-4px max-w-240px'>
      <span className='text-13px font-medium'>
        {info?.subject ?? t('team.activity.blockerUnknown', { defaultValue: 'Task unavailable' })}
      </span>
      {info && (
        <span className='text-12px text-[color:var(--color-text-2)]'>
          {t(`team.activity.status.${info.status}`, { defaultValue: info.status })}
          {info.owner ? ` · ${info.owner}` : ''}
        </span>
      )}
    </div>
  );

  return (
    <Popover
      popupVisible={open}
      trigger='click'
      content={panel}
      // Prefer jump+highlight when the card is on the board; else reveal popover.
      onVisibleChange={(next) => {
        if (next && highlightTask(dep)) {
          setOpen(false);
          return;
        }
        setOpen(next);
      }}
    >
      <Tag
        size='small'
        color='orangered'
        className='cursor-pointer max-w-full'
        icon={<Lock theme='outline' size='11' fill='currentColor' />}
      >
        <span className='inline-block align-bottom max-w-[210px] truncate' title={label}>
          {label}
        </span>
      </Tag>
    </Popover>
  );
};

const TaskCard: React.FC<Props> = ({ task, identity }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const descRef = useRef<HTMLDivElement>(null);

  const ownerName =
    !task.owner || task.owner === ACTIVITY_USER_IDENTITY
      ? t('team.activity.userIdentity', { defaultValue: 'User / external' })
      : identity.nameOf(task.owner);
  const ownerColor = identity.colorOf(task.owner);
  const description = task.description ?? '';
  const isClamped = useIsClamped(descRef, [description, expanded]);
  const time = formatActivityTime(task.created_at);

  return (
    <div
      className='rounded-8px border border-solid border-[color:var(--border-base)] bg-1 p-8px flex flex-col gap-6px'
      data-testid='activity-task-card'
      data-task-id={task.id}
    >
      <div className='flex items-center gap-6px'>
        <ListView theme='outline' size='13' fill='currentColor' className='text-[color:var(--color-text-2)]' />
        <span className='truncate text-13px font-medium text-[color:var(--color-text-1)] flex-1'>{task.subject}</span>
        <Tag size='small' color={STATUS_COLOR[task.status] ?? 'gray'}>
          {t(`team.activity.status.${task.status}`, { defaultValue: task.status })}
        </Tag>
      </div>

      <div className='flex items-center gap-6px text-12px text-[color:var(--color-text-2)]'>
        <span className='inline-block w-8px h-8px rounded-full shrink-0' style={{ backgroundColor: ownerColor }} />
        <span className='truncate'>{ownerName}</span>
      </div>

      {task.blocked_by.length > 0 && (
        <div className='flex flex-wrap items-center gap-4px'>
          {task.blocked_by.map((dep) => (
            <BlockedByTag key={dep} dep={dep} />
          ))}
        </div>
      )}

      {description.length > 0 && (
        <div
          ref={descRef}
          className='text-12px text-[color:var(--color-text-2)] whitespace-pre-wrap break-words'
          style={expanded ? undefined : clampStyle(2)}
        >
          {description}
        </div>
      )}

      <div className='flex items-center gap-8px text-11px text-[color:var(--color-text-3)]'>
        {description.length > 0 && (isClamped || expanded) && (
          <Tooltip
            content={
              expanded
                ? t('team.activity.collapse', { defaultValue: 'Collapse' })
                : t('team.activity.expand', { defaultValue: 'Expand' })
            }
          >
            <span
              className='inline-flex items-center gap-2px cursor-pointer text-[color:var(--brand)]'
              role='button'
              tabIndex={0}
              data-testid='activity-task-expand'
              onClick={() => setExpanded((v) => !v)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setExpanded((v) => !v)}
            >
              {expanded ? (
                <Up theme='outline' size='11' fill='currentColor' />
              ) : (
                <Down theme='outline' size='11' fill='currentColor' />
              )}
              {expanded
                ? t('team.activity.collapse', { defaultValue: 'Collapse' })
                : t('team.activity.expand', { defaultValue: 'Expand' })}
            </span>
          </Tooltip>
        )}
        <span className='ms-auto shrink-0' title={time.full}>
          {time.label}
        </span>
      </div>
    </div>
  );
};

export default TaskCard;
