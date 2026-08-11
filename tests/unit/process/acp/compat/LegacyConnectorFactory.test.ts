import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentConfig, ProtocolHandlers } from '@process/acp/types';

const mocks = vi.hoisted(() => ({
  connectCodex: vi.fn(),
  connectClaude: vi.fn(),
  connectCodebuddy: vi.fn(),
  spawnGenericBackend: vi.fn(),
}));

vi.mock('@process/agent/acp/acpConnectors', () => ({
  connectCodex: mocks.connectCodex,
  connectClaude: mocks.connectClaude,
  connectCodebuddy: mocks.connectCodebuddy,
  spawnGenericBackend: mocks.spawnGenericBackend,
}));

// Mock ProcessAcpClient to avoid real child process / SDK interaction.
// We only test that the factory wires the correct spawnFn.
const mockProcessAcpClientInstances: Array<{ spawnFn: () => Promise<unknown>; options: unknown }> = [];

vi.mock('@process/acp/infra/ProcessAcpClient', () => ({
  ProcessAcpClient: class MockProcessAcpClient {
    constructor(spawnFn: () => Promise<unknown>, options: unknown) {
      mockProcessAcpClientInstances.push({ spawnFn, options });
    }
  },
}));

import { LegacyConnectorFactory } from '@process/acp/compat/LegacyConnectorFactory';

function makeConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    agentBackend: 'codex',
    agentSource: 'builtin',
    agentId: 'test-id',
    cwd: '/tmp/test',
    ...overrides,
  };
}

function makeHandlers(): ProtocolHandlers {
  return {
    onSessionUpdate: vi.fn(),
    onRequestPermission: vi.fn(),
    onReadTextFile: vi.fn(),
    onWriteTextFile: vi.fn(),
  };
}

function makeFakeChild() {
  return {
    pid: 12345,
    stdin: { destroyed: false, end: vi.fn() },
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn(),
    once: vi.fn(),
    kill: vi.fn(),
    unref: vi.fn(),
  };
}

describe('LegacyConnectorFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProcessAcpClientInstances.length = 0;
  });

  it('creates a ProcessAcpClient via create()', () => {
    const factory = new LegacyConnectorFactory();
    const handlers = makeHandlers();
    const client = factory.create(makeConfig(), handlers);
    expect(client).toBeDefined();
    expect(mockProcessAcpClientInstances).toHaveLength(1);
    expect(mockProcessAcpClientInstances[0].options).toEqual({
      backend: 'codex',
      handlers,
    });
  });

  describe('npx-based backends — spawnFn wiring', () => {
    it('uses connectCodex for codex backend', async () => {
      const child = makeFakeChild();
      mocks.connectCodex.mockImplementation(async (_cwd: string, hooks: { setup: (r: unknown) => Promise<void> }) => {
        await hooks.setup({ child, isDetached: false });
      });

      const factory = new LegacyConnectorFactory();
      factory.create(makeConfig({ agentBackend: 'codex' }), makeHandlers());

      // Invoke the spawnFn to verify it calls connectCodex
      const { spawnFn } = mockProcessAcpClientInstances[0];
      const result = await spawnFn();
      expect(mocks.connectCodex).toHaveBeenCalledWith('/tmp/test', expect.any(Object));
      expect(result).toBe(child);
    });

    it('uses connectClaude for claude backend', async () => {
      const child = makeFakeChild();
      mocks.connectClaude.mockImplementation(async (_cwd: string, hooks: { setup: (r: unknown) => Promise<void> }) => {
        await hooks.setup({ child, isDetached: true });
      });

      const factory = new LegacyConnectorFactory();
      factory.create(makeConfig({ agentBackend: 'claude' }), makeHandlers());

      const { spawnFn } = mockProcessAcpClientInstances[0];
      await spawnFn();
      expect(mocks.connectClaude).toHaveBeenCalledWith('/tmp/test', expect.any(Object));
    });

    it('uses connectCodebuddy for codebuddy backend', async () => {
      const child = makeFakeChild();
      mocks.connectCodebuddy.mockImplementation(
        async (_cwd: string, hooks: { setup: (r: unknown) => Promise<void> }) => {
          await hooks.setup({ child, isDetached: true });
        }
      );

      const factory = new LegacyConnectorFactory();
      factory.create(makeConfig({ agentBackend: 'codebuddy' }), makeHandlers());

      const { spawnFn } = mockProcessAcpClientInstances[0];
      await spawnFn();
      expect(mocks.connectCodebuddy).toHaveBeenCalledWith('/tmp/test', expect.any(Object));
    });

    it('rejects when connect function fails', async () => {
      mocks.connectCodex.mockRejectedValue(new Error('npx failed'));

      const factory = new LegacyConnectorFactory();
      factory.create(makeConfig({ agentBackend: 'codex' }), makeHandlers());

      const { spawnFn } = mockProcessAcpClientInstances[0];
      await expect(spawnFn()).rejects.toThrow('npx failed');
    });
  });

  describe('generic/custom backends', () => {
    it('uses spawnGenericBackend when command is provided', async () => {
      const child = makeFakeChild();
      mocks.spawnGenericBackend.mockResolvedValue({ child, isDetached: true });

      const factory = new LegacyConnectorFactory();
      factory.create(
        makeConfig({
          agentBackend: 'goose',
          agentSource: 'custom',
          command: '/usr/local/bin/goose',
          args: ['acp'],
          env: { GOOSE_KEY: 'xxx' },
        }),
        makeHandlers()
      );

      const { spawnFn } = mockProcessAcpClientInstances[0];
      const result = await spawnFn();
      expect(mocks.spawnGenericBackend).toHaveBeenCalledWith('goose', '/usr/local/bin/goose', '/tmp/test', ['acp'], {
        GOOSE_KEY: 'xxx',
      });
      expect(result).toBe(child);
    });

    it('throws when no command and no npx backend', async () => {
      const factory = new LegacyConnectorFactory();
      factory.create(
        makeConfig({ agentBackend: 'unknown-backend' as AgentConfig['agentBackend'], command: undefined }),
        makeHandlers()
      );

      const { spawnFn } = mockProcessAcpClientInstances[0];
      await expect(spawnFn()).rejects.toThrow('No CLI path');
    });
  });
});
