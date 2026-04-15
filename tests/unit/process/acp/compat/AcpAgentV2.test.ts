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

vi.mock('@process/acp/runtime/ConnectorFactory', () => ({
  DefaultConnectorFactory: class {
    constructor() {}
  },
}));

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
    vi.clearAllTimers();
  });

  function createAgent(): AcpAgentV2 {
    const config: OldAcpAgentConfig = {
      id: 'test-conv-1',
      backend: 'claude',
      workingDir: '/workspace/test',
      onStreamEvent: vi.fn(),
    };
    return new AcpAgentV2(config);
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

      const promise = agent.start();

      // Fast-forward past 2-minute timeout
      vi.advanceTimersByTime(120_000);

      await expect(promise).rejects.toThrow('Session start timed out');
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
      const agent = createAgent();

      await agent.kill();

      expect(mockSessionMethods.stop).toHaveBeenCalledOnce();
    });

    it('should propagate errors from session.stop()', async () => {
      const agent = createAgent();
      const testError = new Error('Stop failed');
      mockSessionMethods.stop.mockRejectedValue(testError);

      await expect(agent.kill()).rejects.toThrow('Stop failed');
      expect(mockSessionMethods.stop).toHaveBeenCalledOnce();
    });

    it('should be callable multiple times', async () => {
      const agent = createAgent();

      await agent.kill();
      await agent.kill();

      expect(mockSessionMethods.stop).toHaveBeenCalledTimes(2);
    });
  });

  describe('cancelPrompt()', () => {
    it('should delegate to session.cancelPrompt()', () => {
      const agent = createAgent();

      agent.cancelPrompt();

      expect(mockSessionMethods.cancelPrompt).toHaveBeenCalledOnce();
    });

    it('should be callable multiple times', () => {
      const agent = createAgent();

      agent.cancelPrompt();
      agent.cancelPrompt();
      agent.cancelPrompt();

      expect(mockSessionMethods.cancelPrompt).toHaveBeenCalledTimes(3);
    });

    it('should not throw if called before start', () => {
      const agent = createAgent();

      expect(() => agent.cancelPrompt()).not.toThrow();
      expect(mockSessionMethods.cancelPrompt).toHaveBeenCalledOnce();
    });
  });

  describe('isConnected getter', () => {
    it('should return false initially', () => {
      const agent = createAgent();

      expect(agent.isConnected).toBe(false);
    });

    it('should return true after status becomes starting', () => {
      const agent = createAgent();

      capturedCallbacks.onStatusChange('starting');

      expect(agent.isConnected).toBe(true);
    });

    it('should return true when status is active', () => {
      const agent = createAgent();

      capturedCallbacks.onStatusChange('active');

      expect(agent.isConnected).toBe(true);
    });

    it('should return true when status is prompting', () => {
      const agent = createAgent();

      capturedCallbacks.onStatusChange('prompting');

      expect(agent.isConnected).toBe(true);
    });

    it('should return true when status is suspended', () => {
      const agent = createAgent();

      capturedCallbacks.onStatusChange('suspended');

      expect(agent.isConnected).toBe(true);
    });

    it('should return true when status is resuming', () => {
      const agent = createAgent();

      capturedCallbacks.onStatusChange('resuming');

      expect(agent.isConnected).toBe(true);
    });

    it('should return false when status is error', () => {
      const agent = createAgent();

      capturedCallbacks.onStatusChange('error');

      expect(agent.isConnected).toBe(false);
    });

    it('should return false when status returns to idle', () => {
      const agent = createAgent();

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

    it('should return false when status is starting', () => {
      const agent = createAgent();

      capturedCallbacks.onStatusChange('starting');

      expect(agent.hasActiveSession).toBe(false);
    });

    it('should return true when status is active', () => {
      const agent = createAgent();

      capturedCallbacks.onStatusChange('active');

      expect(agent.hasActiveSession).toBe(true);
    });

    it('should return true when status is prompting', () => {
      const agent = createAgent();

      capturedCallbacks.onStatusChange('prompting');

      expect(agent.hasActiveSession).toBe(true);
    });

    it('should return false when status is suspended', () => {
      const agent = createAgent();

      capturedCallbacks.onStatusChange('suspended');

      expect(agent.hasActiveSession).toBe(false);
    });

    it('should return false when status is resuming', () => {
      const agent = createAgent();

      capturedCallbacks.onStatusChange('resuming');

      expect(agent.hasActiveSession).toBe(false);
    });

    it('should return false when status is error', () => {
      const agent = createAgent();

      capturedCallbacks.onStatusChange('error');

      expect(agent.hasActiveSession).toBe(false);
    });

    it('should return false when status is idle', () => {
      const agent = createAgent();

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

    it('should handle cancelPrompt during active session', () => {
      const agent = createAgent();

      capturedCallbacks.onStatusChange('prompting');

      agent.cancelPrompt();

      expect(mockSessionMethods.cancelPrompt).toHaveBeenCalledOnce();
    });
  });
});
