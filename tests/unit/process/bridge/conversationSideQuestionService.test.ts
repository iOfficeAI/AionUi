import type {
  SessionNotification,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from '@agentclientprotocol/sdk';
import type { TChatConversation } from '@/common/config/storage';
import { ConversationSideQuestionService } from '@/process/bridge/services/ConversationSideQuestionService';
import type { IConversationService } from '@/process/services/IConversationService';
import type { ProtocolHandlers } from '@/process/acp/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockStart,
  mockForkSession,
  mockPrompt,
  mockCancel,
  mockClose,
  mockOnDisconnect,
  mockProcessConfigGet,
  handlersRef,
} = vi.hoisted(() => ({
  mockStart: vi.fn(),
  mockForkSession: vi.fn(),
  mockPrompt: vi.fn(),
  mockCancel: vi.fn(),
  mockClose: vi.fn(),
  mockOnDisconnect: vi.fn(),
  mockProcessConfigGet: vi.fn(),
  handlersRef: { current: null as ProtocolHandlers | null },
}));

vi.mock('@process/acp/compat/LegacyConnectorFactory', () => ({
  LegacyConnectorFactory: class {
    create(_config: unknown, handlers: ProtocolHandlers) {
      handlersRef.current = handlers;
      return {
        start: mockStart,
        forkSession: mockForkSession,
        prompt: mockPrompt,
        cancel: mockCancel,
        close: mockClose,
        onDisconnect: mockOnDisconnect,
      };
    }
  },
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {
    get: (...args: unknown[]) => mockProcessConfigGet(...args),
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

function createTextChunkNotification(text: string): SessionNotification {
  return {
    sessionId: 'fork-1',
    update: {
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text },
    },
  } as SessionNotification;
}

function createToolCallNotification(): SessionNotification {
  return {
    sessionId: 'fork-1',
    update: {
      sessionUpdate: 'tool_call',
      kind: 'execute',
      status: 'pending',
      title: 'Bash',
      toolCallId: 'tool-1',
    },
  } as SessionNotification;
}

function createPermissionRequest(): RequestPermissionRequest {
  return {
    sessionId: 'fork-1',
    options: [{ kind: 'reject_once', name: 'Reject', optionId: 'reject_once' }],
    toolCall: {
      title: 'Bash',
      toolCallId: 'tool-1',
    },
  } as RequestPermissionRequest;
}

describe('ConversationSideQuestionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlersRef.current = null;
    mockStart.mockResolvedValue({});
    mockForkSession.mockResolvedValue({ sessionId: 'fork-1' });
    mockPrompt.mockImplementation(async () => {
      handlersRef.current!.onSessionUpdate(createTextChunkNotification('The file was `config/aion.json`.'));
      // prompt resolves = turn finished
      return {};
    });
    mockCancel.mockResolvedValue(undefined);
    mockClose.mockResolvedValue(undefined);
    mockOnDisconnect.mockImplementation(() => {});
    mockProcessConfigGet.mockImplementation(async (key: string) => {
      if (key === 'acp.config') {
        return { claude: { cliPath: 'claude' } };
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
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('uses an ACP forked session when claude ACP session metadata is available', async () => {
    const service = new ConversationSideQuestionService(makeService(makeClaudeConversation()));

    await expect(service.ask('conv-1', 'what file did we use?')).resolves.toEqual({
      status: 'ok',
      answer: 'The file was `config/aion.json`.',
    });

    expect(mockStart).toHaveBeenCalled();
    expect(mockForkSession).toHaveBeenCalledWith({
      sessionId: 'parent-session-1',
      cwd: '/tmp/ws',
      mcpServers: [],
    });
  });

  it('returns noAnswer when the claude fork ends without text', async () => {
    const service = new ConversationSideQuestionService(makeService(makeClaudeConversation()));

    mockPrompt.mockImplementationOnce(async () => {
      // prompt resolves without any text chunks = no answer
      return {};
    });

    await expect(service.ask('conv-1', 'what file did we use?')).resolves.toEqual({
      status: 'noAnswer',
    });
  });

  it('returns unsupported when the ACP backend rejects forked sessions', async () => {
    const service = new ConversationSideQuestionService(makeService(makeClaudeConversation()));
    mockForkSession.mockRejectedValueOnce(new Error('fork not supported'));

    await expect(service.ask('conv-1', 'what file did we use?')).resolves.toEqual({
      status: 'unsupported',
    });
  });

  it('rejects when the ACP side question times out', async () => {
    vi.useFakeTimers();
    const service = new ConversationSideQuestionService(makeService(makeClaudeConversation()));
    mockPrompt.mockImplementationOnce(() => new Promise(() => {}));

    const promise = service.ask('conv-1', 'what file did we use?');
    const expectation = expect(promise).rejects.toThrow('ACP /btw timed out.');
    await vi.advanceTimersByTimeAsync(30_000);

    await expectation;
    expect(mockClose).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('returns toolsRequired when permission request is triggered without prior text', async () => {
    const service = new ConversationSideQuestionService(makeService(makeClaudeConversation()));

    mockPrompt.mockImplementationOnce(async () => {
      const result: RequestPermissionResponse =
        await handlersRef.current!.onRequestPermission(createPermissionRequest());
      expect(result.outcome).toEqual({ outcome: 'selected', optionId: 'reject_once' });
      return {};
    });

    await expect(service.ask('conv-1', 'what file did we use?')).resolves.toEqual({
      status: 'toolsRequired',
    });
    expect(mockCancel).toHaveBeenCalled();
  });

  it('returns toolsRequired when tool call is attempted without prior text', async () => {
    const service = new ConversationSideQuestionService(makeService(makeClaudeConversation()));

    mockPrompt.mockImplementationOnce(async () => {
      handlersRef.current!.onSessionUpdate(createToolCallNotification());
      return {};
    });

    await expect(service.ask('conv-1', 'what file did we use?')).resolves.toEqual({
      status: 'toolsRequired',
    });
    expect(mockCancel).toHaveBeenCalled();
  });

  it('returns ok with partial text when tool call is attempted after text', async () => {
    const service = new ConversationSideQuestionService(makeService(makeClaudeConversation()));

    mockPrompt.mockImplementationOnce(async () => {
      handlersRef.current!.onSessionUpdate(createTextChunkNotification('Here is what I found'));
      handlersRef.current!.onSessionUpdate(createToolCallNotification());
      return {};
    });

    await expect(service.ask('conv-1', 'what file did we use?')).resolves.toEqual({
      status: 'ok',
      answer: 'Here is what I found',
    });
    expect(mockCancel).toHaveBeenCalled();
  });
});
