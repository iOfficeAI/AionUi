/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { ipcBridge } from '@/common';
import type { ITeamAgentRuntimeStatusEvent, TeammateStatus } from '@/common/types/team/teamTypes';

/**
 * 团队进入时的 warmup 状态机 —— 以 Leader 运行时就绪为闸门。
 *
 * - warming：Leader 运行时尚未就绪（进团队初始化中）。
 * - ready：Leader 就绪，用户可以开始使用（撤除遮罩）。teammate 仍可能在各自初始化 / 失败，不阻塞。
 * - error：Leader 启动失败。
 * - timeout：超时仍未收到 Leader 就绪/失败（防后端不发事件卡死）。
 *
 * 撤遮罩闸门用 Leader 而非全员：用户进团队第一件事是跟 Leader 说目标，Leader 一好就能开工，
 * 也从根本上避免「某个成员起不来就卡死整个团队」。
 */
export type TeamWarmupPhase = 'warming' | 'ready' | 'error' | 'timeout';

/** Leader 超时兜底时限（ms）。 */
export const WARMUP_TIMEOUT_MS = 20_000;

type Args = {
  team_id: string;
  leaderSlotId: string | undefined;
  /** 进入时 Leader 的初始状态（来自 team.assistants[].status），用于判断是否已就绪。 */
  leaderInitialStatus: TeammateStatus | undefined;
};

// 进入团队时若 Leader 已不是「初始化中」状态，视为已就绪（无需再等事件）。
const isReadyStatus = (status: TeammateStatus | undefined): boolean =>
  status !== undefined && status !== 'pending';

export function useTeamWarmup({ team_id, leaderSlotId, leaderInitialStatus }: Args): { phase: TeamWarmupPhase } {
  const initiallyReady = isReadyStatus(leaderInitialStatus);
  const [leaderReady, setLeaderReady] = useState(initiallyReady);
  const [leaderFailed, setLeaderFailed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    // 已就绪则无需订阅/计时。
    if (leaderReady || !leaderSlotId) return;

    const unsub = ipcBridge.team.agentRuntimeStatusChanged.on((event: ITeamAgentRuntimeStatusEvent) => {
      if (event.team_id !== team_id || event.slot_id !== leaderSlotId) return;
      if (event.status === 'ready') setLeaderReady(true);
      else if (event.status === 'failed') setLeaderFailed(true);
    });
    const timer = setTimeout(() => setTimedOut(true), WARMUP_TIMEOUT_MS);

    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, [team_id, leaderSlotId, leaderReady]);

  const phase: TeamWarmupPhase = leaderReady ? 'ready' : leaderFailed ? 'error' : timedOut ? 'timeout' : 'warming';
  return { phase };
}
