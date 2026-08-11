/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockAgent = vi.hoisted(() => ({
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  kill: vi.fn(),
  sendMessage: vi.fn().mockResolvedValue({ success: true, data: null }),
  confirmMessage: vi.fn().mockResolvedValue({ success: true, data: null }),
  isConnected: true,
  hasActiveSession: true,
  currentSessionKey: 'key-1',
}));

vi.mock('../../src/process/agent/openclaw', () => ({
  OpenClawAgent: class {
    constructor() {
      Object.assign(this, mockAgent);
    }
  },
}));

vi.mock('../../src/process/channels/agent/ChannelEventBus', () => ({
  channelEventBus: { emitAgentMessage: vi.fn() },
}));

vi.mock('../../src/common', () => ({
  ipcBridge: {
    openclawConversation: { responseStream: { emit: vi.fn() } },
    conversation: { responseStream: { emit: vi.fn() } },
  },
}));

vi.mock('../../src/common/chat/chatLib', () => ({
  transformMessage: vi.fn(() => null),
}));

vi.mock('../../src/common/utils', () => {
  let counter = 0;
  return { uuid: () => `uuid-${++counter}` };
});

vi.mock('../../src/process/utils/message', () => ({
  addMessage: vi.fn(),
  addOrUpdateMessage: vi.fn(),
}));

vi.mock('../../src/process/services/database', () => ({
  getDatabase: vi.fn().mockResolvedValue({
    getConversation: vi.fn(() => ({ success: false })),
    updateConversation: vi.fn(),
  }),
}));

vi.mock('../../src/process/services/cron/CronBusyGuard', () => ({
  cronBusyGuard: { setProcessing: vi.fn() },
}));

vi.mock('../../src/process/task/BaseAgentManager', () => ({
  default: class BaseAgentManager {
    conversation_id = '';
    workspace = '';
    status = 'pending';
    confirmations: unknown[] = [];
    addConfirmation(c: unknown) {
      this.confirmations.push(c);
    }
    confirm() {}
    kill() {}
  },
}));

vi.mock('../../src/process/task/IpcAgentEventEmitter', () => ({
  IpcAgentEventEmitter: class {},
}));

import OpenClawAgentManager from '../../src/process/task/OpenClawAgentManager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createManager(overrides?: Partial<ConstructorParameters<typeof OpenClawAgentManager>[0]>) {
  return new OpenClawAgentManager({
    conversation_id: 'conv-1',
    workspace: '/ws',
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OpenClawAgentManager bootstrap', () => {
  let unhandledRejections: Error[];
  let unhandledHandler: (reason: unknown) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    unhandledRejections = [];
    unhandledHandler = (reason: unknown) => {
      unhandledRejections.push(reason instanceof Error ? reason : new Error(String(reason)));
    };
    process.on('unhandledRejection', unhandledHandler);
  });

  afterEach(() => {
    process.removeListener('unhandledRejection', unhandledHandler);
  });

  it('starts agent successfully', async () => {
    const mgr = createManager();
    await mgr.bootstrap;
    expect(mockAgent.start).toHaveBeenCalled();
  });

  it('does not trigger unhandled rejection when agent fails to start', async () => {
    mockAgent.start.mockRejectedValueOnce(new Error('Gateway exited with code 1'));

    const mgr = createManager();

    // The bootstrap promise should reject when awaited
    await expect(mgr.bootstrap).rejects.toThrow('Gateway exited with code 1');

    // Give the event loop a tick to ensure no unhandled rejection fires
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(unhandledRejections).toHaveLength(0);
  });

  it('propagates bootstrap error to sendMessage', async () => {
    mockAgent.start.mockRejectedValueOnce(new Error('binary not found'));

    const mgr = createManager();

    // sendMessage awaits bootstrap, so it should throw the same error
    await expect(mgr.sendMessage({ content: 'hello', msg_id: 'msg-1' })).rejects.toThrow('binary not found');
  });
});
