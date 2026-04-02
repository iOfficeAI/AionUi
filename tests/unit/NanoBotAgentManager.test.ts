import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IResponseMessage } from '../../src/common/adapter/ipcBridge';

const mockAgent = vi.hoisted(() => ({
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  kill: vi.fn(),
  sendMessage: vi.fn().mockResolvedValue(undefined),
}));

const capturedConfig = vi.hoisted(() => ({
  onStreamEvent: null as ((msg: IResponseMessage) => void) | null,
  onSignalEvent: null as ((msg: IResponseMessage) => void) | null,
}));

vi.mock('../../src/process/agent/nanobot', () => ({
  NanobotAgent: class {
    constructor(config: Record<string, unknown>) {
      capturedConfig.onStreamEvent = config.onStreamEvent as typeof capturedConfig.onStreamEvent;
      capturedConfig.onSignalEvent = config.onSignalEvent as typeof capturedConfig.onSignalEvent;
      Object.assign(this, mockAgent);
    }
  },
}));

vi.mock('../../src/common', () => ({
  ipcBridge: {
    conversation: { responseStream: { emit: vi.fn() } },
  },
}));
vi.mock('../../src/common/chat/chatLib', () => ({ transformMessage: vi.fn(() => null) }));
vi.mock('../../src/common/utils', () => ({ uuid: vi.fn(() => 'uuid-1') }));
vi.mock('../../src/process/utils/message', () => ({
  addMessage: vi.fn(),
  addOrUpdateMessage: vi.fn(),
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

import NanoBotAgentManager from '../../src/process/task/NanoBotAgentManager';

function createManager() {
  return new NanoBotAgentManager({
    conversation_id: 'conv-1',
    workspace: '/ws',
  });
}

describe('NanoBotAgentManager runtime status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedConfig.onStreamEvent = null;
    capturedConfig.onSignalEvent = null;
    mockAgent.sendMessage.mockResolvedValue(undefined);
  });

  it('marks runtime status running when a turn starts', async () => {
    const mgr = createManager();
    await mgr.sendMessage({ content: 'hello', msg_id: 'msg-1' });

    expect(mgr.status).toBe('running');
  });

  it('marks runtime status finished when finish signal arrives', async () => {
    const mgr = createManager();
    mgr.status = 'running';

    capturedConfig.onSignalEvent?.({
      type: 'finish',
      conversation_id: 'conv-1',
      msg_id: 'msg-2',
      data: null,
    });

    expect(mgr.status).toBe('finished');
  });

  it('marks runtime status finished when async send fails', async () => {
    const mgr = createManager();
    mockAgent.sendMessage.mockRejectedValueOnce(new Error('send failed'));

    await mgr.sendMessage({ content: 'hello', msg_id: 'msg-3' });
    await Promise.resolve();

    expect(mgr.status).toBe('finished');
  });
});
