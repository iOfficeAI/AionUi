import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ITeamSlotWork } from '@/common/types/team/teamTypes';
import { getTeamRuntimeStatus } from './teamRuntimeStatus';

type Props = {
  work?: ITeamSlotWork;
};

const toneClassByKind = {
  queued: 'bg-[color:var(--color-fill-2)] text-[color:var(--color-text-2)]',
  slow: 'bg-[color:var(--color-warning-light-1)] text-[color:var(--color-warning-7)]',
  suppressed: 'bg-[color:var(--color-fill-2)] text-[color:var(--color-text-2)]',
  disconnected: 'bg-[color:var(--color-danger-light-1)] text-[color:var(--color-danger-7)]',
  unhealthy: 'bg-[color:var(--color-danger-light-1)] text-[color:var(--color-danger-7)]',
} as const;

const TeamRuntimeNotice: React.FC<Props> = ({ work }) => {
  const { t } = useTranslation();
  const status = getTeamRuntimeStatus(work);
  if (!status?.noticeKey) return null;

  const text = t(status.noticeKey, { elapsed: status.elapsed });

  return (
    <div
      className={`shrink-0 min-h-28px px-10px py-6px text-12px leading-16px border-b border-solid border-[color:var(--border-base)] ${toneClassByKind[status.kind]}`}
    >
      <span className='block truncate' title={text}>
        {text}
      </span>
    </div>
  );
};

export default TeamRuntimeNotice;
