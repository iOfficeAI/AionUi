/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AgentOrchestrator — 多智能体协同调度层
 *
 * 设计原则：
 * - 主 agent 通过 MCP tool call（delegate_to_agent）发起委派
 * - AionUi 拦截该 tool call，启动目标 CLI agent，注入上下文，执行任务
 * - 子 agent 的输出作为 tool result 注入回主 agent，主 agent 继续推进
 * - 委派具有传递性：子 agent 也可以再委派给孙 agent
 */

import { uuid } from '@/common/utils';

// ── 委派状态机 ────────────────────────────────────────────────────────────────

export type DelegationStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface IAgentDelegation {
  /** 委派任务唯一 ID */
  id: string;
  /** 发起委派的 agent（backend 名称，如 'claude'、'gemini'） */
  sourceAgentId: string;
  /** 被委派的目标 agent（backend 名称） */
  targetAgentId: string;
  /** 任务描述（注入给子 agent 的 prompt） */
  taskDescription: string;
  /** 共享的工作区上下文（文件路径、当前对话摘要等） */
  sharedContext?: string;
  /** 当前状态 */
  status: DelegationStatus;
  /** 子 agent 的执行结果（完成后填入） */
  result?: string;
  /** 错误信息（失败时填入） */
  error?: string;
  /** 父委派 ID（支持传递性委派链） */
  parentDelegationId?: string;
  /** 创建时间戳 */
  createdAt: number;
}

// ── Orchestrator 核心类 ───────────────────────────────────────────────────────

export class AgentOrchestrator {
  private delegations = new Map<string, IAgentDelegation>();

  /**
   * 创建一个新的委派任务。
   * 由 OrchestratorMcpBridge 在拦截到 delegate_to_agent tool call 时调用。
   */
  createDelegation(
    sourceAgentId: string,
    targetAgentId: string,
    taskDescription: string,
    options?: {
      sharedContext?: string;
      parentDelegationId?: string;
    }
  ): IAgentDelegation {
    const delegation: IAgentDelegation = {
      id: uuid(),
      sourceAgentId,
      targetAgentId,
      taskDescription,
      sharedContext: options?.sharedContext,
      parentDelegationId: options?.parentDelegationId,
      status: 'pending',
      createdAt: Date.now(),
    };
    this.delegations.set(delegation.id, delegation);
    return delegation;
  }

  /**
   * 更新委派状态。
   * running：子 agent 已启动
   * completed：子 agent 执行完毕，result 已填入
   * failed：子 agent 执行失败，error 已填入
   */
  updateDelegation(
    id: string,
    status: DelegationStatus,
    payload?: { result?: string; error?: string }
  ): IAgentDelegation | null {
    const delegation = this.delegations.get(id);
    if (!delegation) return null;

    delegation.status = status;
    if (payload?.result !== undefined) delegation.result = payload.result;
    if (payload?.error !== undefined) delegation.error = payload.error;

    // 完成或失败后延迟清理，保留足够时间供调用方读取结果
    if (status === 'completed' || status === 'failed') {
      setTimeout(() => this.delegations.delete(id), 5 * 60 * 1000);
    }

    return delegation;
  }

  getDelegation(id: string): IAgentDelegation | undefined {
    return this.delegations.get(id);
  }

  getActiveDelegations(): IAgentDelegation[] {
    return Array.from(this.delegations.values()).filter(
      (d) => d.status === 'pending' || d.status === 'running'
    );
  }
}

// ── 单例导出（进程级共享） ────────────────────────────────────────────────────

export const agentOrchestrator = new AgentOrchestrator();
