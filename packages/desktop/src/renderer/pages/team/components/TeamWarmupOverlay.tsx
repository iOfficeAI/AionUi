/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Refresh } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import type { TeamAssistant, TeammateStatus } from '@/common/types/team/teamTypes';
import type { TeamWarmupPhase } from '../hooks/useTeamWarmup';
import TeamAgentIdentity from './TeamAgentIdentity';

type Props = {
  phase: TeamWarmupPhase;
  assistants: TeamAssistant[];
  statusMap: Map<string, { status: TeammateStatus }>;
  colorOf: (slot_id: string | undefined) => string;
  onRetry?: () => void;
  onBack?: () => void;
};

const isReady = (status: TeammateStatus | undefined) => status !== undefined && status !== 'pending';

/**
 * 团队 warmup 遮罩 —— 磨砂玻璃 + 成员头像逐个点亮 + 进度，覆盖对话区（不盖标题行，视图切换仍可用）。
 * Leader 就绪即撤（phase='ready' 时本组件不渲染）；Leader 失败/超时转错误态。
 */
const TeamWarmupOverlay: React.FC<Props> = ({ phase, assistants, statusMap, colorOf, onRetry, onBack }) => {
  const { t } = useTranslation();
  if (phase === 'ready') return null;

  const total = assistants.length;
  const readyCount = assistants.filter((a) => isReady(statusMap.get(a.slot_id)?.status)).length;
  const isFailure = phase === 'error' || phase === 'timeout';

  return (
    <div
      data-testid='team-warmup-overlay'
      data-phase={phase}
      className='absolute inset-0 z-30 flex flex-col items-center justify-center'
      style={{ background: 'color-mix(in srgb, var(--bg-1) 78%, transparent)', backdropFilter: 'blur(3px)' }}
    >
      <div className='flex flex-col items-center gap-16px px-40px py-28px'>
        {/* 成员头像逐个点亮（Leader 先亮）：已就绪的高亮，未就绪的暗淡。 */}
        <div className='flex items-center gap-10px'>
          {assistants.slice(0, 6).map((a) => {
            const ready = isReady(statusMap.get(a.slot_id)?.status);
            const mc = colorOf(a.slot_id);
            return (
              <span
                key={a.slot_id}
                className='inline-flex rounded-full transition-all duration-300'
                style={{
                  opacity: ready ? 1 : 0.35,
                  boxShadow: ready ? `0 0 0 2px ${mc}, 0 0 12px 2px color-mix(in srgb, ${mc} 45%, transparent)` : 'none',
                }}
              >
                <TeamAgentIdentity
                  assistant_name=''
                  assistant_backend={a.assistant_backend}
                  icon={a.icon}
                  conversation_id={a.conversation_id}
                  className='!gap-0'
                  logoClassName='w-34px h-34px object-cover rounded-full'
                  avatarClassName='w-34px h-34px rounded-full flex items-center justify-center text-15px leading-none bg-fill-2'
                  nameClassName='hidden'
                />
              </span>
            );
          })}
        </div>

        {isFailure ? (
          <>
            <div className='text-15px font-600 text-t-primary'>
              {phase === 'timeout'
                ? t('team.warmup.timeout', { defaultValue: 'Team is taking too long to start' })
                : t('team.warmup.leaderFailed', { defaultValue: 'Failed to start the team' })}
            </div>
            <div className='flex items-center gap-10px'>
              {onBack && (
                <button
                  type='button'
                  onClick={onBack}
                  className='h-32px px-16px rounded-8px border border-solid border-[color:var(--border-base)] bg-transparent text-13px text-t-secondary hover:bg-2 cursor-pointer'
                >
                  {t('common.back', { defaultValue: 'Back' })}
                </button>
              )}
              {onRetry && (
                <button
                  type='button'
                  onClick={onRetry}
                  data-testid='team-warmup-retry'
                  className='flex items-center gap-6px h-32px px-16px rounded-8px border-none text-13px font-500 text-white cursor-pointer'
                  style={{ background: 'var(--brand)' }}
                >
                  <Refresh theme='outline' size='14' fill='currentColor' />
                  {t('team.warmup.retry', { defaultValue: 'Retry' })}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className='text-15px font-600 text-t-primary'>{t('team.warmup.title', { defaultValue: 'Waking up the team…' })}</div>
            <div className='text-12px text-t-tertiary'>
              {t('team.warmup.progress', { defaultValue: 'Warming up members ({{ready}}/{{total}})', ready: readyCount, total })}
            </div>
            {/* 品牌色进度条（无确定进度时来回扫动） */}
            <div className='w-180px h-4px rounded-2px overflow-hidden' style={{ background: 'var(--bg-3)' }}>
              <div className='h-full rounded-2px team-warmup-sweep' style={{ background: 'linear-gradient(90deg, var(--brand-hover), var(--brand))' }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TeamWarmupOverlay;
