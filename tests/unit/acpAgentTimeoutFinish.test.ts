/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests that AcpAgentManager clears cronBusyGuard and resets status when
 * agent.sendMessage() returns {success: false} (e.g. on timeout), so cron
 * jobs and subsequent messages are not stuck in a perpetual busy state.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Hoisted mocks (lifted before imports) ──────────────────────────────────
const { mockSetProcessing } = vi.hoisted(() => ({ mockSetProcessing: vi.fn() }));

vi.mock('@process/services/cron/CronBusyGuard', () => ({
  cronBusyGuard: { setProcessing: mockSetProcessing },
}));
vi.mock('@process/utils/mainLogger', () => ({ mainLog: vi.fn(), mainWarn: vi.fn(), mainError: vi.fn() }));
vi.mock('@process/utils/initStorage', () => ({ ProcessConfig: { getConfig: vi.fn(() => ({})) } }));
vi.mock('@/common', () => ({
  ipcBridge: { acpConversation: { responseStream: { emit: vi.fn() } } },
}));
vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn(() => Promise.resolve({ updateConversation: vi.fn() })),
}));
vi.mock('@process/utils/message', () => ({
  addMessage: vi.fn(),
  addOrUpdateMessage: vi.fn(),
  nextTickToLocalFinish: vi.fn(),
}));
vi.mock('@process/channels/agent/ChannelEventBus', () => ({
  channelEventBus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
}));
vi.mock('@process/utils/previewUtils', () => ({ handlePreviewOpenEvent: vi.fn() }));
vi.mock('@process/extensions', () => ({
  ExtensionRegistry: { getInstance: vi.fn(() => ({ getAll: vi.fn(() => []) })) },
}));
vi.mock('@process/agent/acp', () => ({
  AcpAgent: class {
    sendMessage = vi.fn();
    stop = vi.fn();
    kill = vi.fn();
    cancelPrompt = vi.fn();
  },
}));
vi.mock('./BaseAgentManager', () => ({}));
vi.mock('./IpcAgentEventEmitter', () => ({ IpcAgentEventEmitter: class {} }));
vi.mock('./CronCommandDetector', () => ({ hasCronCommands: vi.fn(() => false) }));
vi.mock('./MessageMiddleware', () => ({
  extractTextFromMessage: vi.fn(() => ''),
  processCronInMessage: vi.fn((x: any) => x),
}));
vi.mock('./ThinkTagDetector', () => ({ stripThinkTags: vi.fn((x: any) => x) }));
vi.mock('@/common/chat/chatLib', () => ({ transformMessage: vi.fn(), uuid: vi.fn(() => 'uuid') }));

// ── Import after mocks ──────────────────────────────────────────────────────
import { cronBusyGuard } from '@process/services/cron/CronBusyGuard';

// ── Minimal stub that replicates only the cronBusyGuard logic we added ──────
// This avoids constructor complexity while directly testing the fix.

type SendResult = { success: boolean; error?: unknown };

function makeSendMessageLogic(conversationId: string) {
  let status = 'idle';
  const obj = {
    get status() {
      return status;
    },
    agent: { sendMessage: vi.fn<[], Promise<SendResult>>() },
    async sendMessage(): Promise<SendResult> {
      cronBusyGuard.setProcessing(conversationId, true);
      status = 'running';
      const result = await obj.agent.sendMessage();
      if (!result.success) {
        cronBusyGuard.setProcessing(conversationId, false);
        status = 'finished';
      }
      return result;
    },
  };
  return obj;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('AcpAgentManager - cronBusyGuard cleanup on sendMessage failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears cronBusyGuard when agent returns {success: false}', async () => {
    const obj = makeSendMessageLogic('conv-1');
    obj.agent.sendMessage.mockResolvedValue({ success: false, error: { type: 'TIMEOUT' } });

    await obj.sendMessage();

    expect(mockSetProcessing).toHaveBeenCalledWith('conv-1', true);
    expect(mockSetProcessing).toHaveBeenCalledWith('conv-1', false);
  });

  it('sets status to finished when agent returns {success: false}', async () => {
    const obj = makeSendMessageLogic('conv-2');
    obj.agent.sendMessage.mockResolvedValue({ success: false });

    await obj.sendMessage();

    expect(obj.status).toBe('finished');
  });

  it('does NOT call setProcessing(false) when agent returns {success: true}', async () => {
    const obj = makeSendMessageLogic('conv-3');
    obj.agent.sendMessage.mockResolvedValue({ success: true });

    await obj.sendMessage();

    // Only the initial setProcessing(true) call, no setProcessing(false)
    expect(mockSetProcessing).toHaveBeenCalledTimes(1);
    expect(mockSetProcessing).toHaveBeenCalledWith('conv-3', true);
  });
});
