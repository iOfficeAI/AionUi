/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { uuid } from '@/common/utils';
import type { TMessage } from '@/common/chat/chatLib';

/**
 * 智能体协同协议 (Agent Collaboration Protocol - Orchestration Extension)
 * 定义了主智能体与子智能体之间的委派逻辑。
 */

export interface IAgentDelegation {
  /** 委派任务的唯一 ID */
  id: string;
  /** 发起委派的智能体 ID (通常是主 Orchestrator) */
  sourceAgentId: string;
  /** 被委派任务的子智能体 ID (如 claude, gemini) */
  targetAgentId: string;
  /** 任务的具体描述 */
  taskDescription: string;
  /** 当前任务状态 */
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** 是否共享当前工作区的上下文 */
  contextShared: boolean;
}

/**
 * 协同消息类型定义
 */
export interface IMessageAgentCollaboration extends TMessage {
  type: 'agent_collaboration';
  content: {
    delegation: IAgentDelegation;
    result?: string;
  };
}

/**
 * Orchestrator 类用于管理多智能体之间的任务流转。
 * 它可以被集成到 AcpConnection 或 AcpAdapter 中。
 */
export class AgentOrchestrator {
  private activeDelegations: Map<string, IAgentDelegation> = new Map();

  /**
   * 创建一个新的协同任务并生成 UI 消息。
   * @param source 发起方 ID
   * @param target 目标方 ID
   * @param task 任务描述
   * @param conversationId 对话 ID
   */
  public createDelegation(
    source: string, 
    target: string, 
    task: string, 
    conversationId: string
  ): IMessageAgentCollaboration {
    const delegationId = uuid();
    const delegation: IAgentDelegation = {
      id: delegationId,
      sourceAgentId: source,
      targetAgentId: target,
      taskDescription: task,
      status: 'pending',
      contextShared: true
    };

    this.activeDelegations.set(delegationId, delegation);

    return {
      id: uuid(),
      msg_id: delegationId,
      conversation_id: conversationId,
      createdAt: Date.now(),
      position: 'center',
      type: 'agent_collaboration',
      content: { delegation }
    };
  }

  /**
   * 更新现有委派任务的状态。
   * @param id 委派 ID
   * @param status 新状态
   * @param result (可选) 任务执行结果
   */
  public updateStatus(
    id: string, 
    status: IAgentDelegation['status'], 
    result?: string
  ): IAgentDelegation | null {
    const delegation = this.activeDelegations.get(id);
    if (!delegation) return null;

    delegation.status = status;
    if (result) {
      // 在实际实现中，这里可以将结果同步到消息流中
    }
    
    return delegation;
  }
}
