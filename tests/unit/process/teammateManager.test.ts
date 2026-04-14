/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockIpcBridge, mockAddMessage } = vi.hoisted(() => ({
  mockIpcBridge: {
    team: {
      agentStatusChanged: { emit: vi.fn() },
      messageStream: { emit: vi.fn() },
      agentSpawned: { emit: vi.fn() },
      agentRemoved: { emit: vi.fn() },
      agentRenamed: { emit: vi.fn() },
    },
    acpConversation: {
      responseStream: { emit: vi.fn() },
    },
  },
  mockAddMessage: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: mockIpcBridge,
}));

vi.mock('@process/utils/message', () => ({
  addMessage: mockAddMessage,
}));

import { TeammateManager } from '../../../src/process/team/TeammateManager';
import type { TeamAgent } from '../../../src/common/types/teamTypes';

function makeAgent(overrides: Partial<TeamAgent>): TeamAgent {
  return {
    slotId: 'slot-default',
    conversationId: 'conv-default',
    role: 'teammate',
    agentType: 'codex',
    agentName: 'Worker',
    conversationType: 'acp',
    status: 'idle',
    ...overrides,
  };
}

describe('TeammateManager wake timeout handling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks the teammate as failed and notifies the lead when a wake times out', async () => {
    const lead = makeAgent({
      slotId: 'lead-slot',
      conversationId: 'lead-conv',
      role: 'lead',
      agentType: 'claude',
      agentName: 'Lead',
    });
    const teammate = makeAgent({
      slotId: 'worker-slot',
      conversationId: 'worker-conv',
      role: 'teammate',
      agentType: 'codex',
      agentName: 'Codex Worker',
    });

    const mailbox = {
      readUnread: vi.fn().mockResolvedValue([]),
      write: vi.fn().mockResolvedValue(undefined),
    };
    const taskManager = {
      list: vi.fn().mockResolvedValue([]),
    };
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const workerTaskManager = {
      getOrBuildTask: vi.fn().mockResolvedValue({ sendMessage }),
    };

    const manager = new TeammateManager({
      teamId: 'team-1',
      agents: [lead, teammate],
      mailbox: mailbox as any,
      taskManager: taskManager as any,
      workerTaskManager: workerTaskManager as any,
      hasMcpTools: true,
    });

    await manager.wake(teammate.slotId);

    // Simulate partial output that never reaches a finish event.
    (manager as any).responseBuffer.set(
      teammate.conversationId,
      '<send_message to="Lead">I found the failing path but did not finish the patch'
    );

    await vi.advanceTimersByTimeAsync(60_000);

    expect(mockIpcBridge.team.agentStatusChanged.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'team-1',
        slotId: teammate.slotId,
        status: 'failed',
        lastMessage: 'stopped responding after 60s',
      })
    );
    expect(mailbox.write).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'team-1',
        toAgentId: lead.slotId,
        fromAgentId: teammate.slotId,
        content: expect.stringContaining('stopped responding after 60s'),
      })
    );

    manager.dispose();
  });

  it('queues a single debounced wake when a teammate reports directly to the lead', async () => {
    const lead = makeAgent({
      slotId: 'lead-slot',
      conversationId: 'lead-conv',
      role: 'lead',
      agentType: 'claude',
      agentName: 'Lead',
    });
    const teammate = makeAgent({
      slotId: 'worker-slot',
      conversationId: 'worker-conv',
      role: 'teammate',
      agentType: 'codex',
      agentName: 'Codex Worker',
      status: 'active',
    });

    const mailbox = {
      readUnread: vi.fn().mockResolvedValue([]),
      write: vi.fn().mockResolvedValue(undefined),
    };
    const taskManager = {
      list: vi.fn().mockResolvedValue([]),
    };
    const workerTaskManager = {
      getOrBuildTask: vi.fn(),
    };

    const manager = new TeammateManager({
      teamId: 'team-1',
      agents: [lead, teammate],
      mailbox: mailbox as any,
      taskManager: taskManager as any,
      workerTaskManager: workerTaskManager as any,
      hasMcpTools: true,
    });
    const wakeSpy = vi.spyOn(manager, 'wake').mockResolvedValue();

    (manager as any).responseBuffer.set(
      teammate.conversationId,
      '<send_message to="Lead">Task complete</send_message>'
    );

    await (manager as any).finalizeTurn(teammate.conversationId);

    expect(mailbox.write).toHaveBeenCalledTimes(1);
    expect(mailbox.write).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'team-1',
        toAgentId: lead.slotId,
        fromAgentId: teammate.slotId,
        content: 'Task complete',
      })
    );
    expect(wakeSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(399);
    expect(wakeSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(wakeSpy).toHaveBeenCalledTimes(1);
    expect(wakeSpy).toHaveBeenCalledWith(lead.slotId);
    expect(mailbox.write).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'idle_notification',
      })
    );

    manager.dispose();
  });

  it('waits for the lead to settle before flushing a queued wake', async () => {
    const lead = makeAgent({
      slotId: 'lead-slot',
      conversationId: 'lead-conv',
      role: 'lead',
      agentType: 'claude',
      agentName: 'Lead',
      status: 'active',
    });
    const teammate = makeAgent({
      slotId: 'worker-slot',
      conversationId: 'worker-conv',
      role: 'teammate',
      agentType: 'codex',
      agentName: 'Codex Worker',
      status: 'active',
    });

    const mailbox = {
      readUnread: vi.fn().mockResolvedValue([]),
      write: vi.fn().mockResolvedValue(undefined),
    };
    const taskManager = {
      list: vi.fn().mockResolvedValue([]),
    };
    const workerTaskManager = {
      getOrBuildTask: vi.fn(),
    };

    const manager = new TeammateManager({
      teamId: 'team-1',
      agents: [lead, teammate],
      mailbox: mailbox as any,
      taskManager: taskManager as any,
      workerTaskManager: workerTaskManager as any,
      hasMcpTools: true,
    });
    const wakeSpy = vi.spyOn(manager, 'wake').mockResolvedValue();

    (manager as any).responseBuffer.set(
      teammate.conversationId,
      '<send_message to="Lead">Still working, but you should review this next.</send_message>'
    );

    await (manager as any).finalizeTurn(teammate.conversationId);
    await vi.advanceTimersByTimeAsync(400);

    expect(wakeSpy).not.toHaveBeenCalled();

    manager.setStatus(lead.slotId, 'idle');
    await vi.advanceTimersByTimeAsync(400);

    expect(wakeSpy).toHaveBeenCalledTimes(1);
    expect(wakeSpy).toHaveBeenCalledWith(lead.slotId);

    manager.dispose();
  });

  it('lets a direct report override an older all-settled wake request', async () => {
    const lead = makeAgent({
      slotId: 'lead-slot',
      conversationId: 'lead-conv',
      role: 'lead',
      agentType: 'claude',
      agentName: 'Lead',
    });
    const reporter = makeAgent({
      slotId: 'worker-slot',
      conversationId: 'worker-conv',
      role: 'teammate',
      agentType: 'codex',
      agentName: 'Codex Worker',
      status: 'active',
    });
    const stillBusy = makeAgent({
      slotId: 'busy-slot',
      conversationId: 'busy-conv',
      role: 'teammate',
      agentType: 'claude',
      agentName: 'Busy Worker',
      status: 'active',
    });

    const mailbox = {
      readUnread: vi.fn().mockResolvedValue([]),
      write: vi.fn().mockResolvedValue(undefined),
    };
    const taskManager = {
      list: vi.fn().mockResolvedValue([]),
    };
    const workerTaskManager = {
      getOrBuildTask: vi.fn(),
    };

    const manager = new TeammateManager({
      teamId: 'team-1',
      agents: [lead, reporter, stillBusy],
      mailbox: mailbox as any,
      taskManager: taskManager as any,
      workerTaskManager: workerTaskManager as any,
      hasMcpTools: true,
    });
    const wakeSpy = vi.spyOn(manager, 'wake').mockResolvedValue();

    (manager as any).maybeWakeLeaderWhenAllIdle(lead.slotId);
    (manager as any).responseBuffer.set(
      reporter.conversationId,
      '<send_message to="Lead">Please review my findings now.</send_message>'
    );

    await (manager as any).finalizeTurn(reporter.conversationId);
    await vi.advanceTimersByTimeAsync(400);

    expect(wakeSpy).toHaveBeenCalledTimes(1);
    expect(wakeSpy).toHaveBeenCalledWith(lead.slotId);

    manager.dispose();
  });
});
