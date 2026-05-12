/**
 * AionrsManager mode-based auto-approval — unit tests
 *
 * Verifies that tryAutoApprove correctly handles 'auto_edit', 'yolo',
 * and 'default' modes when deciding whether to auto-approve tool
 * confirmations.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────

const {
  emitResponseStream,
  emitConfirmationAdd,
  emitConfirmationUpdate,
  emitConfirmationRemove,
  mockDb,
  mockCronService,
  mockApproveTool,
  mockSetMode,
  mockSetConfig,
} = vi.hoisted(() => ({
  emitResponseStream: vi.fn(),
  emitConfirmationAdd: vi.fn(),
  emitConfirmationUpdate: vi.fn(),
  emitConfirmationRemove: vi.fn(),
  mockDb: {
    getConversationMessages: vi.fn(() => ({ data: [] })),
    getConversation: vi.fn(() => ({ success: false })),
    updateConversation: vi.fn(),
    createConversation: vi.fn(() => ({ success: true })),
    insertMessage: vi.fn(),
    updateMessage: vi.fn(),
  },
  mockCronService: {
    addJob: vi.fn(async () => ({ id: 'cron-1', name: 'test', schedule: '* * * * *', enabled: true })),
    removeJob: vi.fn(async () => {}),
    listJobsByConversation: vi.fn(async () => []),
  },
  mockApproveTool: vi.fn(),
  mockSetMode: vi.fn(),
  mockSetConfig: vi.fn(),
}));

// ── Mocks ──────────────────────────────────────────────────────────

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      responseStream: { emit: emitResponseStream },
      confirmation: {
        add: { emit: emitConfirmationAdd },
        update: { emit: emitConfirmationUpdate },
        remove: { emit: emitConfirmationRemove },
      },
    },
    cron: {
      onJobCreated: { emit: vi.fn() },
      onJobRemoved: { emit: vi.fn() },
    },
  },
}));

vi.mock('@/common/platform', () => ({
  getPlatformServices: () => ({
    paths: { isPackaged: () => false, getAppPath: () => null },
    worker: {
      fork: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        postMessage: vi.fn(),
        kill: vi.fn(),
      })),
    },
  }),
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
  addMessage: vi.fn(),
  addOrUpdateMessage: vi.fn(),
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
  cronService: mockCronService,
}));

vi.mock('@process/agent/aionrs', () => ({
  AionrsAgent: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    capabilities: { effort: true, effort_levels: ['low', 'medium', 'high'], modes: [] },
    stop: vi.fn(),
    kill: vi.fn(),
    send: vi.fn().mockResolvedValue(undefined),
    approveTool: mockApproveTool,
    denyTool: vi.fn(),
    setConfig: mockSetConfig,
    setMode: mockSetMode,
    sendCommand: vi.fn(),
    injectConversationHistory: vi.fn().mockResolvedValue(undefined),
    get bootstrap() {
      return Promise.resolve();
    },
  })),
}));

// ── Import under test ──────────────────────────────────────────────

import { AionrsManager } from '@/process/task/AionrsManager';

// ── Helpers ────────────────────────────────────────────────────────

function createManager(sessionMode: string): AionrsManager {
  const data = {
    workspace: '/test',
    model: { name: 'test-provider', useModel: 'test-model', baseUrl: '', platform: 'test' },
    conversation_id: 'conv-1',
    sessionMode,
  };
  const model = data.model as any;
  return new AionrsManager(data as any, model);
}

function makeContent(type: 'edit' | 'info' | 'exec', callId = 'call-1') {
  return {
    callId,
    status: 'Confirming' as const,
    confirmationDetails: { type, title: `${type} action` },
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('AionrsManager.tryAutoApprove', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── auto_edit mode ───────────────────────────────────────────────

  describe('auto_edit mode', () => {
    let manager: AionrsManager;

    beforeEach(() => {
      manager = createManager('auto_edit');
      // Ensure agent is set so approveTool can be called
      (manager as any).agent = {
        approveTool: mockApproveTool,
        start: vi.fn(),
        stop: vi.fn(),
        kill: vi.fn(),
        send: vi.fn(),
        denyTool: vi.fn(),
      };
    });

    it('should auto-approve edit tools', () => {
      const content = makeContent('edit');
      const result = (manager as any).tryAutoApprove(content);
      expect(result).toBe(true);
      expect(mockApproveTool).toHaveBeenCalledWith('call-1', 'once');
    });

    it('should auto-approve info tools', () => {
      const content = makeContent('info');
      const result = (manager as any).tryAutoApprove(content);
      expect(result).toBe(true);
      expect(mockApproveTool).toHaveBeenCalledWith('call-1', 'once');
    });

    it('should NOT auto-approve exec tools', () => {
      const content = makeContent('exec');
      const result = (manager as any).tryAutoApprove(content);
      expect(result).toBe(false);
      expect(mockApproveTool).not.toHaveBeenCalled();
    });
  });

  // ── yolo mode ────────────────────────────────────────────────────

  describe('yolo mode', () => {
    let manager: AionrsManager;

    beforeEach(() => {
      manager = createManager('yolo');
      (manager as any).agent = {
        approveTool: mockApproveTool,
        start: vi.fn(),
        stop: vi.fn(),
        kill: vi.fn(),
        send: vi.fn(),
        denyTool: vi.fn(),
      };
    });

    it('should auto-approve all tool types', () => {
      for (const type of ['edit', 'info', 'exec'] as const) {
        mockApproveTool.mockClear();
        const content = makeContent(type, `call-${type}`);
        const result = (manager as any).tryAutoApprove(content);
        expect(result).toBe(true);
        expect(mockApproveTool).toHaveBeenCalledWith(`call-${type}`, 'once');
      }
    });
  });

  // ── default mode ─────────────────────────────────────────────────

  describe('default mode', () => {
    let manager: AionrsManager;

    beforeEach(() => {
      manager = createManager('default');
      (manager as any).agent = {
        approveTool: mockApproveTool,
        start: vi.fn(),
        stop: vi.fn(),
        kill: vi.fn(),
        send: vi.fn(),
        denyTool: vi.fn(),
      };
    });

    it('should NOT auto-approve any tool types', () => {
      for (const type of ['edit', 'info', 'exec'] as const) {
        mockApproveTool.mockClear();
        const content = makeContent(type, `call-${type}`);
        const result = (manager as any).tryAutoApprove(content);
        expect(result).toBe(false);
        expect(mockApproveTool).not.toHaveBeenCalled();
      }
    });
  });
});

// ── setMode notification tests ────────────────────────────────────

describe('AionrsManager.setMode', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should send set_mode command to aionrs agent', async () => {
    const manager = createManager('default');
    (manager as any).agent = {
      approveTool: mockApproveTool,
      setMode: mockSetMode,
      start: vi.fn(),
      stop: vi.fn(),
      kill: vi.fn(),
      send: vi.fn(),
      denyTool: vi.fn(),
    };

    await manager.setMode('auto_edit');

    expect(mockSetMode).toHaveBeenCalledWith('auto_edit');
  });

  it('should save mode locally and to DB', async () => {
    const manager = createManager('default');
    (manager as any).agent = {
      approveTool: mockApproveTool,
      setMode: mockSetMode,
      start: vi.fn(),
      stop: vi.fn(),
      kill: vi.fn(),
      send: vi.fn(),
      denyTool: vi.fn(),
    };

    const result = await manager.setMode('yolo');

    expect((manager as any).currentMode).toBe('yolo');
    expect(result).toEqual({ success: true, data: { mode: 'yolo' } });
  });

  it('should not throw if agent is null', async () => {
    const manager = createManager('default');
    (manager as any).agent = null;

    await expect(manager.setMode('yolo')).resolves.toEqual({
      success: true,
      data: { mode: 'yolo' },
    });
  });
});

describe('AionrsManager.setConfig', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should emit ready capabilities to renderer after start', async () => {
    const manager = createManager('default');
    (manager as any)._capabilities = { effort: true, effort_levels: ['low', 'medium', 'high'], modes: [] };

    (manager as any).emitCapabilities();

    expect(emitResponseStream).toHaveBeenCalledWith({
      type: 'config_changed',
      conversation_id: 'conv-1',
      msg_id: '',
      data: { effort: true, effort_levels: ['low', 'medium', 'high'], modes: [] },
    });
  });

  it('should forward reasoning effort to aionrs agent', () => {
    const manager = createManager('default');
    (manager as any).agent = {
      setConfig: mockSetConfig,
      start: vi.fn(),
      stop: vi.fn(),
      kill: vi.fn(),
      send: vi.fn(),
      denyTool: vi.fn(),
    };

    manager.setConfig({ effort: 'high' });

    expect(mockSetConfig).toHaveBeenCalledWith({ effort: 'high' });
  });
});
