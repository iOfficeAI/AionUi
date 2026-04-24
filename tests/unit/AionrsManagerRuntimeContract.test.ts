/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { emitResponseStream, mockDb, mockAddMessage, mockAddOrUpdateMessage, mockDenyTool } = vi.hoisted(() => ({
  emitResponseStream: vi.fn(),
  mockDb: {
    getConversationMessages: vi.fn(() => ({ data: [] })),
    getConversation: vi.fn(() => ({
      success: true,
      data: {
        id: 'conv-contract-1',
        type: 'aionrs',
        extra: {
          presetAssistantId: 'custom-1776969323991',
        },
      },
    })),
    updateConversation: vi.fn(),
    createConversation: vi.fn(() => ({ success: true })),
    insertMessage: vi.fn(),
    updateMessage: vi.fn(),
  },
  mockAddMessage: vi.fn(),
  mockAddOrUpdateMessage: vi.fn(),
  mockDenyTool: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      responseStream: { emit: emitResponseStream },
      confirmation: {
        add: { emit: vi.fn() },
        update: { emit: vi.fn() },
        remove: { emit: vi.fn() },
      },
    },
    cron: {
      onJobCreated: { emit: vi.fn() },
      onJobRemoved: { emit: vi.fn() },
    },
  },
}));

vi.mock('@process/utils/shellEnv', () => ({
  getEnhancedEnv: vi.fn(() => ({})),
}));

vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn(() => Promise.resolve(mockDb)),
}));

vi.mock('@process/services/database/export', () => ({
  getDatabase: vi.fn(() => Promise.resolve(mockDb)),
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessChat: { get: vi.fn(() => Promise.resolve([])) },
}));

vi.mock('@process/utils/message', () => ({
  addMessage: mockAddMessage,
  addOrUpdateMessage: mockAddOrUpdateMessage,
  flushConversationMessages: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/common/utils', () => {
  let counter = 0;
  return { uuid: vi.fn(() => `uuid-${++counter}`) };
});

vi.mock('@/renderer/utils/common', () => {
  let counter = 0;
  return { uuid: vi.fn(() => `pipe-${++counter}`) };
});

vi.mock('@process/utils/mainLogger', () => ({
  mainError: vi.fn(),
  mainLog: vi.fn(),
  mainWarn: vi.fn(),
}));

vi.mock('@process/services/cron/cronServiceSingleton', () => ({
  cronService: {
    addJob: vi.fn(async () => ({ id: 'cron-1', name: 'test', enabled: true })),
    removeJob: vi.fn(async () => {}),
    listJobsByConversation: vi.fn(async () => []),
  },
}));

vi.mock('@process/agent/aionrs', () => ({
  AionrsAgent: vi.fn().mockImplementation(function () {
    return {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn(),
      kill: vi.fn(),
      send: vi.fn().mockResolvedValue(undefined),
      approveTool: vi.fn(),
      denyTool: mockDenyTool,
      injectConversationHistory: vi.fn().mockResolvedValue(undefined),
      get bootstrap() {
        return Promise.resolve();
      },
    };
  }),
}));

vi.mock('@process/channels/agent/ChannelEventBus', () => ({
  channelEventBus: { emitAgentMessage: vi.fn() },
}));

vi.mock('@process/team/teamEventBus', () => ({
  teamEventBus: { emit: vi.fn() },
}));

vi.mock('@process/team/prompts/teamGuideCapability', () => ({
  shouldInjectTeamGuideMcp: vi.fn(() => Promise.resolve(false)),
}));

vi.mock('@process/team/mcp/guide/teamGuideSingleton', () => ({
  getTeamGuideStdioConfig: vi.fn(() => undefined),
}));

vi.mock('@process/services/cron/CronBusyGuard', () => ({
  cronBusyGuard: { setProcessing: vi.fn() },
}));

vi.mock('@process/services/cron/SkillSuggestWatcher', () => ({
  skillSuggestWatcher: { onFinish: vi.fn() },
}));

vi.mock('@/process/task/ConversationTurnCompletionService', () => ({
  ConversationTurnCompletionService: {
    getInstance: () => ({ notifyPotentialCompletion: vi.fn() }),
  },
}));

import { AionrsManager } from '@/process/task/AionrsManager';
import { AionrsAgent } from '@process/agent/aionrs';

const CANARY_PROMPT =
  'Review this quarter for an existing endowment policy: equities outperformed, private marks lag, PE NAV rose above the policy range because public markets fell, spending reserve is down to 14 months, and the hedge fund sleeve underperformed its custom benchmark.';

const VALID_PACKET = [
  '# Senior PM Portfolio Construction Packet',
  '',
  '## Known Facts',
  'Known facts.',
  '',
  '## Measurement',
  'Measurement.',
  '',
  '## Attribution',
  'Attribution.',
  '',
  '## Appraisal',
  'Appraisal.',
  '',
  '## Implementation And Rebalancing',
  'Implementation.',
  '',
  '## Monitoring Dashboard',
  'Dashboard.',
  '',
  '## Bottom Line',
  'Bottom line.',
].join('\n');

function createManager(): AionrsManager {
  const data = {
    workspace: '/test/workspace',
    model: { name: 'test-provider', useModel: 'test-model', baseUrl: '', platform: 'test' },
    conversation_id: 'conv-contract-1',
    presetAssistantId: 'custom-1776969323991',
    presetRules: 'Portfolio Review OS rules',
    enabledSkills: ['portfolio-construction'],
  };
  return new AionrsManager(data as any, data.model as any);
}

function emitEvent(manager: AionrsManager, event: Record<string, unknown>) {
  (manager as any).emit('aionrs.message', event);
}

function emissions(type: string) {
  return emitResponseStream.mock.calls.filter(([e]: [{ type: string }]) => e.type === type).map(([e]: [any]) => e);
}

describe('AionrsManager runtime response contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('buffers contract-active content and only persists sanitized finalized text', async () => {
    const manager = createManager();
    await manager.sendMessage({ content: CANARY_PROMPT, msg_id: 'user-1' });

    emitEvent(manager, { type: 'start', data: '', msg_id: 'assistant-1' });
    emitEvent(manager, { type: 'content', data: '<think>hidden</think>Some wrapper\n\n', msg_id: 'assistant-1' });
    emitEvent(manager, { type: 'content', data: VALID_PACKET, msg_id: 'assistant-1' });

    expect(emissions('content')).toHaveLength(0);
    expect(emissions('thinking')).toHaveLength(0);
    expect(mockAddOrUpdateMessage).not.toHaveBeenCalledWith(
      'conv-contract-1',
      expect.objectContaining({ type: 'text' }),
      'aionrs'
    );

    emitEvent(manager, { type: 'finish', data: '', msg_id: 'assistant-1' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const content = emissions('content');
    expect(content).toHaveLength(1);
    expect(content[0].data).toBe(VALID_PACKET);
    expect(content[0].data).not.toContain('<think>');
    expect(emissions('assistant_message_finalized')[0].data).toMatchObject({
      status: 'repaired',
      presetAssistantId: 'custom-1776969323991',
    });
  });

  it('denies forbidden pre-artifact tool calls', async () => {
    const manager = createManager();
    await manager.sendMessage({ content: CANARY_PROMPT, msg_id: 'user-1' });
    emitEvent(manager, { type: 'start', data: '', msg_id: 'assistant-1' });
    expect((manager as any).activeResponseContract.active).toBe(true);
    (manager as any).agent = { denyTool: mockDenyTool };
    emitEvent(manager, {
      type: 'tool_group',
      data: [
        {
          callId: 'tool-1',
          name: 'Read',
          description: 'Read workspace file',
          status: 'Confirming',
          renderOutputAsMarkdown: false,
        },
      ],
      msg_id: 'assistant-1',
    });

    expect((manager as any).activeResponseContract.deniedToolCalls).toHaveLength(1);
    expect(mockDenyTool).toHaveBeenCalledWith(
      'tool-1',
      'runtime-contract forbids pre-artifact workspace search/read tools'
    );
    expect(emissions('tool_group')).toHaveLength(0);
  });

  it('fails closed when the aionrs runtime cannot start', async () => {
    vi.mocked(AionrsAgent).mockImplementationOnce(function () {
      return {
        start: vi.fn().mockRejectedValue(new Error('aionrs binary not found')),
        stop: vi.fn(),
        kill: vi.fn(),
        send: vi.fn().mockResolvedValue(undefined),
        approveTool: vi.fn(),
        denyTool: mockDenyTool,
        injectConversationHistory: vi.fn().mockResolvedValue(undefined),
        get bootstrap() {
          return Promise.reject(new Error('aionrs binary not found'));
        },
      } as any;
    });

    const manager = createManager();
    await manager.sendMessage({ content: CANARY_PROMPT, msg_id: 'user-1' });

    const errors = emissions('error');
    expect(errors).toHaveLength(1);
    expect(errors[0].data).toContain('aionrs binary not found');
    expect(mockAddOrUpdateMessage).toHaveBeenCalledWith(
      'conv-contract-1',
      expect.objectContaining({ type: 'tips' }),
      'aionrs'
    );
  });
});
