/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for GeminiAgentManager thinking message logic:
 *   emitThinkingMessage  — content accumulation, IPC emission, timer setup
 *   flushThinkingToDb    — timer teardown, DB persistence, early-return guard
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockIpcBridge = vi.hoisted(() => ({
  geminiConversation: {
    responseStream: { emit: vi.fn() },
  },
}));

let uuidCounter = 0;
const mockUuid = vi.hoisted(() => vi.fn(() => `uuid-${++uuidCounter}`));

const mockAddOrUpdateMessage = vi.hoisted(() => vi.fn());
const mockChannelEventBus = vi.hoisted(() => ({ emitAgentMessage: vi.fn() }));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/common', () => ({ ipcBridge: mockIpcBridge }));
vi.mock('@/common/utils', () => ({ uuid: mockUuid }));
vi.mock('@/common/chat/chatLib', () => ({
  transformMessage: vi.fn(() => null),
}));
vi.mock('@/common/utils/platformAuthType', () => ({
  getProviderAuthType: vi.fn(() => 'api_key'),
}));

vi.mock('@process/channels/agent/ChannelEventBus', () => ({
  channelEventBus: mockChannelEventBus,
}));
vi.mock('@process/utils/message', () => ({
  addMessage: vi.fn(),
  addOrUpdateMessage: mockAddOrUpdateMessage,
  nextTickToLocalFinish: vi.fn(),
}));
vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: { get: vi.fn().mockResolvedValue({}) },
  getSkillsDir: vi.fn(() => '/fake/skills'),
}));
vi.mock('@process/utils/mainLogger', () => ({
  mainLog: vi.fn(),
  mainWarn: vi.fn(),
  mainError: vi.fn(),
}));
vi.mock('@process/utils/previewUtils', () => ({
  handlePreviewOpenEvent: vi.fn(() => false),
}));
vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn().mockResolvedValue({}),
}));
vi.mock('@process/services/cron/CronBusyGuard', () => ({
  cronBusyGuard: { setProcessing: vi.fn() },
}));
vi.mock('@process/extensions', () => ({
  ExtensionRegistry: { getInstance: vi.fn().mockReturnValue({ getExtensions: vi.fn(() => []) }) },
}));

vi.mock(
  './agentUtils',
  () => ({
    buildSystemInstructionsWithSkillsIndex: vi.fn(() => ''),
  }),
  { virtual: true }
);
vi.mock('../../src/process/task/agentUtils', () => ({
  buildSystemInstructionsWithSkillsIndex: vi.fn(() => ''),
}));
vi.mock('../../src/process/task/AcpSkillManager', () => ({
  detectSkillLoadRequest: vi.fn(() => false),
  AcpSkillManager: {
    getInstance: vi.fn(() => ({
      discoverSkills: vi.fn().mockResolvedValue(undefined),
      getSkillsDir: vi.fn(() => '/fake/skills'),
    })),
  },
  buildSkillContentText: vi.fn(() => ''),
}));
vi.mock('../../src/process/task/CronCommandDetector', () => ({
  hasCronCommands: vi.fn(() => false),
}));
vi.mock('../../src/process/task/MessageMiddleware', () => ({
  extractTextFromMessage: vi.fn(() => ''),
  processCronInMessage: vi.fn(),
}));
vi.mock('../../src/process/task/ThinkTagDetector', () => ({
  stripThinkTags: vi.fn((s: string) => s),
  extractAndStripThinkTags: vi.fn((s: string) => ({ content: s, thinkContent: '' })),
}));
vi.mock('@office-ai/aioncli-core', () => ({
  AuthType: { LOGIN_WITH_GOOGLE: 'LOGIN_WITH_GOOGLE', USE_VERTEX_AI: 'USE_VERTEX_AI' },
  getOauthInfoWithCache: vi.fn().mockResolvedValue(null),
  Storage: { getOAuthCredsPath: vi.fn(() => '/fake/oauth') },
}));
vi.mock('../../src/process/agent/gemini/GeminiApprovalStore', () => ({
  GeminiApprovalStore: class {
    getApproval = vi.fn();
    setApproval = vi.fn();
  },
}));
vi.mock('../../src/process/agent/gemini/cli/tools/tools', () => ({
  ToolConfirmationOutcome: {},
}));

vi.mock('../../src/process/task/BaseAgentManager', () => ({
  default: class BaseAgentManager {
    conversation_id = 'conv-test';
    status = 'pending';
    type = 'gemini';
    yoloMode = false;
    confirmations: unknown[] = [];
    on = vi.fn();
    stop = vi.fn().mockResolvedValue(undefined);
    kill = vi.fn();
    getConfirmations() {
      return this.confirmations;
    }
    addConfirmation(c: unknown) {
      this.confirmations.push(c);
    }
    confirm = vi.fn();
    postMessagePromise = vi.fn().mockResolvedValue(undefined);
    constructor(_type: string, _data: unknown, _emitter: unknown) {}
  },
}));

vi.mock('../../src/process/task/IpcAgentEventEmitter', () => ({
  IpcAgentEventEmitter: class {},
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => ''),
}));

// ---------------------------------------------------------------------------
// Import subject under test
// ---------------------------------------------------------------------------

import { GeminiAgentManager } from '../../src/process/task/GeminiAgentManager';
import { addOrUpdateMessage } from '../../src/process/utils/message';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MODEL = {
  name: 'gemini',
  useModel: 'gemini-2.0-flash',
  platform: 'google',
  baseUrl: '',
} as Parameters<typeof GeminiAgentManager.prototype.constructor>[1];

function createManager(): GeminiAgentManager {
  // Intercept createBootstrap before the constructor runs so no real I/O occurs
  vi.spyOn(GeminiAgentManager.prototype as unknown as Record<string, unknown>, 'createBootstrap').mockResolvedValue(
    undefined
  );

  const mgr = new GeminiAgentManager(
    {
      workspace: '/ws',
      conversation_id: 'conv-test',
    },
    MODEL
  );
  return mgr;
}

/** Cast to any for private field/method access in tests */
function priv(mgr: GeminiAgentManager): Record<string, unknown> {
  return mgr as unknown as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Shorthand helpers for calling private methods with correct `this` binding
function emitThinking(mgr: GeminiAgentManager, content: string, status: 'thinking' | 'done' = 'thinking') {
  (mgr as unknown as { emitThinkingMessage: (c: string, s: string) => void }).emitThinkingMessage(content, status);
}

function flushDb(mgr: GeminiAgentManager, duration: number | undefined, status: 'thinking' | 'done') {
  (mgr as unknown as { flushThinkingToDb: (d: number | undefined, s: string) => void }).flushThinkingToDb(
    duration,
    status
  );
}

describe('GeminiAgentManager — emitThinkingMessage', () => {
  let mgr: GeminiAgentManager;

  beforeEach(() => {
    vi.clearAllMocks();
    uuidCounter = 0;
    vi.useFakeTimers();
    mgr = createManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allocates a new thinkingMsgId on the first call', () => {
    emitThinking(mgr, 'hello');

    expect(priv(mgr).thinkingMsgId).toBe('uuid-1');
    expect(priv(mgr).thinkingStartTime).toBeTypeOf('number');
  });

  it('accumulates content across multiple thought chunks', () => {
    emitThinking(mgr, 'chunk1');
    emitThinking(mgr, 'chunk2');
    emitThinking(mgr, 'chunk3');

    expect(priv(mgr).thinkingContent).toBe('chunk1chunk2chunk3');
  });

  it('reuses the same thinkingMsgId across streaming chunks', () => {
    emitThinking(mgr, 'a');
    emitThinking(mgr, 'b');

    // uuid() should only have been called once for the thinkingMsgId
    expect(mockUuid).toHaveBeenCalledTimes(1);
    expect(priv(mgr).thinkingMsgId).toBe('uuid-1');
  });

  it('emits to ipcBridge and channelEventBus on each call', () => {
    emitThinking(mgr, 'part1');
    emitThinking(mgr, 'part2');

    expect(mockIpcBridge.geminiConversation.responseStream.emit).toHaveBeenCalledTimes(2);
    expect(mockChannelEventBus.emitAgentMessage).toHaveBeenCalledTimes(2);
  });

  it('schedules a DB flush timer on first streaming chunk', () => {
    emitThinking(mgr, 'data');

    expect(priv(mgr).thinkingDbFlushTimer).not.toBeNull();
  });

  it('does not schedule a second timer when one is already pending', () => {
    emitThinking(mgr, 'first');
    const firstTimer = priv(mgr).thinkingDbFlushTimer;
    emitThinking(mgr, 'second');

    expect(priv(mgr).thinkingDbFlushTimer).toBe(firstTimer);
  });

  it('calls flushThinkingToDb with status=done when done is passed', () => {
    const flushSpy = vi.spyOn(mgr as unknown as { flushThinkingToDb: () => void }, 'flushThinkingToDb');
    emitThinking(mgr, 'content');
    emitThinking(mgr, '', 'done');

    expect(flushSpy).toHaveBeenCalledWith(expect.anything(), 'done');
  });

  it('clears the DB flush timer when done is emitted', () => {
    emitThinking(mgr, 'data'); // sets timer
    expect(priv(mgr).thinkingDbFlushTimer).not.toBeNull();

    emitThinking(mgr, '', 'done'); // flush should clear timer
    expect(priv(mgr).thinkingDbFlushTimer).toBeNull();
  });

  it('includes duration when status is done', () => {
    emitThinking(mgr, 'thinking…');

    vi.advanceTimersByTime(100);
    emitThinking(mgr, '', 'done');

    const lastCall = mockIpcBridge.geminiConversation.responseStream.emit.mock.calls.at(-1)![0];
    expect(typeof lastCall.data.duration).toBe('number');
    expect(lastCall.data.duration).toBeGreaterThanOrEqual(0);
  });
});

describe('GeminiAgentManager — flushThinkingToDb', () => {
  let mgr: GeminiAgentManager;

  beforeEach(() => {
    vi.clearAllMocks();
    uuidCounter = 0;
    vi.useFakeTimers();
    mgr = createManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns early without calling addOrUpdateMessage when thinkingMsgId is null', () => {
    expect(priv(mgr).thinkingMsgId).toBeNull();

    flushDb(mgr, undefined, 'thinking');

    expect(addOrUpdateMessage).not.toHaveBeenCalled();
  });

  it('calls addOrUpdateMessage with correct TMessage shape when thinkingMsgId is set', () => {
    emitThinking(mgr, 'my thought');

    flushDb(mgr, undefined, 'thinking');

    expect(addOrUpdateMessage).toHaveBeenCalledWith(
      'conv-test',
      expect.objectContaining({
        type: 'thinking',
        position: 'left',
        conversation_id: 'conv-test',
        content: expect.objectContaining({
          content: 'my thought',
          status: 'thinking',
        }),
      }),
      'gemini'
    );
  });

  it('clears the pending timer before flushing', () => {
    emitThinking(mgr, 'data'); // sets timer

    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    flushDb(mgr, undefined, 'thinking');

    expect(clearSpy).toHaveBeenCalled();
    expect(priv(mgr).thinkingDbFlushTimer).toBeNull();
  });

  it('persists accumulated content, not just the latest chunk', () => {
    emitThinking(mgr, 'part1');
    emitThinking(mgr, 'part2');

    flushDb(mgr, 42, 'done');

    expect(addOrUpdateMessage).toHaveBeenCalledWith(
      'conv-test',
      expect.objectContaining({
        content: expect.objectContaining({
          content: 'part1part2',
          duration: 42,
          status: 'done',
        }),
      }),
      'gemini'
    );
  });
});
