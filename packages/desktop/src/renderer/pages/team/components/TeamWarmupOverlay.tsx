/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Refresh } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import type { TeamAssistant, TeamAgentRuntimeStatus } from '@/common/types/team/teamTypes';
import type { TeamWarmupPhase } from '../hooks/useTeamWarmup';
import TeamAgentIdentity from './TeamAgentIdentity';

type Props = {
  phase: TeamWarmupPhase;
  assistants: TeamAssistant[];
  /** slot_id → 运行时状态（来自 useTeamWarmup，逐个成员的真实唤醒信号）。 */
  runtimeStatus: Map<string, TeamAgentRuntimeStatus>;
  colorOf: (slot_id: string | undefined) => string;
  onRetry?: () => void;
  onBack?: () => void;
};

/**
 * 团队 warmup 遮罩 —— 磨砂玻璃 + 成员头像状态化，覆盖对话区（不盖标题行，视图切换仍可用）。
 *
 * 头像用**真实的逐个 runtime 信号**（后端 Leader 优先、错开 3s 逐个发 pending）驱动：
 *   未开始 → 暗淡；pending → 身份色呼吸微光「唤醒中」；ready → 点亮定色；failed → 暗淡 + 提示。
 * 撤除/失败以整体闸门 `phase` 为准（成功是全员一次性 ready，故不做假的「逐个点亮成功」/「N/M」进度）。
 */
const TeamWarmupOverlay: React.FC<Props> = ({ phase, assistants, runtimeStatus, colorOf, onRetry, onBack }) => {
  const { t } = useTranslation();
  if (phase === 'ready') return null;

  const isFailure = phase === 'error' || phase === 'timeout';

  return (
    <div
      data-testid='team-warmup-overlay'
      data-phase={phase}
      className='absolute inset-0 z-30 flex flex-col items-center justify-center'
      style={{ background: 'color-mix(in srgb, var(--bg-1) 78%, transparent)', backdropFilter: 'blur(3px)' }}
    >
      <div className='flex flex-col items-center gap-16px px-40px py-28px'>
        {/* 成员头像：跟随各自 runtime 状态。Leader 先亮（后端优先重建它）。 */}
        <div className='flex items-center gap-10px'>
          {assistants.slice(0, 6).map((a) => {
            const status = runtimeStatus.get(a.slot_id);
            const mc = colorOf(a.slot_id);
            const isReady = status === 'ready';
            const isPending = status === 'pending';
            const isFailed = status === 'failed';
            // 未开始/失败 → 暗；pending → 半亮 + 呼吸；ready → 全亮定色。
            const opacity = isReady ? 1 : isPending ? 0.75 : 0.35;
            const boxShadow = isReady
              ? `0 0 0 2px ${mc}, 0 0 12px 2px color-mix(in srgb, ${mc} 45%, transparent)`
              : isPending
                ? `0 0 0 2px color-mix(in srgb, ${mc} 55%, transparent)`
                : 'none';
            return (
              <span
                key={a.slot_id}
                data-testid={`team-warmup-avatar-${a.slot_id}`}
                data-status={status ?? 'idle'}
                className={`inline-flex rounded-full transition-all duration-300 ${isPending ? 'team-warmup-breathe' : ''}`}
                style={{ opacity, boxShadow }}
              >
                <TeamAgentIdentity
                  assistant_name=''
                  assistant_backend={a.assistant_backend}
                  icon={a.icon}
                  conversation_id={a.conversation_id}
                  className='!gap-0'
                  logoClassName={`w-34px h-34px object-cover rounded-full ${isFailed ? 'grayscale' : ''}`}
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
            <div className='text-12px text-t-tertiary'>{t('team.warmup.subtitle', { defaultValue: 'Getting members ready' })}</div>
            {/* 品牌色进度条（不确定进度，来回扫动） */}
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
