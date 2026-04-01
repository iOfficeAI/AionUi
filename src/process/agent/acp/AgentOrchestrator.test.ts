/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { AgentOrchestrator } from './AgentOrchestrator';

describe('AgentOrchestrator', () => {
  let orchestrator: AgentOrchestrator;

  beforeEach(() => {
    orchestrator = new AgentOrchestrator();
  });

  test('should create a new delegation', () => {
    const source = 'main-orchestrator';
    const target = 'claude';
    const task = 'Refactor current file';
    const conversationId = 'test-conversation-id';

    const message = orchestrator.createDelegation(source, target, task, conversationId);

    expect(message.type).toBe('agent_collaboration');
    expect(message.content.delegation.sourceAgentId).toBe(source);
    expect(message.content.delegation.targetAgentId).toBe(target);
    expect(message.content.delegation.taskDescription).toBe(task);
    expect(message.content.delegation.status).toBe('pending');
  });

  test('should update delegation status', () => {
    const source = 'main-orchestrator';
    const target = 'gemini';
    const task = 'Analyze documentation';
    const conversationId = 'test-id';

    const message = orchestrator.createDelegation(source, target, task, conversationId);
    const delegationId = message.content.delegation.id;

    const updated = orchestrator.updateStatus(delegationId, 'running');

    expect(updated).not.toBeNull();
    expect(updated?.status).toBe('running');
  });

  test('should return null for non-existent delegation', () => {
    const updated = orchestrator.updateStatus('invalid-id', 'completed');
    expect(updated).toBeNull();
  });
});
