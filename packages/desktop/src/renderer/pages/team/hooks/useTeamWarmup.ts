/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { ipcBridge } from '@/common';

/**
 * 团队进入时的 warmup 状态机 —— 以团队会话运行时就绪为闸门。
 *
 * - warming：团队运行时尚未就绪（进团队初始化中）。
 * - ready：就绪，用户可以开始使用（撤除遮罩）。
 * - error：运行时启动失败（如 Leader 后端启动失败）。
 * - timeout：超时仍未就绪（防后端不返回卡死）。
 *
 * 就绪信号用 `team.ensureSession`（POST /api/teams/{id}/session）：该调用拉起团队运行时并在其就绪时
 * resolve、失败时 reject。这是进团队时后端真正拉起运行时的入口（未就绪时相关请求返回
 * TEAM_RUNTIME_NOT_READY），也是前端可观测的可靠就绪信号；团队会话由后端按 team 去重，重复调用安全。
 * 纯前端，不改后端。
 *
 * 注意：不能用 conversation.ensureRuntime —— 后端对「团队所属会话」的 standalone runtime ensure
 * 会以 TEAM_RUNTIME_REQUIRED（409）拒绝，必须走团队会话入口。
 */
export type TeamWarmupPhase = 'warming' | 'ready' | 'error' | 'timeout';

/** 超时兜底时限（ms）。 */
export const WARMUP_TIMEOUT_MS = 20_000;

export function useTeamWarmup(team_id: string): { phase: TeamWarmupPhase } {
  const [phase, setPhase] = useState<TeamWarmupPhase>(team_id ? 'warming' : 'ready');

  useEffect(() => {
    if (!team_id) {
      setPhase('ready');
      return;
    }

    let cancelled = false;
    setPhase('warming');

    const timer = setTimeout(() => {
      if (!cancelled) setPhase((prev) => (prev === 'warming' ? 'timeout' : prev));
    }, WARMUP_TIMEOUT_MS);

    ipcBridge.team.ensureSession
      .invoke({ team_id })
      .then(() => {
        if (!cancelled) setPhase('ready');
      })
      .catch(() => {
        if (!cancelled) setPhase('error');
      });

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [team_id]);

  return { phase };
}
