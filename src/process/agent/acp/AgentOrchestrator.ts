/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { uuid } from '@/common/utils';
import type { TMessage, IMessageText } from '@/common/chat/chatLib';

/**
 * 智能体协同协议 (Agent Collaboration Protocol - Orchestration Extension)
 * 用于处理主智能体向子智能体派发任务的逻辑
 */

export interface IAgentDelegation {
  id: string;
  sourceAgentId: string;
  targetAgentId: string;
  taskDescription: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  contextShared: boolean;
}

export interface IMessageAgentCollaboration extends TMessage {
  type: 'agent_collaboration';
  content: {
    delegation: IAgentDelegation;
    result?: string;
  };
}

/**
 * Orchestrator 类用于管理多智能体之间的任务流转
 */
export class AgentOrchestrator {
  private activeDelegations: Map<string, IAgentDelegation> = new Map();

  /**
   * 创建一个新的协同任务
   */
  createDelegation(source: string, target: string, task: string): IMessageAgentCollaboration {
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
      conversation_id: 'internal',
      createdAt: Date.now(),
      position: 'center',
      type: 'agent_collaboration',
      content: { delegation }
    };
  }

  /**
   * 更新协同任务状态
   */
  updateStatus(id: string, status: IAgentDelegation['status'], result?: string): Partial<IMessageAgentCollaboration> | null {
    const delegation = this.activeDelegations.get(id);
    if (!delegation) return null;

    delegation.status = status;
    return {
      content: {
        delegation,
        result
      }
    };
  }
}
