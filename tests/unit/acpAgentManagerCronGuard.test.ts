/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests that AcpAgentManager (real class) clears cronBusyGuard and resets
 * status when agent.sendMessage() returns {success: false}, covering the two
 * new branches added in AcpAgentManager.sendMessage (first-message path and
 * subsequent-message path).
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockSetProcessing, mockIsProcessing } = vi.hoisted(() => ({
  mockSetProcessing: vi.fn(),
  mockIsProcessing: vi.fn(() => false),
}));

vi.mock('@process/services/cron/CronBusyGuard', () => ({
  cronBusyGuard: { setProcessing: mockSetProcessing, isProcessing: mockIsProcessing },
}));
vi.mock('@process/utils/mainLogger', () => ({
  mainLog: vi.fn(),
  mainWarn: vi.fn(),
  mainError: vi.fn(),
}));
vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: { getConfig: vi.fn(() => ({})), get: vi.fn() },
}));
vi.mock('@/common', () => ({
  ipcBridge: { acpConversation: { responseStream: { emit: vi.fn() } } },
}));
vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn(() => Promise.resolve({ updateConversation: vi.fn() })),
}));
vi.mock('@process/utils/message', () => ({
  addMessage: vi.fn(),
  addOrUpdateMessage: vi.fn(),
  nextTickToLocalFinish: vi.fn((cb: () => void) => cb()),
}));
vi.mock('@process/channels/agent/ChannelEventBus', () => ({
  channelEventBus: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    emitAgentMessage: vi.fn(),
  },
}));
vi.mock('@process/utils/previewUtils', () => ({ handlePreviewOpenEvent: vi.fn() }));
vi.mock('@process/extensions', () => ({
  ExtensionRegistry: {
    getInstance: vi.fn(() => ({ getAll: vi.fn(() => []), getAcpAdapters: vi.fn(() => []) })),
  },
}));
vi.mock('@process/agent/acp', () => ({
  AcpAgent: class {
    sendMessage = vi.fn();
    stop = vi.fn();
    kill = vi.fn();
    cancelPrompt = vi.fn();
  },
}));

// Mock BaseAgentManager as a minimal class to avoid ForkTask child-process spawning
vi.mock('@process/task/BaseAgentManager', () => ({
  default: class {
    conversation_id = '';
    status: string | undefined;
    workspace = '';
    bootstrapping = false;
    yoloMode = false;
    constructor(_type: string, data: Record<string, unknown>, _emitter: unknown) {
      if (data?.conversation_id) this.conversation_id = data.conversation_id;
      if (data?.workspace) this.workspace = data.workspace;
    }
    isYoloMode() {
      return false;
    }
    addConfirmation() {}
    getConfirmations() {
      return [];
    }
  },
}));

vi.mock('@process/task/IpcAgentEventEmitter', () => ({ IpcAgentEventEmitter: vi.fn() }));
vi.mock('@process/task/CronCommandDetector', () => ({ hasCronCommands: vi.fn(() => false) }));
vi.mock('@process/task/MessageMiddleware', () => ({
  extractTextFromMessage: vi.fn(() => ''),
  processCronInMessage: vi.fn((x: unknown) => x),
}));
vi.mock('@process/task/ThinkTagDetector', () => ({ stripThinkTags: vi.fn((x: unknown) => x) }));
vi.mock('@process/utils/initAgent', () => ({ hasNativeSkillSupport: vi.fn(() => false) }));
vi.mock('@process/task/agentUtils', () => ({
  prepareFirstMessageWithSkillsIndex: vi.fn((x: string) => Promise.resolve({ content: x, loadedSkills: [] })),
}));
vi.mock('@/common/utils', () => ({ parseError: vi.fn((e: unknown) => e), uuid: vi.fn(() => 'test-uuid') }));
vi.mock('@/common/chat/chatLib', () => ({ transformMessage: vi.fn(), uuid: vi.fn(() => 'uuid') }));

// ── Import real AcpAgentManager after all mocks are set up ───────────────────
import AcpAgentManager from '../../src/process/task/AcpAgentManager';
import type { AcpBackend } from '../../src/common/types/acpTypes';

// ── Helpers ──────────────────────────────────────────────────────────────────

type MockAgent = { sendMessage: ReturnType<typeof vi.fn> };

function makeManager(conversationId = 'conv-test') {
  const manager = new AcpAgentManager({
    conversation_id: conversationId,
    backend: 'claude' as AcpBackend,
    workspace: '/tmp/workspace',
  });
  // Inject a mock agent and pre-resolve bootstrap so initAgent() returns immediately
  const mockAgent: MockAgent = {
    sendMessage: vi.fn(),
  };
  (manager as unknown as { agent: MockAgent }).agent = mockAgent;
  (manager as unknown as { bootstrap: Promise<MockAgent> }).bootstrap = Promise.resolve(mockAgent);
  // Skip first-message injection (hasNativeSkillSupport / prepareFirstMessageWithSkillsIndex)
  // so the test focuses purely on the success/failure handling branches
  (manager as unknown as { isFirstMessage: boolean }).isFirstMessage = false;
  return { manager, mockAgent };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AcpAgentManager.sendMessage — real class cronBusyGuard cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── First-message path (lines 645-648 in AcpAgentManager.ts) ──────────────

  it('clears cronBusyGuard when first-path agent.sendMessage returns {success:false}', async () => {
    const { manager, mockAgent } = makeManager('conv-1');
    mockAgent.sendMessage.mockResolvedValue({ success: false, error: { type: 'TIMEOUT' } });

    await manager.sendMessage({ content: 'hello', msg_id: 'msg-1' });

    expect(mockSetProcessing).toHaveBeenCalledWith('conv-1', true);
    expect(mockSetProcessing).toHaveBeenCalledWith('conv-1', false);
  });

  it('sets status to finished when first-path returns {success:false}', async () => {
    const { manager, mockAgent } = makeManager('conv-2');
    mockAgent.sendMessage.mockResolvedValue({ success: false });

    await manager.sendMessage({ content: 'hello', msg_id: 'msg-1' });

    expect(manager.status).toBe('finished');
  });

  it('synthesizes finish and clears cronBusyGuard when first-path returns {success:true} without runtime activity', async () => {
    const { manager, mockAgent } = makeManager('conv-3');
    mockAgent.sendMessage.mockResolvedValue({ success: true });

    await manager.sendMessage({ content: 'hello', msg_id: 'msg-1' });

    expect(mockSetProcessing).toHaveBeenCalledWith('conv-3', true);
    expect(mockSetProcessing).toHaveBeenCalledWith('conv-3', false);
    expect(manager.status).toBe('finished');
  });

  // ── Subsequent-message path (lines 657-660 in AcpAgentManager.ts) ─────────
  // Triggered when isFirstMessage is false and msg_id is absent (e.g. internal/cron calls)

  it('clears cronBusyGuard when second-path agent.sendMessage returns {success:false}', async () => {
    const { manager, mockAgent } = makeManager('conv-4');
    mockAgent.sendMessage.mockResolvedValue({ success: false, error: { type: 'TIMEOUT' } });

    // No msg_id → skips the first if-branch and reaches the second sendMessage call
    await manager.sendMessage({ content: 'hello' });

    expect(mockSetProcessing).toHaveBeenCalledWith('conv-4', true);
    expect(mockSetProcessing).toHaveBeenCalledWith('conv-4', false);
  });

  it('sets status to finished when second-path returns {success:false}', async () => {
    const { manager, mockAgent } = makeManager('conv-5');
    mockAgent.sendMessage.mockResolvedValue({ success: false });

    await manager.sendMessage({ content: 'hello' });

    expect(manager.status).toBe('finished');
  });

  it('synthesizes finish and clears cronBusyGuard when second-path returns {success:true} without runtime activity', async () => {
    const { manager, mockAgent } = makeManager('conv-6');
    mockAgent.sendMessage.mockResolvedValue({ success: true });

    await manager.sendMessage({ content: 'hello' });

    expect(mockSetProcessing).toHaveBeenCalledWith('conv-6', true);
    expect(mockSetProcessing).toHaveBeenCalledWith('conv-6', false);
    expect(manager.status).toBe('finished');
  });

  // ── Thrown-exception path (catch block) ───────────────────────────────────

  it('clears cronBusyGuard when agent.sendMessage throws', async () => {
    const { manager, mockAgent } = makeManager('conv-7');
    mockAgent.sendMessage.mockRejectedValue(new Error('unexpected crash'));

    await expect(manager.sendMessage({ content: 'hello' })).rejects.toThrow('unexpected crash');

    expect(mockSetProcessing).toHaveBeenCalledWith('conv-7', true);
    expect(mockSetProcessing).toHaveBeenCalledWith('conv-7', false);
  });

  it('sets status to finished when agent.sendMessage throws', async () => {
    const { manager, mockAgent } = makeManager('conv-8');
    mockAgent.sendMessage.mockRejectedValue(new Error('unexpected crash'));

    await expect(manager.sendMessage({ content: 'hello' })).rejects.toThrow();

    expect(manager.status).toBe('finished');
  });

  // ── Guard is cleared before next invocation ───────────────────────────────

  it('guard is cleared before second sendMessage so it can set busy again', async () => {
    const { manager, mockAgent } = makeManager('conv-9');

    // First call fails
    mockAgent.sendMessage.mockResolvedValueOnce({ success: false });
    await manager.sendMessage({ content: 'hello' });

    // Verify guard was cleared after first failure
    expect(mockSetProcessing).toHaveBeenCalledWith('conv-9', false);
    expect(manager.status).toBe('finished');

    vi.clearAllMocks();

    // Second call succeeds — guard must be settable to true again
    mockAgent.sendMessage.mockResolvedValueOnce({ success: true });
    await manager.sendMessage({ content: 'hello again' });

    expect(mockSetProcessing).toHaveBeenCalledWith('conv-9', true);
    expect(mockSetProcessing).toHaveBeenCalledWith('conv-9', false);
  });
});
