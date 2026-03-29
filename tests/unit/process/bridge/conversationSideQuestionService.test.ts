import type { AcpPermissionRequest, AcpSessionUpdate } from '@/common/types/acpTypes';
import type { TChatConversation } from '@/common/config/storage';
import { ConversationSideQuestionService } from '@/process/bridge/services/ConversationSideQuestionService';
import type { IConversationService } from '@/process/services/IConversationService';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type DisconnectInfo = {
  code: number | null;
  signal: NodeJS.Signals | null;
};

type MockAcpConnectionInstance = {
  onEndTurn: () => void;
  onPermissionRequest: (data: AcpPermissionRequest) => Promise<{ optionId: string }>;
  onSessionUpdate: (data: AcpSessionUpdate) => void;
};

const {
  mockAcpConnect,
  mockAcpCancelPrompt,
  mockAcpDisconnect,
  mockAcpNewSession,
  mockAcpSendPrompt,
  mockAcpSetPromptTimeout,
  mockProcessConfigGet,
} = vi.hoisted(() => ({
  mockAcpConnect: vi.fn(),
  mockAcpCancelPrompt: vi.fn(),
  mockAcpDisconnect: vi.fn(),
  mockAcpNewSession: vi.fn(),
  mockAcpSendPrompt: vi.fn(),
  mockAcpSetPromptTimeout: vi.fn(),
  mockProcessConfigGet: vi.fn(),
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {
    get: (...args: unknown[]) => mockProcessConfigGet(...args),
  },
}));

vi.mock('@process/agent/acp/AcpConnection', () => ({
  AcpConnection: class {
    onSessionUpdate: (data: AcpSessionUpdate) => void = () => {};
    onPermissionRequest: (data: AcpPermissionRequest) => Promise<{ optionId: string }> = async () => ({
      optionId: 'reject_once',
    });
    onEndTurn: () => void = () => {};
    onDisconnect: (error: DisconnectInfo) => void = () => {};

    connect = (...args: unknown[]) => mockAcpConnect(...args);
    newSession = (...args: unknown[]) => mockAcpNewSession(...args);
    sendPrompt = (...args: unknown[]) => mockAcpSendPrompt(this, ...args);
    disconnect = (...args: unknown[]) => mockAcpDisconnect(...args);
    setPromptTimeout = (...args: unknown[]) => mockAcpSetPromptTimeout(...args);
    cancelPrompt = (...args: unknown[]) => mockAcpCancelPrompt(...args);
  },
}));

function makeConversation(overrides: Partial<TChatConversation> = {}): TChatConversation {
  return {
    id: 'conv-1',
    name: 'Conversation',
    type: 'gemini',
    extra: { workspace: '/tmp/ws' },
    model: {
      id: 'provider-1',
      platform: 'gemini',
      name: 'Gemini',
      baseUrl: 'https://example.com',
      apiKey: 'secret',
      useModel: 'gemini-2.5-flash',
    },
    createTime: Date.now(),
    modifyTime: Date.now(),
    ...overrides,
  } as TChatConversation;
}

function makeService(conversation: TChatConversation | undefined): IConversationService {
  return {
    createConversation: vi.fn(),
    deleteConversation: vi.fn(),
    updateConversation: vi.fn(),
    getConversation: vi.fn(async () => conversation),
    createWithMigration: vi.fn(),
    listAllConversations: vi.fn(async () => []),
  };
}

function makeClaudeConversation(): TChatConversation {
  return makeConversation({
    type: 'acp',
    extra: {
      acpSessionId: 'parent-session-1',
      backend: 'claude',
      workspace: '/tmp/ws',
    },
  });
}

function createTextChunkUpdate(text: string): AcpSessionUpdate {
  return {
    sessionId: 'fork-1',
    update: {
      sessionUpdate: 'agent_message_chunk',
      content: {
        type: 'text',
        text,
      },
    },
  };
}

function createPermissionRequest(): AcpPermissionRequest {
  return {
    options: [{ kind: 'reject_once', name: 'Reject', optionId: 'reject_once' }],
    sessionId: 'fork-1',
    toolCall: {
      title: 'Bash',
      toolCallId: 'tool-1',
    },
  };
}

function createToolCallUpdate(): AcpSessionUpdate {
  return {
    sessionId: 'fork-1',
    update: {
      kind: 'execute',
      sessionUpdate: 'tool_call',
      status: 'pending',
      title: 'Bash',
      toolCallId: 'tool-1',
    },
  };
}

describe('ConversationSideQuestionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAcpConnect.mockResolvedValue(undefined);
    mockAcpCancelPrompt.mockReset();
    mockAcpNewSession.mockResolvedValue({ sessionId: 'fork-1' });
    mockAcpSendPrompt.mockImplementation(async (connection: MockAcpConnectionInstance) => {
      connection.onSessionUpdate(createTextChunkUpdate('The file was `config/aion.json`.'));
      connection.onEndTurn();
      return {};
    });
    mockAcpDisconnect.mockResolvedValue(undefined);
    mockAcpSetPromptTimeout.mockReturnValue(undefined);
    mockProcessConfigGet.mockImplementation(async (key: string) => {
      if (key === 'acp.config') {
        return {
          claude: {
            cliPath: 'claude',
          },
        };
      }
      return undefined;
    });
  });

  it('returns invalid for an empty question', async () => {
    const service = new ConversationSideQuestionService(makeService(undefined));

    await expect(service.ask('conv-1', '   ')).resolves.toEqual({
      status: 'invalid',
      reason: 'emptyQuestion',
    });
  });

  it('returns unsupported when the conversation is not claude ACP', async () => {
    const conversation = {
      id: 'conv-1',
      type: 'acp',
      name: 'ACP Conversation',
      extra: { backend: 'opencode' },
      createTime: Date.now(),
      modifyTime: Date.now(),
    } as TChatConversation;
    const service = new ConversationSideQuestionService(makeService(conversation));

    await expect(service.ask('conv-1', 'what model are we using?')).resolves.toEqual({
      status: 'unsupported',
    });
  });

  it('returns unsupported for non-claude ACP conversations even with session metadata', async () => {
    const conversation = makeConversation({
      type: 'acp',
      extra: {
        acpSessionId: 'parent-session-1',
        backend: 'opencode',
        workspace: '/tmp/ws',
      },
    });
    const service = new ConversationSideQuestionService(makeService(conversation));

    await expect(service.ask('conv-1', 'what file did we use?')).resolves.toEqual({
      status: 'unsupported',
    });
    expect(mockAcpConnect).not.toHaveBeenCalled();
  });

  it('uses an ACP forked session when claude ACP session metadata is available', async () => {
    const service = new ConversationSideQuestionService(makeService(makeClaudeConversation()));

    await expect(service.ask('conv-1', 'what file did we use?')).resolves.toEqual({
      status: 'ok',
      answer: 'The file was `config/aion.json`.',
    });

    expect(mockAcpConnect).toHaveBeenCalledWith('claude', 'claude', '/tmp/ws', undefined, undefined);
    expect(mockAcpNewSession).toHaveBeenCalledWith('/tmp/ws', {
      forkSession: true,
      mcpServers: [],
      resumeSessionId: 'parent-session-1',
    });
  });

  it('returns noAnswer when the claude fork ends without text', async () => {
    const service = new ConversationSideQuestionService(makeService(makeClaudeConversation()));

    mockAcpSendPrompt.mockImplementationOnce(async (connection: MockAcpConnectionInstance) => {
      connection.onEndTurn();
      return {};
    });

    await expect(service.ask('conv-1', 'what file did we use?')).resolves.toEqual({
      status: 'noAnswer',
    });
  });

  it('returns unsupported when the ACP backend rejects forked sessions', async () => {
    const service = new ConversationSideQuestionService(makeService(makeClaudeConversation()));
    mockAcpNewSession.mockRejectedValueOnce(new Error('fork not supported'));

    await expect(service.ask('conv-1', 'what file did we use?')).resolves.toEqual({
      status: 'unsupported',
    });
  });

  it('rejects when the ACP side question times out', async () => {
    vi.useFakeTimers();
    const service = new ConversationSideQuestionService(makeService(makeClaudeConversation()));
    mockAcpSendPrompt.mockImplementationOnce(() => new Promise(() => {}));

    const promise = service.ask('conv-1', 'what file did we use?');
    const expectation = expect(promise).rejects.toThrow('ACP /btw timed out.');
    await vi.advanceTimersByTimeAsync(30_000);

    await expectation;
    expect(mockAcpDisconnect).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('returns toolsRequired when permission request is triggered without prior text', async () => {
    const service = new ConversationSideQuestionService(makeService(makeClaudeConversation()));

    mockAcpSendPrompt.mockImplementationOnce(async (connection: MockAcpConnectionInstance) => {
      await connection.onPermissionRequest(createPermissionRequest());
      return {};
    });

    await expect(service.ask('conv-1', 'what file did we use?')).resolves.toEqual({
      status: 'toolsRequired',
    });
    expect(mockAcpCancelPrompt).toHaveBeenCalled();
  });

  it('returns toolsRequired when tool call is attempted without prior text', async () => {
    const service = new ConversationSideQuestionService(makeService(makeClaudeConversation()));

    mockAcpSendPrompt.mockImplementationOnce(async (connection: MockAcpConnectionInstance) => {
      connection.onSessionUpdate(createToolCallUpdate());
      return {};
    });

    await expect(service.ask('conv-1', 'what file did we use?')).resolves.toEqual({
      status: 'toolsRequired',
    });
    expect(mockAcpCancelPrompt).toHaveBeenCalled();
  });

  it('returns ok with partial text when tool call is attempted after text', async () => {
    const service = new ConversationSideQuestionService(makeService(makeClaudeConversation()));

    mockAcpSendPrompt.mockImplementationOnce(async (connection: MockAcpConnectionInstance) => {
      connection.onSessionUpdate(createTextChunkUpdate('Here is what I found'));
      connection.onSessionUpdate(createToolCallUpdate());
      return {};
    });

    await expect(service.ask('conv-1', 'what file did we use?')).resolves.toEqual({
      status: 'ok',
      answer: 'Here is what I found',
    });
    expect(mockAcpCancelPrompt).toHaveBeenCalled();
  });
});
