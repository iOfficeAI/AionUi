/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Refresh } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import type { TeamAssistant } from '@/common/types/team/teamTypes';
import type { TeamWarmupMemberState, TeamWarmupPhase } from '../hooks/useTeamWarmup';
import TeamAgentIdentity from './TeamAgentIdentity';

type Props = {
  phase: TeamWarmupPhase;
  assistants: TeamAssistant[];
  /** slot_id → 运行时状态（来自 useTeamWarmup，逐个成员的真实唤醒信号 + 失败原因）。 */
  runtimeStatus: Map<string, TeamWarmupMemberState>;
  colorOf: (slot_id: string | undefined) => string;
  onRetry?: () => void;
};

/**
 * 团队 warmup 遮罩 —— 磨砂玻璃覆盖对话区，但**从列抬头下方开始**（top-40px），
 * 让每列抬头的模型选择器始终可点：切换模型是 teammate / leader 通用的失败自救手段。
 *
 * 头像用**真实的逐个 runtime 信号**（后端 Leader 优先、错开 3s 逐个发 pending）驱动：
 *   未开始 → 暗淡；pending → 身份色呼吸微光「唤醒中」；ready → 点亮定色；failed → 灰化标红。
 * 撤除以整体闸门 `phase` 为准（成功是全员一次性 ready）。
 *
 * 失败态（error）遮罩内容换成失败卡：定位失败成员 + 原因 + 引导。
 *   teammate 失败 → 可切模型 或 从顶部胶囊移除后重试；leader 失败 → 仅可切模型后重试（不可移除）。
 */
// 列抬头 h-40px + 底部 1px border-b；遮罩从 41 起，正好露出抬头那条 1px 下边框线，
// 抬头与遮罩内容区的分隔更清晰（44 会多盖住这条线）。
const COLUMN_HEADER_HEIGHT = 41;

/**
 * 后端错误层层包裹（`Invalid request: failed to warm up rebuilt agent <uuid>: Invalid request:
 * Bad request: Provider 'aionrs' not found`），只有末尾一段对用户有意义。剥掉重建噪声 + 通用前缀，
 * 留下真正的原因。取不到就回退原文。
 */
export function simplifyWarmupError(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  let s = raw.trim();
  // 去掉「failed to warm up rebuilt agent <uuid>:」这段中间噪声
  s = s.replace(/failed to warm up rebuilt agent \S+:\s*/gi, '');
  // 折叠重复的通用包裹前缀
  s = s.replace(/\b(invalid request|bad request|internal error):\s*/gi, '');
  s = s.trim();
  return s || raw.trim();
}

const TeamWarmupOverlay: React.FC<Props> = ({ phase, assistants, runtimeStatus, colorOf, onRetry }) => {
  const { t } = useTranslation();
  if (phase === 'ready') return null;

  const isFailure = phase === 'error';

  // 收集**所有**失败成员（后端并发重建可能同时报多个 failed，各带自己的 error）。
  // 按 assistants 顺序（Leader 在前）稳定排序，便于逐行展示。
  const failedMembers = assistants
    .filter((a) => runtimeStatus.get(a.slot_id)?.status === 'failed')
    .map((a) => ({ assistant: a, error: runtimeStatus.get(a.slot_id)?.error }));
  // 取不到任何 failed 时，回退到 Leader 作为单个失败对象。
  const fallbackLeader = assistants.find((a) => a.role === 'leader');
  if (failedMembers.length === 0 && fallbackLeader) {
    failedMembers.push({ assistant: fallbackLeader, error: undefined });
  }
  const isMulti = failedMembers.length > 1;
  const single = failedMembers[0];
  const singleIsLeader = single?.assistant.role === 'leader';
  // 引导：任一失败成员是可移除的 teammate 时，才提「移除」这条路（Leader 不可移除）。
  const anyRemovable = failedMembers.some((m) => m.assistant.role !== 'leader');

  return (
    <div
      data-testid='team-warmup-overlay'
      data-phase={phase}
      className='absolute left-0 right-0 bottom-0 z-20 flex flex-col items-center justify-center'
      style={{
        top: COLUMN_HEADER_HEIGHT,
        background: 'color-mix(in srgb, var(--bg-1) 80%, transparent)',
        backdropFilter: 'blur(3px)',
      }}
    >
      <div className='flex flex-col items-center gap-14px px-40px py-28px max-w-420px'>
        {/* 成员头像：跟随各自 runtime 状态。Leader 先亮（后端优先重建它）。 */}
        <div className='flex items-center gap-10px'>
          {assistants.slice(0, 6).map((a) => {
            const status = runtimeStatus.get(a.slot_id)?.status;
            const mc = colorOf(a.slot_id);
            const isReady = status === 'ready';
            const isPending = status === 'pending';
            const isFailed = status === 'failed';
            // 未开始/失败 → 暗；pending → 半亮 + 呼吸；ready → 全亮定色；failed → 红环 + 灰化。
            const opacity = isReady || isFailed ? 1 : isPending ? 0.75 : 0.35;
            const boxShadow = isFailed
              ? '0 0 0 2px var(--danger)'
              : isReady
                ? `0 0 0 2px ${mc}, 0 0 12px 2px color-mix(in srgb, ${mc} 45%, transparent)`
                : isPending
                  ? `0 0 0 2px color-mix(in srgb, ${mc} 55%, transparent)`
                  : 'none';
            return (
              <span
                key={a.slot_id}
                data-testid={`team-warmup-avatar-${a.slot_id}`}
                data-status={status ?? 'idle'}
                className={`relative inline-flex rounded-full transition-all duration-300 ${isPending ? 'team-warmup-breathe' : ''}`}
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
                {isFailed && (
                  <span
                    className='absolute -right-2px -bottom-2px w-14px h-14px rounded-full flex items-center justify-center text-9px font-700 text-white'
                    style={{ background: 'var(--danger)', border: '1.5px solid var(--bg-1)' }}
                  >
                    !
                  </span>
                )}
              </span>
            );
          })}
        </div>

        {isFailure ? (
          <>
            <div className='text-15px font-600 text-t-primary text-center'>
              {isMulti
                ? t('team.warmup.multiFailedTitle', {
                    defaultValue: '{{count}} members failed to start',
                    count: failedMembers.length,
                  })
                : single
                  ? singleIsLeader
                    ? t('team.warmup.leaderFailedTitle', {
                        defaultValue: 'Lead {{name}} failed to start',
                        name: single.assistant.assistant_name,
                      })
                    : t('team.warmup.memberFailedTitle', {
                        defaultValue: 'Member {{name}} failed to start',
                        name: single.assistant.assistant_name,
                      })
                  : t('team.warmup.genericFailedTitle', { defaultValue: 'The team could not start' })}
            </div>
            {isMulti ? (
              // 多个失败：逐行列出「名字 + 精简原因」，限高滚动。
              <div
                data-testid='team-warmup-error'
                className='w-320px max-h-120px overflow-y-auto flex flex-col gap-4px rounded-6px px-10px py-8px'
                style={{ background: 'color-mix(in srgb, var(--danger) 8%, var(--bg-base))' }}
              >
                {failedMembers.map((m) => (
                  <div
                    key={m.assistant.slot_id}
                    className='flex items-start gap-6px text-11px leading-relaxed text-left'
                  >
                    <span className='shrink-0 font-600' style={{ color: 'var(--danger)' }}>
                      {m.assistant.assistant_name}
                      {m.assistant.role === 'leader' ? t('team.warmup.leaderSuffix', { defaultValue: ' (Lead)' }) : ''}
                    </span>
                    <span className='min-w-0 break-words' style={{ color: 'var(--danger)' }}>
                      {simplifyWarmupError(m.error) ??
                        t('team.warmup.unknownError', { defaultValue: 'failed to start' })}
                    </span>
                  </div>
                ))}
              </div>
            ) : single?.error ? (
              <div
                data-testid='team-warmup-error'
                className='max-w-320px max-h-64px overflow-y-auto text-11px leading-relaxed text-left rounded-6px px-10px py-6px'
                style={{ background: 'color-mix(in srgb, var(--danger) 8%, var(--bg-base))', color: 'var(--danger)' }}
              >
                {simplifyWarmupError(single.error)}
              </div>
            ) : null}
            <div className='text-12px text-t-tertiary text-center leading-relaxed'>
              {anyRemovable
                ? t('team.warmup.memberFailedHint', {
                    defaultValue: 'Switch its model above, or remove the member from the bar on top, then retry.',
                  })
                : t('team.warmup.leaderFailedHint', {
                    defaultValue: 'Switch its model in the column header above, then retry.',
                  })}
            </div>
            {onRetry && (
              <button
                type='button'
                onClick={onRetry}
                data-testid='team-warmup-retry'
                className='mt-4px flex items-center gap-6px h-32px px-18px rounded-8px border-none text-13px font-500 text-white cursor-pointer'
                style={{ background: 'var(--brand)' }}
              >
                <Refresh theme='outline' size='14' fill='currentColor' />
                {t('team.warmup.retry', { defaultValue: 'Retry' })}
              </button>
            )}
          </>
        ) : (
          <>
            <div className='text-15px font-600 text-t-primary'>
              {t('team.warmup.title', { defaultValue: 'Waking up the team…' })}
            </div>
            <div className='text-12px text-t-tertiary'>
              {t('team.warmup.subtitle', { defaultValue: 'Getting members ready' })}
            </div>
            {/* 品牌色进度条（不确定进度，来回扫动） */}
            <div className='w-180px h-4px rounded-2px overflow-hidden' style={{ background: 'var(--bg-3)' }}>
              <div
                className='h-full rounded-2px team-warmup-sweep'
                style={{ background: 'linear-gradient(90deg, var(--brand-hover), var(--brand))' }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TeamWarmupOverlay;
