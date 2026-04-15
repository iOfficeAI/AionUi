import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentConfig } from '@process/acp/types';

const mocks = vi.hoisted(() => ({
  connectCodex: vi.fn(),
  connectClaude: vi.fn(),
  connectCodebuddy: vi.fn(),
  spawnGenericBackend: vi.fn(),
  fromChildProcess: vi.fn(() => ({ readable: {}, writable: {} })),
  gracefulShutdown: vi.fn(),
  isProcessAlive: vi.fn(() => true),
}));

vi.mock('@process/agent/acp/acpConnectors', () => ({
  connectCodex: mocks.connectCodex,
  connectClaude: mocks.connectClaude,
  connectCodebuddy: mocks.connectCodebuddy,
  spawnGenericBackend: mocks.spawnGenericBackend,
}));

vi.mock('@process/acp/infra/NdjsonTransport', () => ({
  NdjsonTransport: { fromChildProcess: mocks.fromChildProcess },
}));

vi.mock('@process/acp/infra/processUtils', () => ({
  gracefulShutdown: mocks.gracefulShutdown,
  isProcessAlive: mocks.isProcessAlive,
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
  });

  it('creates a LegacyConnector via create()', () => {
    const factory = new LegacyConnectorFactory();
    const connector = factory.create(makeConfig());
    expect(connector).toBeDefined();
    expect(typeof connector.connect).toBe('function');
    expect(typeof connector.isAlive).toBe('function');
  });

  describe('npx-based backends', () => {
    it('uses connectCodex for codex backend', async () => {
      const child = makeFakeChild();
      mocks.connectCodex.mockImplementation(async (_cwd: string, hooks: { setup: (r: unknown) => Promise<void> }) => {
        await hooks.setup({ child, isDetached: false });
      });

      const factory = new LegacyConnectorFactory();
      const connector = factory.create(makeConfig({ agentBackend: 'codex' }));
      const handle = await connector.connect();

      expect(mocks.connectCodex).toHaveBeenCalledWith('/tmp/test', expect.any(Object));
      expect(handle.stream).toBeDefined();
      expect(typeof handle.shutdown).toBe('function');
    });

    it('uses connectClaude for claude backend', async () => {
      const child = makeFakeChild();
      mocks.connectClaude.mockImplementation(async (_cwd: string, hooks: { setup: (r: unknown) => Promise<void> }) => {
        await hooks.setup({ child, isDetached: true });
      });

      const factory = new LegacyConnectorFactory();
      const connector = factory.create(makeConfig({ agentBackend: 'claude' }));
      await connector.connect();

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
      const connector = factory.create(makeConfig({ agentBackend: 'codebuddy' }));
      await connector.connect();

      expect(mocks.connectCodebuddy).toHaveBeenCalledWith('/tmp/test', expect.any(Object));
    });

    it('rejects when connect function fails', async () => {
      mocks.connectCodex.mockRejectedValue(new Error('npx failed'));

      const factory = new LegacyConnectorFactory();
      const connector = factory.create(makeConfig({ agentBackend: 'codex' }));

      await expect(connector.connect()).rejects.toThrow('npx failed');
    });
  });

  describe('generic/custom backends', () => {
    it('uses spawnGenericBackend when command is provided', async () => {
      const child = makeFakeChild();
      mocks.spawnGenericBackend.mockResolvedValue({ child, isDetached: true });

      const factory = new LegacyConnectorFactory();
      const connector = factory.create(
        makeConfig({
          agentBackend: 'goose',
          agentSource: 'custom',
          command: '/usr/local/bin/goose',
          args: ['acp'],
          env: { GOOSE_KEY: 'xxx' },
        })
      );
      const handle = await connector.connect();

      expect(mocks.spawnGenericBackend).toHaveBeenCalledWith('goose', '/usr/local/bin/goose', '/tmp/test', ['acp'], {
        GOOSE_KEY: 'xxx',
      });
      expect(handle.stream).toBeDefined();
    });

    it('throws when no command and no npx backend', async () => {
      const factory = new LegacyConnectorFactory();
      const connector = factory.create(
        makeConfig({ agentBackend: 'unknown-backend' as AgentConfig['agentBackend'], command: undefined })
      );

      await expect(connector.connect()).rejects.toThrow('No CLI path');
    });
  });

  describe('isAlive', () => {
    it('returns false before connect', () => {
      const factory = new LegacyConnectorFactory();
      const connector = factory.create(makeConfig());
      expect(connector.isAlive()).toBe(false);
    });

    it('returns true after connect', async () => {
      const child = makeFakeChild();
      mocks.connectCodex.mockImplementation(async (_cwd: string, hooks: { setup: (r: unknown) => Promise<void> }) => {
        await hooks.setup({ child, isDetached: false });
      });
      mocks.isProcessAlive.mockReturnValue(true);

      const factory = new LegacyConnectorFactory();
      const connector = factory.create(makeConfig());
      await connector.connect();

      expect(connector.isAlive()).toBe(true);
    });
  });

  describe('shutdown', () => {
    it('calls gracefulShutdown on the child process', async () => {
      const child = makeFakeChild();
      mocks.connectCodex.mockImplementation(async (_cwd: string, hooks: { setup: (r: unknown) => Promise<void> }) => {
        await hooks.setup({ child, isDetached: false });
      });

      const factory = new LegacyConnectorFactory();
      const connector = factory.create(makeConfig());
      const handle = await connector.connect();

      await handle.shutdown();
      expect(mocks.gracefulShutdown).toHaveBeenCalledWith(child, 100);
    });
  });
});
