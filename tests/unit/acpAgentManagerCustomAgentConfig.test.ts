import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockProcessConfigGetter = (key: string) => Promise<unknown | null>;

const { capturedAgentConfigs, mockProcessConfigGet, mockGetAcpAdapters } = vi.hoisted(() => ({
  capturedAgentConfigs: [] as Array<Record<string, unknown>>,
  mockProcessConfigGet: vi.fn<MockProcessConfigGetter>(async (_key: string) => null),
  mockGetAcpAdapters: vi.fn(() => [] as Array<Record<string, unknown>>),
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

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: { responseStream: { emit: vi.fn() } },
    conversation: {
      confirmation: {
        add: { emit: vi.fn() },
        update: { emit: vi.fn() },
        remove: { emit: vi.fn() },
      },
      responseStream: { emit: vi.fn() },
      listChanged: { emit: vi.fn() },
    },
  },
}));

vi.mock('@process/channels/agent/ChannelEventBus', () => ({
  channelEventBus: { emitAgentMessage: vi.fn() },
}));

vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn(async () => ({ updateConversation: vi.fn() })),
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {
    get: (key: string) => mockProcessConfigGet(key),
    set: vi.fn(async () => {}),
  },
}));

vi.mock('@process/utils/message', () => ({
  addMessage: vi.fn(),
  addOrUpdateMessage: vi.fn(),
  nextTickToLocalFinish: vi.fn(),
}));

vi.mock('@process/utils/previewUtils', () => ({
  handlePreviewOpenEvent: vi.fn(),
}));

vi.mock('@process/services/cron/CronBusyGuard', () => ({
  cronBusyGuard: { setProcessing: vi.fn() },
}));

vi.mock('@process/utils/mainLogger', () => ({
  mainLog: vi.fn(),
  mainWarn: vi.fn(),
  mainError: vi.fn(),
}));

vi.mock('@process/extensions', () => ({
  ExtensionRegistry: { getInstance: () => ({ getAcpAdapters: mockGetAcpAdapters }) },
}));

vi.mock('@/common/utils', () => ({
  parseError: vi.fn((e: unknown) => String(e)),
  uuid: vi.fn(() => 'mock-uuid'),
}));

vi.mock('@process/task/MessageMiddleware', () => ({
  extractTextFromMessage: vi.fn(),
  processCronInMessage: vi.fn(),
}));

vi.mock('@process/task/ThinkTagDetector', () => ({
  stripThinkTags: vi.fn((s: string) => s),
}));

vi.mock('@process/task/CronCommandDetector', () => ({
  hasCronCommands: vi.fn(() => false),
}));

vi.mock('@process/task/agentUtils', () => ({
  prepareFirstMessageWithSkillsIndex: vi.fn(async (content: string) => ({ content, loadedSkills: [] })),
  buildSystemInstructions: vi.fn(async () => undefined),
}));

vi.mock('@process/agent/acp', () => ({
  AcpAgent: vi.fn(),
}));

vi.mock('@process/acp/compat', () => {
  const MockAcpAgentV2 = vi.fn(function (this: Record<string, unknown>, config: Record<string, unknown>) {
    capturedAgentConfigs.push(config);
    this.start = vi.fn(async () => {});
    this.stop = vi.fn();
    this.kill = vi.fn();
    this.on = vi.fn().mockReturnThis();
    this.getModelInfo = vi.fn(() => null);
    this.getSessionState = vi.fn(() => null);
  });

  return { AcpAgentV2: MockAcpAgentV2 };
});

import AcpAgentManager from '../../src/process/task/AcpAgentManager';

function createManager(overrides: Record<string, unknown> = {}): InstanceType<typeof AcpAgentManager> {
  const data = {
    conversation_id: 'test-conv',
    backend: 'custom',
    workspace: '/tmp/test-workspace',
    customAgentId: 'custom-agent-1',
    cliPath: 'fallback-cli',
    ...overrides,
  };

  return new AcpAgentManager(data);
}

describe('AcpAgentManager custom agent launch config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedAgentConfigs.length = 0;
    mockProcessConfigGet.mockReset();
    mockProcessConfigGet.mockResolvedValue(null);
    mockGetAcpAdapters.mockReset();
    mockGetAcpAdapters.mockReturnValue([]);
  });

  it('loads CLI args and env from acp.customAgents for user-defined custom agents', async () => {
    mockProcessConfigGet.mockImplementation(async (key: string) => {
      if (key === 'acp.customAgents') {
        return [
          {
            id: 'custom-agent-1',
            defaultCliPath: 'ssh',
            acpArgs: ['-T', 'user@example.com', 'npx', '-y', '@agentclientprotocol/claude-agent-acp@0.29.2'],
            env: { SSH_AUTH_SOCK: '/tmp/agent.sock' },
          },
        ];
      }

      if (key === 'assistants') {
        return [];
      }

      return null;
    });

    const manager = createManager();
    await manager.initAgent();

    expect(mockProcessConfigGet).toHaveBeenCalledWith('acp.customAgents');
    expect(capturedAgentConfigs).toHaveLength(1);
    expect(capturedAgentConfigs[0]).toMatchObject({
      cliPath: 'ssh',
      customArgs: ['-T', 'user@example.com', 'npx', '-y', '@agentclientprotocol/claude-agent-acp@0.29.2'],
      customEnv: { SSH_AUTH_SOCK: '/tmp/agent.sock' },
    });
  });

  it('falls back to the conversation cliPath when no saved custom agent config matches', async () => {
    mockProcessConfigGet.mockImplementation(async (key: string) => {
      if (key === 'acp.customAgents' || key === 'assistants') {
        return [];
      }

      return null;
    });

    const manager = createManager({ customAgentId: 'missing-agent', cliPath: 'ssh' });
    await manager.initAgent();

    expect(capturedAgentConfigs).toHaveLength(1);
    expect(capturedAgentConfigs[0]).toMatchObject({
      cliPath: 'ssh',
    });
    expect(capturedAgentConfigs[0].customArgs).toBeUndefined();
    expect(capturedAgentConfigs[0].customEnv).toBeUndefined();
  });

  it('falls back to legacy assistants config when the custom agent is not in acp.customAgents', async () => {
    mockProcessConfigGet.mockImplementation(async (key: string) => {
      if (key === 'acp.customAgents') {
        return [];
      }

      if (key === 'assistants') {
        return [
          {
            id: 'custom-agent-1',
            defaultCliPath: 'legacy-cli',
            acpArgs: ['--legacy'],
            env: { LEGACY_TOKEN: 'legacy-secret' },
          },
        ];
      }

      return null;
    });

    const manager = createManager();
    await manager.initAgent();

    expect(capturedAgentConfigs).toHaveLength(1);
    expect(capturedAgentConfigs[0]).toMatchObject({
      cliPath: 'legacy-cli',
      customArgs: ['--legacy'],
      customEnv: { LEGACY_TOKEN: 'legacy-secret' },
    });
  });

  it('loads launch config from extension adapters for ext custom agent ids', async () => {
    mockProcessConfigGet.mockImplementation(async (key: string) => {
      if (key === 'acp.customAgents' || key === 'assistants') {
        return [];
      }

      return null;
    });
    mockGetAcpAdapters.mockReturnValue([
      {
        id: 'adapter-1',
        _extensionName: 'demo-extension',
        defaultCliPath: '  bunx @demo/agent  ',
        acpArgs: ['--stdio', 123, '--verbose'],
        env: { DEMO_TOKEN: 'demo-secret' },
      },
    ]);

    const manager = createManager({
      customAgentId: 'ext:demo-extension:adapter-1',
      cliPath: 'fallback-cli',
    });
    await manager.initAgent();

    expect(capturedAgentConfigs).toHaveLength(1);
    expect(capturedAgentConfigs[0]).toMatchObject({
      cliPath: 'bunx @demo/agent',
      customArgs: ['--stdio', '--verbose'],
      customEnv: { DEMO_TOKEN: 'demo-secret' },
    });
  });
});
