import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IResponseMessage } from '../../src/common/adapter/ipcBridge';

const mockAgent = vi.hoisted(() => ({
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  kill: vi.fn(),
  sendMessage: vi.fn().mockResolvedValue({ success: true, data: null }),
  confirmMessage: vi.fn().mockResolvedValue({ success: true, data: null }),
}));

const capturedConfig = vi.hoisted(() => ({
  onStreamEvent: null as ((msg: IResponseMessage) => void) | null,
  onSignalEvent: null as ((msg: IResponseMessage) => void) | null,
}));

const mockIpcBridge = vi.hoisted(() => ({
  openclawConversation: { responseStream: { emit: vi.fn() } },
  conversation: { responseStream: { emit: vi.fn() } },
}));

vi.mock('../../src/process/agent/openclaw', () => ({
  OpenClawAgent: class {
    constructor(config: Record<string, unknown>) {
      capturedConfig.onStreamEvent = config.onStreamEvent as typeof capturedConfig.onStreamEvent;
      capturedConfig.onSignalEvent = config.onSignalEvent as typeof capturedConfig.onSignalEvent;
      Object.assign(this, mockAgent);
    }
  },
}));

vi.mock('../../src/process/channels/agent/ChannelEventBus', () => ({
  channelEventBus: { emitAgentMessage: vi.fn() },
}));

vi.mock('../../src/common', () => ({ ipcBridge: mockIpcBridge }));
vi.mock('../../src/common/chat/chatLib', () => ({ transformMessage: vi.fn(() => null) }));
vi.mock('../../src/common/utils', () => ({ uuid: vi.fn(() => 'uuid-1') }));
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
import { cronBusyGuard } from '../../src/process/services/cron/CronBusyGuard';

function createManager() {
  return new OpenClawAgentManager({
    conversation_id: 'conv-1',
    workspace: '/ws',
  });
}

describe('OpenClawAgentManager runtime status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedConfig.onStreamEvent = null;
    capturedConfig.onSignalEvent = null;
  });

  it('keeps runtime status busy after streamed content until finish arrives', async () => {
    const mgr = createManager();
    await mgr.bootstrap;
    mgr.status = 'running';

    capturedConfig.onStreamEvent?.({
      type: 'content',
      conversation_id: 'conv-1',
      msg_id: 'msg-1',
      data: 'partial',
    });

    expect(mgr.status).toBe('running');
  });

  it('marks runtime status finished on finish signal', async () => {
    const mgr = createManager();
    await mgr.bootstrap;
    mgr.status = 'running';

    capturedConfig.onSignalEvent?.({
      type: 'finish',
      conversation_id: 'conv-1',
      msg_id: 'msg-2',
      data: null,
    });

    expect(cronBusyGuard.setProcessing).toHaveBeenCalledWith('conv-1', false);
    expect(mgr.status).toBe('finished');
  });

  it('marks runtime status finished on error stream event', async () => {
    const mgr = createManager();
    await mgr.bootstrap;
    mgr.status = 'running';

    capturedConfig.onStreamEvent?.({
      type: 'error',
      conversation_id: 'conv-1',
      msg_id: 'msg-3',
      data: 'boom',
    });

    expect(mgr.status).toBe('finished');
  });
});
