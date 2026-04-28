import { describe, it, expect, vi, beforeEach } from 'vitest';

// Track calls to any would-be frontend skills-index injector. After the
// skill-backend migration (2026-04-27) the frontend helper was deleted;
// this mock is a canary — we assert it is never invoked.
const { mockPrepareFirstMessage, mockAgentSendMessage } = vi.hoisted(() => ({
  mockPrepareFirstMessage: vi.fn(),
  mockAgentSendMessage: vi.fn(async () => ({ success: true })),
}));

// --- Module mocks ---

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
  getDatabase: vi.fn(async () => ({
    updateConversation: vi.fn(),
    getConversation: vi.fn(() => ({ success: true, data: { extra: {}, source: 'aionui' } })),
  })),
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {
    get: vi.fn(async (key: string) => {
      if (key === 'acp.cachedInitializeResult') {
        // Provide cached init results so shouldInjectTeamGuideMcp returns true for claude/gemini
        return {
          claude: {
            protocolVersion: 1,
            capabilities: {
              loadSession: false,
              promptCapabilities: { image: false, audio: false, embeddedContext: false },
              mcpCapabilities: { stdio: true, http: false, sse: false },
              sessionCapabilities: { fork: null, resume: null, list: null, close: null },
              _meta: {},
            },
            agentInfo: null,
            authMethods: [],
          },
        };
      }
      return null;
    }),
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
  ExtensionRegistry: { getInstance: () => ({ getAcpAdapters: () => [] }) },
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

// Mock hasNativeSkillSupport to use real logic for known backends
vi.mock('@process/utils/initAgent', () => ({
  hasNativeSkillSupport: vi.fn((backend: string | undefined) => {
    const supported = ['gemini', 'claude', 'codebuddy', 'codex', 'qwen', 'goose', 'droid', 'kimi', 'vibe', 'cursor'];
    return !!backend && supported.includes(backend);
  }),
  setupAssistantWorkspace: vi.fn(),
}));

vi.mock('@process/task/agentUtils', () => ({
  // Canary export — if AcpAgentManager ever reaches back into a frontend
  // skills-index injector, the tests below will see mockPrepareFirstMessage
  // invoked and fail.
  prepareFirstMessageWithSkillsIndex: mockPrepareFirstMessage,
  buildSystemInstructions: vi.fn(async () => undefined),
}));

// Mock AcpAgent class
vi.mock('@process/agent/acp', () => ({
  AcpAgent: vi.fn().mockImplementation(() => ({
    sendMessage: mockAgentSendMessage,
    getModelInfo: vi.fn(() => null),
    getSessionState: vi.fn(() => null),
    stop: vi.fn(),
    kill: vi.fn(),
    on: vi.fn().mockReturnThis(),
  })),
}));

import AcpAgentManager from '@process/task/AcpAgentManager';

function createManager(
  overrides: {
    backend?: string;
    customWorkspace?: boolean;
    presetContext?: string;
    enabled_skills?: string[];
  } = {}
) {
  const data = {
    conversation_id: 'test-conv',
    backend: overrides.backend ?? 'claude',
    workspace: '/tmp/test-workspace',
    custom_workspace: overrides.custom_workspace,
    preset_context: overrides.preset_context,
    enabled_skills: overrides.enabled_skills,
  };
  // @ts-expect-error - backend type narrowing
  const manager = new AcpAgentManager(data);
  return manager;
}

async function sendFirstMessage(manager: InstanceType<typeof AcpAgentManager>, content = 'Hello') {
  // Stub initAgent to set up a mock agent without actual process bootstrapping
  const mockAgent = {
    sendMessage: mockAgentSendMessage,
    getModelInfo: vi.fn(() => null),
    on: vi.fn().mockReturnThis(),
  };
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- accessing private fields for test setup
  (manager as unknown as Record<string, unknown>).agent = mockAgent;
  (manager as unknown as Record<string, unknown>).bootstrap = Promise.resolve(mockAgent);

  // Override initAgent to just return the already-bootstrapped agent
  vi.spyOn(manager, 'initAgent').mockResolvedValue(mockAgent as never);

  return manager.sendMessage({ content, msg_id: 'msg-1' });
}

// After the skill-backend migration (2026-04-27), the ACP first-message prefix
// for preset_context + skills is built on the Rust side (see
// aionui-ai-agent/src/acp_agent.rs::session_new_and_prompt + first_message_injector).
// The frontend now only injects the team-guide block. The tests below cover the
// surviving frontend responsibility: team-guide prepend for the first message.
describe('AcpAgentManager — first-message team-guide injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('never invokes the frontend skills-index injector anymore', async () => {
    const manager = createManager({
      backend: 'claude',
      custom_workspace: false,
      preset_context: 'You are helpful.',
      enabled_skills: ['pptx'],
    });

    await sendFirstMessage(manager);

    // preset_context + skills are now backend-injected; frontend must not call
    // prepareFirstMessageWithSkillsIndex at all.
    expect(mockPrepareFirstMessage).not.toHaveBeenCalled();
  });

  it('does not invoke frontend skills-index injector even with custom workspace', async () => {
    const manager = createManager({
      backend: 'claude',
      custom_workspace: true,
      preset_context: 'You are helpful.',
      enabled_skills: ['pptx'],
    });

    await sendFirstMessage(manager);

    expect(mockPrepareFirstMessage).not.toHaveBeenCalled();
  });

  it('does not invoke frontend skills-index injector for unsupported backend', async () => {
    const manager = createManager({
      backend: 'auggie',
      custom_workspace: false,
      preset_context: 'Some rules',
      enabled_skills: ['pdf'],
    });

    await sendFirstMessage(manager);

    expect(mockPrepareFirstMessage).not.toHaveBeenCalled();
  });

  it('injects team guide prompt for whitelisted backend on first message', async () => {
    const manager = createManager({
      backend: 'claude',
      custom_workspace: false,
    });

    await sendFirstMessage(manager, 'Test message');

    const sentContent = mockAgentSendMessage.mock.calls[0][0].content as string;
    // claude is whitelisted for team guide → content is wrapped with [Team Guide]
    expect(sentContent).toContain('[Team Guide]');
    expect(sentContent).toContain('[/Team Guide]');
    expect(sentContent).toContain('Team Mode');
    expect(sentContent).toContain('Test message');
  });
});
