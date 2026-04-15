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
 *
 * Also covers the cron follow-up path in handleFinishSignal, where a cron
 * command response triggers a follow-up sendMessage call and the suppressFinishSignal
 * flag is used to defer the finish signal to the continuation's finish/error.
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
    _isTurnInProgress = false;
    get isTurnInProgress() {
      return this._isTurnInProgress;
    }
    _lastActivityAt = Date.now();
    get lastActivityAt() {
      return this._lastActivityAt;
    }
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
    markTurnStarted() {
      this._isTurnInProgress = true;
    }
    markTurnFinished() {
      this._isTurnInProgress = false;
    }
  },
}));

vi.mock('@process/task/IpcAgentEventEmitter', () => ({ IpcAgentEventEmitter: vi.fn() }));
vi.mock('@process/task/CronCommandDetector', () => ({ hasCronCommands: vi.fn(() => false) }));
vi.mock('@process/task/MessageMiddleware', () => ({
  extractTextFromMessage: vi.fn(() => ''),
  processCronInMessage: vi.fn(),
}));
vi.mock('@process/task/ThinkTagDetector', () => ({
  stripThinkTags: vi.fn((x: unknown) => x),
  extractAndStripThinkTags: vi.fn((x: unknown) => ({ content: x, thinkContent: '' })),
}));
vi.mock('@process/utils/initAgent', () => ({ hasNativeSkillSupport: vi.fn(() => false) }));
vi.mock('@process/task/agentUtils', () => ({
  prepareFirstMessageWithSkillsIndex: vi.fn((x: string) => Promise.resolve(x)),
}));
vi.mock('@/common/utils', () => ({ parseError: vi.fn((e: unknown) => e), uuid: vi.fn(() => 'test-uuid') }));
vi.mock('@/common/chat/chatLib', () => ({ transformMessage: vi.fn(), uuid: vi.fn(() => 'uuid') }));
vi.mock('@process/team/teamEventBus', () => ({ teamEventBus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() } }));
vi.mock('@process/services/cron/SkillSuggestWatcher', () => ({
  skillSuggestWatcher: { onFinish: vi.fn(), onMessage: vi.fn() },
}));
vi.mock('@process/team/prompts/teamGuideCapability.ts', () => ({
  shouldInjectTeamGuideMcp: vi.fn(() => false),
}));
vi.mock('@/common/types/codex/codexModes', () => ({ isCodexAutoApproveMode: vi.fn(() => false) }));
vi.mock('./ConversationTurnCompletionService', () => ({
  ConversationTurnCompletionService: {
    getInstance: vi.fn(() => ({ notifyPotentialCompletion: vi.fn() })),
  },
}));

// ── Import real AcpAgentManager after all mocks are set up ───────────────────
import AcpAgentManager from '../../src/process/task/AcpAgentManager';
import type { AcpBackend } from '../../src/common/types/acpTypes';
import { hasCronCommands } from '../../src/process/task/CronCommandDetector';
import { processCronInMessage } from '../../src/process/task/MessageMiddleware';

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

// ── Cron follow-up path in handleFinishSignal ─────────────────────────────────

type HandleFinishSignalFn = (
  message: { type: string; conversation_id: string; msg_id: string; data: null },
  backend: AcpBackend,
  options?: { trackActiveTurn?: boolean }
) => Promise<void>;

function makeFinishMessage(conversationId: string) {
  return { type: 'finish', conversation_id: conversationId, msg_id: 'finish-msg', data: null };
}

describe('AcpAgentManager.handleFinishSignal — cron follow-up path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: processCronInMessage does not invoke the callback (no cron responses)
    vi.mocked(processCronInMessage).mockResolvedValue(undefined);
  });

  it('suppresses finish signal and keeps isTurnInProgress when cron follow-up succeeds', async () => {
    const { manager, mockAgent } = makeManager('cron-ok');
    // In production, send() sets isTurnInProgress=true before handleFinishSignal is ever called.
    (manager as unknown as { markTurnStarted: () => void }).markTurnStarted();
    // Simulate that the last agent message contained a cron command
    (manager as unknown as { currentMsgContent: string }).currentMsgContent = '/cron run';
    vi.mocked(hasCronCommands).mockReturnValue(true);
    // processCronInMessage calls the callback with a system response
    vi.mocked(processCronInMessage).mockImplementation(
      async (_id: string, _backend: unknown, _msg: unknown, cb: (sysMsg: string) => void) => {
        cb('[cron result]');
      }
    );
    mockAgent.sendMessage.mockResolvedValue({ success: true });

    await (manager as unknown as { handleFinishSignal: HandleFinishSignalFn }).handleFinishSignal(
      makeFinishMessage('cron-ok'),
      'claude' as AcpBackend,
      { trackActiveTurn: false }
    );

    // Turn is still in progress because the follow-up sendMessage succeeded
    expect(manager.isTurnInProgress).toBe(true);
    // cronBusyGuard was never released — no false→true flip occurs
    expect(mockSetProcessing).not.toHaveBeenCalledWith('cron-ok', false);
  });

  it('clears busy state when cron follow-up sendMessage returns failure', async () => {
    const { manager, mockAgent } = makeManager('cron-fail');
    (manager as unknown as { currentMsgContent: string }).currentMsgContent = '/cron run';
    vi.mocked(hasCronCommands).mockReturnValue(true);
    vi.mocked(processCronInMessage).mockImplementation(
      async (_id: string, _backend: unknown, _msg: unknown, cb: (sysMsg: string) => void) => {
        cb('[cron result]');
      }
    );
    mockAgent.sendMessage.mockResolvedValue({ success: false });

    await (manager as unknown as { handleFinishSignal: HandleFinishSignalFn }).handleFinishSignal(
      makeFinishMessage('cron-fail'),
      'claude' as AcpBackend,
      { trackActiveTurn: false }
    );

    // clearBusyState() should have been called
    expect(manager.isTurnInProgress).toBe(false);
    expect(manager.status).toBe('finished');
    // cronBusyGuard was cleared after the follow-up failure
    expect(mockSetProcessing).toHaveBeenCalledWith('cron-fail', false);
  });

  it('does not suppress finish signal when cron produces no system responses', async () => {
    const { manager } = makeManager('cron-no-response');
    (manager as unknown as { currentMsgContent: string }).currentMsgContent = '/cron run';
    vi.mocked(hasCronCommands).mockReturnValue(true);
    // processCronInMessage does not invoke callback → collectedResponses stays empty
    vi.mocked(processCronInMessage).mockResolvedValue(undefined);

    await (manager as unknown as { handleFinishSignal: HandleFinishSignalFn }).handleFinishSignal(
      makeFinishMessage('cron-no-response'),
      'claude' as AcpBackend,
      { trackActiveTurn: false }
    );

    // No follow-up → finish signal not suppressed → isTurnInProgress cleared
    expect(manager.isTurnInProgress).toBe(false);
  });
});
