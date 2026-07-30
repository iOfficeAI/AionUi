/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import { Tag, Tooltip } from '@arco-design/web-react';
import { Down, ListView, Lock, Up } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import type { ITeamTaskItem } from '@/common/types/team/teamTypes';
import { ACTIVITY_USER_IDENTITY } from './activityTypes';
import type { ActivityIdentityResolver } from './MessageCard';
import { clampStyle, useIsClamped } from './useIsClamped';

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
            <Tag key={dep} size='small' color='orangered' icon={<Lock theme='outline' size='11' fill='currentColor' />}>
              {t('team.activity.blockedBy', { id: dep.slice(0, 6), defaultValue: 'blocked by #{{id}}' })}
            </Tag>
          ))}
        </div>
      )}

      {description.length > 0 && (
        <>
          <div
            ref={descRef}
            className='text-12px text-[color:var(--color-text-2)] whitespace-pre-wrap break-words'
            style={expanded ? undefined : clampStyle(2)}
          >
            {description}
          </div>
          {(isClamped || expanded) && (
            <Tooltip
              content={
                expanded
                  ? t('team.activity.collapse', { defaultValue: 'Collapse' })
                  : t('team.activity.expand', { defaultValue: 'Expand' })
              }
            >
              <span
                className='inline-flex items-center gap-2px cursor-pointer text-11px text-[color:var(--brand)] self-start'
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
        </>
      )}
    </div>
  );
};

export default TaskCard;
