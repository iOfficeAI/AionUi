/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { ipcBridge } from '@/common';
import type {
  ITeamAgentRuntimeStatusEvent,
  ITeamMcpStatusEvent,
  TeamAgentRuntimeStatus,
  TeamMcpPhase,
} from '@/common/types/team/teamTypes';

/**
 * 团队进入时的 warmup 状态机。
 *
 * 后端事实（aioncore `ensure_session` → `rebuild_agent_processes`）：
 * - 就绪信号是**团队整体**的：`team.ensureSession`（POST /api/teams/{id}/session）在**全部成员**运行时
 *   重建成功时 resolve、任一成员失败时 reject（且已起好的成员会被后端一并 kill —— 全有或全无）。
 *   前端**拿不到** Leader 单独的就绪信号，只有这一个团队级 Promise。
 * - 重建过程中后端会**逐个**广播 `agentRuntimeStatusChanged`：Leader 优先、并发上限 3、每个错开 3s，
 *   先 `pending`（该成员开始唤醒），全部成功后**一次性**发 `ready`。失败成员发 `failed`。
 * - 若团队 session 已存在，`ensureSession` 立即返回、**不发任何事件**（二次进团队会秒过）。
 *
 * `team.mcpStatus` 是 phase 流，其中 `slot_id === ''` 的 `session_ready/session_error/load_failed/tcp_error`
 * 是团队级终态；`slot_id !== ''` 的事件只是成员级诊断信息，不作为团队整体闸门。
 *
 * 因此本 hook：
 * - `phase`：整体闸门，撤遮罩/失败以团队级 `team.mcpStatus` 终态为准；`ensureSession`
 *   resolve/reject 作为已有 session 或 WS 丢失时的兜底。
 * - `runtimeStatus`：各成员 slot 的 pending/ready/failed（failed 带 error）。用于遮罩头像「逐个进入唤醒中」
 *   的真实反馈；失败态下据此定位失败成员、展示原因（不做假的 N/M 进度、不假装逐个点亮成功）。
 */
export type TeamWarmupPhase = 'warming' | 'ready' | 'error';

const TEAM_WARMUP_FAILURE_PHASES = new Set<TeamMcpPhase>([
  'tcp_error',
  'session_error',
  'load_failed',
  'config_write_failed',
]);

/** 单个成员的运行时状态 + 失败原因（failed 时后端带 error）。 */
export type TeamWarmupMemberState = {
  status: TeamAgentRuntimeStatus;
  error?: string;
};

export type TeamWarmupState = {
  phase: TeamWarmupPhase;
  /** slot_id → 该成员运行时状态（pending/ready/failed + error）。无条目 = 尚未开始唤醒。 */
  runtimeStatus: Map<string, TeamWarmupMemberState>;
};

export function useTeamWarmup(team_id: string): TeamWarmupState {
  const [phase, setPhase] = useState<TeamWarmupPhase>(team_id ? 'warming' : 'ready');
  const [runtimeStatus, setRuntimeStatus] = useState<Map<string, TeamWarmupMemberState>>(() => new Map());

  useEffect(() => {
    if (!team_id) {
      setPhase('ready');
      setRuntimeStatus(new Map());
      return;
    }

    let cancelled = false;
    setPhase('warming');
    setRuntimeStatus(new Map<string, TeamWarmupMemberState>());

    // 逐个成员运行时状态：驱动遮罩里头像「唤醒中→点亮/失败」，不决定团队整体 ready。
    const unsubRuntime = ipcBridge.team.agentRuntimeStatusChanged.on((event: ITeamAgentRuntimeStatusEvent) => {
      if (event.team_id !== team_id || cancelled) return;
      setRuntimeStatus((prev) => {
        const next = new Map(prev);
        next.set(event.slot_id, { status: event.status, error: event.error });
        return next;
      });
    });

    const unsubMcpStatus = ipcBridge.team.mcpStatus.on((event: ITeamMcpStatusEvent) => {
      if (event.team_id !== team_id || event.slot_id || cancelled) return;
      if (event.phase === 'session_ready') {
        setPhase('ready');
      } else if (TEAM_WARMUP_FAILURE_PHASES.has(event.phase)) {
        setPhase((prev) => (prev === 'ready' ? prev : 'error'));
      }
    });

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
      unsubRuntime();
      unsubMcpStatus();
    };
  }, [team_id]);

  return { phase, runtimeStatus };
}
