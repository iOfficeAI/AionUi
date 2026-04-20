// tests/unit/process/acp/compat/AcpAgentV2.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AcpAgentV2 } from '@process/acp/compat/AcpAgentV2';
import type { SessionCallbacks } from '@process/acp/types';
import type { OldAcpAgentConfig } from '@process/acp/compat/typeBridge';

// Mock dependencies
let capturedCallbacks: SessionCallbacks;
let mockSessionMethods: {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  cancelPrompt: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
  confirmPermission: ReturnType<typeof vi.fn>;
  setModel: ReturnType<typeof vi.fn>;
  setMode: ReturnType<typeof vi.fn>;
  setConfigOption: ReturnType<typeof vi.fn>;
  getConfigOptions: ReturnType<typeof vi.fn>;
};

vi.mock('@process/acp/session/AcpSession', () => ({
  AcpSession: class MockAcpSession {
    constructor(_config: unknown, _factory: unknown, callbacks: SessionCallbacks) {
      capturedCallbacks = callbacks;
    }

    start = mockSessionMethods.start;
    stop = mockSessionMethods.stop;
    cancelPrompt = mockSessionMethods.cancelPrompt;
    sendMessage = mockSessionMethods.sendMessage;
    confirmPermission = mockSessionMethods.confirmPermission;
    setModel = mockSessionMethods.setModel;
    setMode = mockSessionMethods.setMode;
    setConfigOption = mockSessionMethods.setConfigOption;
    getConfigOptions = mockSessionMethods.getConfigOptions;

    get status() {
      return 'idle';
    }

    get sessionId() {
      return null;
    }
  },
}));

vi.mock('@process/acp/compat/LegacyConnectorFactory', () => ({
  LegacyConnectorFactory: class {
    constructor() {}
  },
}));

vi.mock('@process/acp/compat/typeBridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@process/acp/compat/typeBridge')>();
  return {
    ...actual,
    loadAuthCredentials: vi.fn().mockResolvedValue(undefined),
  };
});

describe('AcpAgentV2 - Lifecycle Methods', () => {
  beforeEach(() => {
    mockSessionMethods = {
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
      cancelPrompt: vi.fn(),
      sendMessage: vi.fn(),
      confirmPermission: vi.fn(),
      setModel: vi.fn(),
      setMode: vi.fn(),
      setConfigOption: vi.fn(),
      getConfigOptions: vi.fn().mockReturnValue([]),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllTimers();
  });

  function createAgent(overrides?: Partial<OldAcpAgentConfig>): AcpAgentV2 {
    const config: OldAcpAgentConfig = {
      id: 'test-conv-1',
      backend: 'claude',
      workingDir: '/workspace/test',
      onStreamEvent: vi.fn(),
      ...overrides,
    };
    return new AcpAgentV2(config);
  }

  /** Create agent and drive it to 'active' so this.session is populated. */
  async function createStartedAgent(overrides?: Partial<OldAcpAgentConfig>): Promise<AcpAgentV2> {
    const agent = createAgent(overrides);
    mockSessionMethods.start.mockImplementation(() => {
      setTimeout(() => capturedCallbacks.onStatusChange('active'), 0);
    });
    await agent.start();
    mockSessionMethods.start.mockReset();
    return agent;
  }

  describe('start()', () => {
    it('should resolve when session reaches active status', async () => {
      const agent = createAgent();

      // Mock start to trigger status change after a tick
      mockSessionMethods.start.mockImplementation(() => {
        setTimeout(() => capturedCallbacks.onStatusChange('active'), 0);
      });

      const promise = agent.start();
      await expect(promise).resolves.toBeUndefined();
      expect(mockSessionMethods.start).toHaveBeenCalledOnce();
    });

    it('should reject when session enters error status', async () => {
      const agent = createAgent();

      // Mock start to trigger error status after a tick
      mockSessionMethods.start.mockImplementation(() => {
        setTimeout(() => capturedCallbacks.onStatusChange('error'), 0);
      });

      const promise = agent.start();
      await expect(promise).rejects.toThrow('Session failed to start');
      expect(mockSessionMethods.start).toHaveBeenCalledOnce();
    });

    it('should reject on timeout after 120 seconds', async () => {
      vi.useFakeTimers();
      const agent = createAgent();

      // Mock start that never triggers status change
      mockSessionMethods.start.mockImplementation(() => {
        // Do nothing - simulate hanging start
      });

      const promise = agent.start().catch((e: unknown) => e);

      // Fast-forward past 2-minute timeout (async to allow ensureSession microtask to settle)
      await vi.advanceTimersByTimeAsync(120_000);

      const result = await promise;
      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toBe('Session start timed out');
      expect(mockSessionMethods.start).toHaveBeenCalledOnce();

      vi.useRealTimers();
    });

    it('should clear timeout when successfully resolving', async () => {
      vi.useFakeTimers();
      const agent = createAgent();

      mockSessionMethods.start.mockImplementation(() => {
        setTimeout(() => capturedCallbacks.onStatusChange('active'), 100);
      });

      const promise = agent.start();

      // Advance to trigger status change
      await vi.advanceTimersByTimeAsync(100);

      await expect(promise).resolves.toBeUndefined();

      // Verify timeout was cleared by advancing past it
      await vi.advanceTimersByTimeAsync(120_000);
      // No additional error should be thrown

      vi.useRealTimers();
    });

    it('should clear timeout when rejecting on error status', async () => {
      vi.useFakeTimers();
      const agent = createAgent();

      mockSessionMethods.start.mockImplementation(() => {
        setTimeout(() => capturedCallbacks.onStatusChange('error'), 100);
      });

      const promise = agent.start().catch((err) => err);

      // Advance to trigger status change
      await vi.advanceTimersByTimeAsync(100);

      const result = await promise;
      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toBe('Session failed to start');

      // Verify timeout was cleared by advancing past it
      await vi.advanceTimersByTimeAsync(120_000);
      // No additional error should be thrown

      vi.useRealTimers();
    });

    it('should handle multiple status changes correctly', async () => {
      const agent = createAgent();

      mockSessionMethods.start.mockImplementation(() => {
        setTimeout(() => {
          capturedCallbacks.onStatusChange('starting');
          capturedCallbacks.onStatusChange('active');
        }, 0);
      });

      const promise = agent.start();
      await expect(promise).resolves.toBeUndefined();
    });
  });

  describe('kill()', () => {
    it('should call session.stop() and wait for completion', async () => {
      const agent = await createStartedAgent();

      await agent.kill();

      expect(mockSessionMethods.stop).toHaveBeenCalledOnce();
    });

    it('should propagate errors from session.stop()', async () => {
      const agent = await createStartedAgent();
      const testError = new Error('Stop failed');
      mockSessionMethods.stop.mockRejectedValue(testError);

      await expect(agent.kill()).rejects.toThrow('Stop failed');
      expect(mockSessionMethods.stop).toHaveBeenCalledOnce();
    });

    it('should be callable multiple times', async () => {
      const agent = await createStartedAgent();

      await agent.kill();
      await agent.kill();

      expect(mockSessionMethods.stop).toHaveBeenCalledTimes(2);
    });
  });

  describe('cancelPrompt()', () => {
    it('should delegate to session.cancelPrompt()', async () => {
      const agent = await createStartedAgent();

      agent.cancelPrompt();

      expect(mockSessionMethods.cancelPrompt).toHaveBeenCalledOnce();
    });

    it('should be callable multiple times', async () => {
      const agent = await createStartedAgent();

      agent.cancelPrompt();
      agent.cancelPrompt();
      agent.cancelPrompt();

      expect(mockSessionMethods.cancelPrompt).toHaveBeenCalledTimes(3);
    });

    it('should be a safe no-op if called before start (session is null)', () => {
      const agent = createAgent();

      expect(() => agent.cancelPrompt()).not.toThrow();
    });
  });

  describe('isConnected getter', () => {
    it('should return false initially', () => {
      const agent = createAgent();

      expect(agent.isConnected).toBe(false);
    });

    it('should return true after status becomes starting', async () => {
      const agent = await createStartedAgent();

      capturedCallbacks.onStatusChange('starting');

      expect(agent.isConnected).toBe(true);
    });

    it('should return true when status is active', async () => {
      const agent = await createStartedAgent();

      capturedCallbacks.onStatusChange('active');

      expect(agent.isConnected).toBe(true);
    });

    it('should return true when status is prompting', async () => {
      const agent = await createStartedAgent();

      capturedCallbacks.onStatusChange('prompting');

      expect(agent.isConnected).toBe(true);
    });

    it('should return true when status is suspended', async () => {
      const agent = await createStartedAgent();

      capturedCallbacks.onStatusChange('suspended');

      expect(agent.isConnected).toBe(true);
    });

    it('should return true when status is resuming', async () => {
      const agent = await createStartedAgent();

      capturedCallbacks.onStatusChange('resuming');

      expect(agent.isConnected).toBe(true);
    });

    it('should return false when status is error', async () => {
      const agent = await createStartedAgent();

      capturedCallbacks.onStatusChange('error');

      expect(agent.isConnected).toBe(false);
    });

    it('should return false when status returns to idle', async () => {
      const agent = await createStartedAgent();

      capturedCallbacks.onStatusChange('active');
      expect(agent.isConnected).toBe(true);

      capturedCallbacks.onStatusChange('idle');
      expect(agent.isConnected).toBe(false);
    });
  });

  describe('hasActiveSession getter', () => {
    it('should return false initially', () => {
      const agent = createAgent();

      expect(agent.hasActiveSession).toBe(false);
    });

    it('should return false when status is starting', async () => {
      const agent = await createStartedAgent();

      capturedCallbacks.onStatusChange('starting');

      expect(agent.hasActiveSession).toBe(false);
    });

    it('should return true when status is active', async () => {
      const agent = await createStartedAgent();

      capturedCallbacks.onStatusChange('active');

      expect(agent.hasActiveSession).toBe(true);
    });

    it('should return true when status is prompting', async () => {
      const agent = await createStartedAgent();

      capturedCallbacks.onStatusChange('prompting');

      expect(agent.hasActiveSession).toBe(true);
    });

    it('should return false when status is suspended', async () => {
      const agent = await createStartedAgent();

      capturedCallbacks.onStatusChange('suspended');

      expect(agent.hasActiveSession).toBe(false);
    });

    it('should return false when status is resuming', async () => {
      const agent = await createStartedAgent();

      capturedCallbacks.onStatusChange('resuming');

      expect(agent.hasActiveSession).toBe(false);
    });

    it('should return false when status is error', async () => {
      const agent = await createStartedAgent();

      capturedCallbacks.onStatusChange('error');

      expect(agent.hasActiveSession).toBe(false);
    });

    it('should return false when status is idle', async () => {
      const agent = await createStartedAgent();

      capturedCallbacks.onStatusChange('idle');

      expect(agent.hasActiveSession).toBe(false);
    });
  });

  describe('Integration - lifecycle flow', () => {
    it('should complete full start -> active -> kill flow', async () => {
      const agent = createAgent();

      // Start and activate
      mockSessionMethods.start.mockImplementation(() => {
        setTimeout(() => capturedCallbacks.onStatusChange('active'), 0);
      });

      await agent.start();
      expect(agent.isConnected).toBe(true);
      expect(agent.hasActiveSession).toBe(true);

      // Kill
      await agent.kill();
      expect(mockSessionMethods.stop).toHaveBeenCalledOnce();
    });

    it('should handle start -> error flow', async () => {
      const agent = createAgent();

      mockSessionMethods.start.mockImplementation(() => {
        setTimeout(() => capturedCallbacks.onStatusChange('error'), 0);
      });

      await expect(agent.start()).rejects.toThrow('Session failed to start');
      expect(agent.isConnected).toBe(false);
      expect(agent.hasActiveSession).toBe(false);
    });

    it('should handle cancelPrompt during active session', async () => {
      const agent = await createStartedAgent();

      capturedCallbacks.onStatusChange('prompting');

      agent.cancelPrompt();

      expect(mockSessionMethods.cancelPrompt).toHaveBeenCalledOnce();
    });
  });
});

describe('AcpAgentV2 - Messaging + Permission Methods', () => {
  beforeEach(() => {
    mockSessionMethods = {
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
      cancelPrompt: vi.fn(),
      sendMessage: vi.fn(),
      confirmPermission: vi.fn(),
      setModel: vi.fn(),
      setMode: vi.fn(),
      setConfigOption: vi.fn(),
      getConfigOptions: vi.fn().mockReturnValue([]),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllTimers();
  });

  function createAgentWithSignalCapture() {
    const onStreamEvent = vi.fn();
    const onSignalEvent = vi.fn();
    const config: OldAcpAgentConfig = {
      id: 'test-conv-1',
      backend: 'claude',
      workingDir: '/workspace/test',
      onStreamEvent,
      onSignalEvent,
    };
    const agent = new AcpAgentV2(config);
    return { agent, onStreamEvent, onSignalEvent };
  }

  /** Create agent with signal capture and drive it to 'active' so this.session is populated. */
  async function createStartedAgentWithSignalCapture() {
    const result = createAgentWithSignalCapture();
    mockSessionMethods.start.mockImplementation(() => {
      setTimeout(() => capturedCallbacks.onStatusChange('active'), 0);
    });
    await result.agent.start();
    mockSessionMethods.start.mockReset();
    return result;
  }

  describe('sendMessage()', () => {
    it('should delegate to session.sendMessage and return success', async () => {
      const { agent } = await createStartedAgentWithSignalCapture();

      const result = await agent.sendMessage({ content: 'Hello', files: ['/test/file.txt'] });

      expect(result.success).toBe(true);
      expect(result.data).toBe(null);
      expect(mockSessionMethods.sendMessage).toHaveBeenCalledWith('Hello', ['/test/file.txt']);
    });

    it('should emit start event via onStreamEvent before sending', async () => {
      const { agent, onStreamEvent } = await createStartedAgentWithSignalCapture();

      await agent.sendMessage({ content: 'Test message', msg_id: 'msg123' });

      expect(onStreamEvent).toHaveBeenCalledWith({
        type: 'start',
        data: null,
        msg_id: 'msg123',
        conversation_id: 'test-conv-1',
      });
      expect(mockSessionMethods.sendMessage).toHaveBeenCalledWith('Test message', undefined);
    });

    it('should generate msg_id if not provided', async () => {
      const { agent, onStreamEvent } = await createStartedAgentWithSignalCapture();

      await agent.sendMessage({ content: 'Test' });

      expect(onStreamEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'start',
          msg_id: expect.stringMatching(/^start_\d+$/),
          conversation_id: 'test-conv-1',
        })
      );
    });

    it('should return error result when session.sendMessage throws', async () => {
      const { agent } = await createStartedAgentWithSignalCapture();
      const testError = new Error('Send failed');
      mockSessionMethods.sendMessage.mockImplementation(() => {
        throw testError;
      });

      const result = await agent.sendMessage({ content: 'Test' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('UNKNOWN');
        expect(result.error.message).toBe('Send failed');
        expect(result.error.retryable).toBe(false);
      }
    });

    it('should work without onSignalEvent callback', async () => {
      const config: OldAcpAgentConfig = {
        id: 'test-conv-1',
        backend: 'claude',
        workingDir: '/workspace/test',
        onStreamEvent: vi.fn(),
        // No onSignalEvent
      };
      const agent = new AcpAgentV2(config);
      mockSessionMethods.start.mockImplementation(() => {
        setTimeout(() => capturedCallbacks.onStatusChange('active'), 0);
      });
      await agent.start();
      mockSessionMethods.start.mockReset();

      const result = await agent.sendMessage({ content: 'Test' });

      expect(result.success).toBe(true);
      expect(mockSessionMethods.sendMessage).toHaveBeenCalledWith('Test', undefined);
    });
  });

  describe('confirmMessage()', () => {
    it('should delegate to session.confirmPermission', async () => {
      const { agent } = await createStartedAgentWithSignalCapture();

      const result = await agent.confirmMessage({ confirmKey: 'allow_once', callId: 'call123' });

      expect(result.success).toBe(true);
      expect(result.data).toBe(null);
      expect(mockSessionMethods.confirmPermission).toHaveBeenCalledWith('call123', 'allow_once');
    });

    it('should return success result', async () => {
      const { agent } = await createStartedAgentWithSignalCapture();

      const result = await agent.confirmMessage({ confirmKey: 'reject_once', callId: 'call456' });

      expect(result).toEqual({ success: true, data: null });
    });

    it('should return error result when session.confirmPermission throws', async () => {
      const { agent } = await createStartedAgentWithSignalCapture();
      const testError = new Error('Confirm failed');
      mockSessionMethods.confirmPermission.mockImplementation(() => {
        throw testError;
      });

      const result = await agent.confirmMessage({ confirmKey: 'allow_once', callId: 'call123' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('UNKNOWN');
        expect(result.error.message).toBe('Confirm failed');
        expect(result.error.retryable).toBe(false);
      }
    });
  });
});

describe('AcpAgentV2 - Config/Model/Mode Methods', () => {
  beforeEach(() => {
    mockSessionMethods = {
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
      cancelPrompt: vi.fn(),
      sendMessage: vi.fn(),
      confirmPermission: vi.fn(),
      setModel: vi.fn(),
      setMode: vi.fn(),
      setConfigOption: vi.fn(),
      getConfigOptions: vi.fn().mockReturnValue([]),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllTimers();
  });

  function createAgent(overrides?: Partial<OldAcpAgentConfig>): AcpAgentV2 {
    const config: OldAcpAgentConfig = {
      id: 'test-conv-1',
      backend: 'claude',
      workingDir: '/workspace/test',
      onStreamEvent: vi.fn(),
      ...overrides,
    };
    return new AcpAgentV2(config);
  }

  /** Create agent and drive it to 'active' so this.session is populated. */
  async function createStartedAgent(overrides?: Partial<OldAcpAgentConfig>): Promise<AcpAgentV2> {
    const agent = createAgent(overrides);
    mockSessionMethods.start.mockImplementation(() => {
      setTimeout(() => capturedCallbacks.onStatusChange('active'), 0);
    });
    await agent.start();
    mockSessionMethods.start.mockReset();
    return agent;
  }

  describe('getModelInfo()', () => {
    it('should return null initially', () => {
      const agent = createAgent();

      expect(agent.getModelInfo()).toBe(null);
    });

    it('should return cached model info after onModelUpdate callback', async () => {
      const agent = await createStartedAgent();

      capturedCallbacks.onModelUpdate({
        currentModelId: 'claude-4',
        availableModels: [
          { modelId: 'claude-4', name: 'Claude 4', tier: 'premium' },
          { modelId: 'claude-3', name: 'Claude 3', tier: 'standard' },
        ],
      });

      const info = agent.getModelInfo();
      expect(info).toEqual({
        currentModelId: 'claude-4',
        currentModelLabel: 'Claude 4',
        availableModels: [
          { id: 'claude-4', label: 'Claude 4' },
          { id: 'claude-3', label: 'Claude 3' },
        ],
        canSwitch: true,
        source: 'models',
      });
    });

    it('should update cached value on subsequent onModelUpdate calls', async () => {
      const agent = await createStartedAgent();

      capturedCallbacks.onModelUpdate({
        currentModelId: 'claude-3',
        availableModels: [{ modelId: 'claude-3', name: 'Claude 3', tier: 'standard' }],
      });

      expect(agent.getModelInfo()?.currentModelId).toBe('claude-3');

      capturedCallbacks.onModelUpdate({
        currentModelId: 'claude-4',
        availableModels: [{ modelId: 'claude-4', name: 'Claude 4', tier: 'premium' }],
      });

      expect(agent.getModelInfo()?.currentModelId).toBe('claude-4');
    });
  });

  describe('getConfigOptions()', () => {
    it('should return empty array initially', () => {
      const agent = createAgent();

      expect(agent.getConfigOptions()).toEqual([]);
    });

    it('should return cached config options after onConfigUpdate callback', async () => {
      const agent = await createStartedAgent();

      capturedCallbacks.onConfigUpdate({
        configOptions: [
          {
            id: 'opt1',
            name: 'Option 1',
            category: 'general',
            description: 'First option',
            type: 'select',
            currentValue: 'val1',
            options: [],
          },
          {
            id: 'opt2',
            name: 'Option 2',
            category: 'general',
            description: 'Second option',
            type: 'boolean',
            currentValue: true,
            options: [],
          },
        ],
        availableCommands: [],
      });

      const options = agent.getConfigOptions();
      expect(options).toEqual([
        {
          id: 'opt1',
          name: 'Option 1',
          label: 'Option 1',
          type: 'select',
          category: 'general',
          description: 'First option',
          currentValue: 'val1',
          selectedValue: 'val1',
        },
        {
          id: 'opt2',
          name: 'Option 2',
          label: 'Option 2',
          type: 'boolean',
          category: 'general',
          description: 'Second option',
          currentValue: 'true',
          selectedValue: 'true',
        },
      ]);
    });
  });

  describe('setModelByConfigOption()', () => {
    it('should call session.setModel and resolve when onModelUpdate fires', async () => {
      const agent = await createStartedAgent();

      // Mock setModel to trigger onModelUpdate after a tick
      mockSessionMethods.setModel.mockImplementation(() => {
        setTimeout(() => {
          capturedCallbacks.onModelUpdate({
            currentModelId: 'claude-4',
            availableModels: [{ modelId: 'claude-4', name: 'Claude 4', tier: 'premium' }],
          });
        }, 0);
      });

      const promise = agent.setModelByConfigOption('claude-4');

      await expect(promise).resolves.toEqual({
        currentModelId: 'claude-4',
        currentModelLabel: 'Claude 4',
        availableModels: [{ id: 'claude-4', label: 'Claude 4' }],
        canSwitch: true,
        source: 'models',
      });
      expect(mockSessionMethods.setModel).toHaveBeenCalledWith('claude-4');
    });

    it('should resolve with cached info on timeout', async () => {
      const agent = await createStartedAgent();
      vi.useFakeTimers();

      // Set initial cached value
      capturedCallbacks.onModelUpdate({
        currentModelId: 'claude-3',
        availableModels: [{ modelId: 'claude-3', name: 'Claude 3', tier: 'standard' }],
      });

      // Mock setModel that never triggers callback
      mockSessionMethods.setModel.mockImplementation(() => {
        // Do nothing - simulate hanging
      });

      const promise = agent.setModelByConfigOption('claude-4');

      // Fast-forward past 10-second timeout
      await vi.advanceTimersByTimeAsync(10_000);

      const result = await promise;
      expect(result).toEqual({
        currentModelId: 'claude-3',
        currentModelLabel: 'Claude 3',
        availableModels: [{ id: 'claude-3', label: 'Claude 3' }],
        canSwitch: true,
        source: 'models',
      });
      expect(mockSessionMethods.setModel).toHaveBeenCalledWith('claude-4');

      vi.useRealTimers();
    });

    it('should clear timeout when callback fires', async () => {
      const agent = await createStartedAgent();
      vi.useFakeTimers();

      mockSessionMethods.setModel.mockImplementation(() => {
        setTimeout(() => {
          capturedCallbacks.onModelUpdate({
            currentModelId: 'claude-4',
            availableModels: [{ modelId: 'claude-4', name: 'Claude 4', tier: 'premium' }],
          });
        }, 100);
      });

      const promise = agent.setModelByConfigOption('claude-4');

      await vi.advanceTimersByTimeAsync(100);

      await expect(promise).resolves.toEqual({
        currentModelId: 'claude-4',
        currentModelLabel: 'Claude 4',
        availableModels: [{ id: 'claude-4', label: 'Claude 4' }],
        canSwitch: true,
        source: 'models',
      });

      // Verify timeout was cleared by advancing past it
      await vi.advanceTimersByTimeAsync(10_000);

      vi.useRealTimers();
    });
  });

  describe('setMode()', () => {
    it('should call session.setMode and resolve when onModeUpdate fires', async () => {
      const agent = await createStartedAgent();

      // Mock setMode to trigger onModeUpdate after a tick
      mockSessionMethods.setMode.mockImplementation(() => {
        setTimeout(() => {
          capturedCallbacks.onModeUpdate({ currentMode: 'bypassPermissions' });
        }, 0);
      });

      const promise = agent.setMode('bypassPermissions');

      await expect(promise).resolves.toEqual({ success: true });
      expect(mockSessionMethods.setMode).toHaveBeenCalledWith('bypassPermissions');
    });

    it('should resolve with success on timeout', async () => {
      const agent = await createStartedAgent();
      vi.useFakeTimers();

      // Mock setMode that never triggers callback
      mockSessionMethods.setMode.mockImplementation(() => {
        // Do nothing - simulate hanging
      });

      const promise = agent.setMode('standard');

      // Fast-forward past 10-second timeout
      await vi.advanceTimersByTimeAsync(10_000);

      const result = await promise;
      expect(result).toEqual({ success: true });
      expect(mockSessionMethods.setMode).toHaveBeenCalledWith('standard');

      vi.useRealTimers();
    });

    it('should clear timeout when callback fires', async () => {
      const agent = await createStartedAgent();
      vi.useFakeTimers();

      mockSessionMethods.setMode.mockImplementation(() => {
        setTimeout(() => {
          capturedCallbacks.onModeUpdate({ currentMode: 'standard' });
        }, 100);
      });

      const promise = agent.setMode('standard');

      await vi.advanceTimersByTimeAsync(100);

      await expect(promise).resolves.toEqual({ success: true });

      // Verify timeout was cleared by advancing past it
      await vi.advanceTimersByTimeAsync(10_000);

      vi.useRealTimers();
    });
  });

  describe('setConfigOption()', () => {
    it('should call session.setConfigOption and resolve when onConfigUpdate fires', async () => {
      const agent = await createStartedAgent();

      // Mock setConfigOption to trigger onConfigUpdate after a tick
      mockSessionMethods.setConfigOption.mockImplementation(() => {
        setTimeout(() => {
          capturedCallbacks.onConfigUpdate({
            configOptions: [
              {
                id: 'opt1',
                name: 'Option 1',
                category: 'general',
                description: 'First option',
                type: 'select',
                currentValue: 'new-value',
                options: [],
              },
            ],
            availableCommands: [],
          });
        }, 0);
      });

      const promise = agent.setConfigOption('opt1', 'new-value');

      await expect(promise).resolves.toEqual([
        {
          id: 'opt1',
          name: 'Option 1',
          label: 'Option 1',
          type: 'select',
          category: 'general',
          description: 'First option',
          currentValue: 'new-value',
          selectedValue: 'new-value',
        },
      ]);
      expect(mockSessionMethods.setConfigOption).toHaveBeenCalledWith('opt1', 'new-value');
    });

    it('should resolve with cached options on timeout', async () => {
      const agent = await createStartedAgent();
      vi.useFakeTimers();

      // Set initial cached value
      capturedCallbacks.onConfigUpdate({
        configOptions: [
          {
            id: 'opt1',
            name: 'Option 1',
            category: 'general',
            description: 'First option',
            type: 'select',
            currentValue: 'old-value',
            options: [],
          },
        ],
        availableCommands: [],
      });

      // Mock setConfigOption that never triggers callback
      mockSessionMethods.setConfigOption.mockImplementation(() => {
        // Do nothing - simulate hanging
      });

      const promise = agent.setConfigOption('opt1', 'new-value');

      // Fast-forward past 10-second timeout
      await vi.advanceTimersByTimeAsync(10_000);

      const result = await promise;
      expect(result).toEqual([
        {
          id: 'opt1',
          name: 'Option 1',
          label: 'Option 1',
          type: 'select',
          category: 'general',
          description: 'First option',
          currentValue: 'old-value',
          selectedValue: 'old-value',
        },
      ]);
      expect(mockSessionMethods.setConfigOption).toHaveBeenCalledWith('opt1', 'new-value');

      vi.useRealTimers();
    });

    it('should clear timeout when callback fires', async () => {
      const agent = await createStartedAgent();
      vi.useFakeTimers();

      mockSessionMethods.setConfigOption.mockImplementation(() => {
        setTimeout(() => {
          capturedCallbacks.onConfigUpdate({
            configOptions: [
              {
                id: 'opt1',
                name: 'Option 1',
                category: 'general',
                description: 'First option',
                type: 'select',
                currentValue: 'updated',
                options: [],
              },
            ],
            availableCommands: [],
          });
        }, 100);
      });

      const promise = agent.setConfigOption('opt1', 'updated');

      await vi.advanceTimersByTimeAsync(100);

      await expect(promise).resolves.toEqual([
        {
          id: 'opt1',
          name: 'Option 1',
          label: 'Option 1',
          type: 'select',
          category: 'general',
          description: 'First option',
          currentValue: 'updated',
          selectedValue: 'updated',
        },
      ]);

      // Verify timeout was cleared by advancing past it
      await vi.advanceTimersByTimeAsync(10_000);

      vi.useRealTimers();
    });
  });

  describe('enableYoloMode()', () => {
    it('should delegate to setMode with bypassPermissions', async () => {
      const agent = await createStartedAgent();

      // Mock setMode to trigger onModeUpdate after a tick
      mockSessionMethods.setMode.mockImplementation(() => {
        setTimeout(() => {
          capturedCallbacks.onModeUpdate({ currentMode: 'bypassPermissions' });
        }, 0);
      });

      await agent.enableYoloMode();

      expect(mockSessionMethods.setMode).toHaveBeenCalledWith('bypassPermissions');
    });

    it('should propagate result from setMode', async () => {
      const agent = await createStartedAgent();

      mockSessionMethods.setMode.mockImplementation(() => {
        setTimeout(() => {
          capturedCallbacks.onModeUpdate({ currentMode: 'bypassPermissions' });
        }, 0);
      });

      const promise = agent.enableYoloMode();

      await expect(promise).resolves.toBeUndefined();
    });
  });
});
