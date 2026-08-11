import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type QueueItem = {
  commandId: string;
  input: string;
  files: string[];
  createdAt: number;
};

const queueSpies = {
  enqueue: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  clear: vi.fn(),
  reorder: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  lockInteraction: vi.fn(),
  unlockInteraction: vi.fn(),
  resetActiveExecution: vi.fn(),
};

const mockShouldEnqueueConversationCommand = vi.fn(() => false);
const mockUseCommandQueueEnabled = vi.fn(() => true);
let mockConversationStatus: 'idle' | 'running' = 'idle';
let mockAcpRunning = false;
let mockAcpAiProcessing = false;
let mockAcpHasThinkingMessage = false;
let mockAcpHasStreamingContent = false;
let mockAcpActivity: { phase: string; title?: string; status?: string } | null = null;
let mockGeminiRunning = false;
let mockAionrsRunning = false;
const mockUseConversationCommandQueue = vi.fn(() => ({
  items: [] as QueueItem[],
  isPaused: false,
  isInteractionLocked: false,
  hasPendingCommands: false,
  ...queueSpies,
}));

const mockConversationGetInvoke = vi.fn();
const mockConversationStopInvoke = vi.fn();
const mockConversationSendInvoke = vi.fn();
const mockAcpSendInvoke = vi.fn();
const mockGeminiSendInvoke = vi.fn();
const mockOpenClawSendInvoke = vi.fn();
const mockTeamSendInvoke = vi.fn();
const mockTeamSendToAgentInvoke = vi.fn();
const mockOpenClawRuntimeInvoke = vi.fn();
const mockDatabaseMessagesInvoke = vi.fn();

const mockAddOrUpdateMessage = vi.fn();
const mockRemoveMessageByMsgId = vi.fn();
const mockCheckAndUpdateTitle = vi.fn();
const mockEmitterEmit = vi.fn();
const mockArcoError = vi.fn();
const mockArcoWarning = vi.fn();
const mockArcoSuccess = vi.fn();
const mockAssertBridgeSuccess = vi.fn();
const mockSetSendBoxHandler = vi.fn();
const mockClearFiles = vi.fn();
const mockAgentModeSelector = vi.fn(({ backend, initialMode }: { backend?: string; initialMode?: string }) =>
  React.createElement('div', {
    'data-testid': `agent-mode-selector-${backend || 'unknown'}`,
    'data-initial-mode': initialMode || '',
  })
);
const mockAcpModelSelector = vi.fn(({ backend }: { backend?: string }) =>
  React.createElement('div', { 'data-testid': `acp-model-selector-${backend || 'unknown'}` })
);
const mockAcpConfigSelector = vi.fn(({ backend }: { backend?: string }) =>
  React.createElement('div', { 'data-testid': `acp-config-selector-${backend || 'unknown'}` })
);
const mockFileAttachButton = vi.fn(
  (_props: { openFileSelector: () => void; openDirectorySelector?: () => void; onLocalFilesAdded?: () => void }) =>
    React.createElement('div')
);
const mockBuildDisplayMessage = vi.fn((input: string, files: string[], workspacePath: string) =>
  files.length > 0 ? `${input}|${files.join(',')}|${workspacePath}` : input
);

const mockDraftData: {
  atPath: Array<string | { path: string; isFile?: boolean; name?: string }>;
  content: string;
  uploadFile: string[];
} = {
  atPath: [],
  content: '',
  uploadFile: [],
};

let uuidCounter = 0;

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      get: { invoke: (...args: unknown[]) => mockConversationGetInvoke(...args) },
      stop: { invoke: (...args: unknown[]) => mockConversationStopInvoke(...args) },
      sendMessage: { invoke: (...args: unknown[]) => mockConversationSendInvoke(...args) },
      responseStream: { on: vi.fn(() => vi.fn()) },
    },
    acpConversation: {
      sendMessage: { invoke: (...args: unknown[]) => mockAcpSendInvoke(...args) },
    },
    geminiConversation: {
      sendMessage: { invoke: (...args: unknown[]) => mockGeminiSendInvoke(...args) },
    },
    openclawConversation: {
      sendMessage: { invoke: (...args: unknown[]) => mockOpenClawSendInvoke(...args) },
      getRuntime: { invoke: (...args: unknown[]) => mockOpenClawRuntimeInvoke(...args) },
      responseStream: { on: vi.fn(() => vi.fn()) },
    },
    team: {
      sendMessage: { invoke: (...args: unknown[]) => mockTeamSendInvoke(...args) },
      sendMessageToAgent: { invoke: (...args: unknown[]) => mockTeamSendToAgentInvoke(...args) },
    },
    database: {
      getConversationMessages: { invoke: (...args: unknown[]) => mockDatabaseMessagesInvoke(...args) },
    },
  },
}));

vi.mock('@/common/chat/chatLib', () => ({
  transformMessage: vi.fn((message: unknown) => message),
}));

vi.mock('@/common/utils', () => ({
  uuid: vi.fn(() => `uuid-${++uuidCounter}`),
}));

vi.mock('@/renderer/components/chat/sendbox', () => ({
  __esModule: true,
  default: ({
    disabled,
    loading,
    onSend,
    onStop,
    tools,
  }: {
    disabled?: boolean;
    loading?: boolean;
    onSend: (message: string) => Promise<void> | void;
    onStop?: () => Promise<void> | void;
    tools?: React.ReactNode;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'sendbox' },
      React.createElement('div', { 'data-testid': 'sendbox-loading' }, String(Boolean(loading))),
      React.createElement('div', { 'data-testid': 'sendbox-tools' }, tools),
      React.createElement(
        'button',
        {
          type: 'button',
          disabled,
          onClick: () => {
            void Promise.resolve(onSend('queued command')).catch(() => {});
          },
        },
        'trigger-send'
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: () => {
            void Promise.resolve(onStop?.()).catch(() => {});
          },
        },
        'trigger-stop'
      )
    ),
}));

vi.mock('@/renderer/components/chat/CommandQueuePanel', () => ({
  __esModule: true,
  default: ({ items }: { items: QueueItem[] }) =>
    React.createElement('div', { 'data-testid': 'queue-panel' }, String(items.length)),
}));

vi.mock('@/renderer/components/chat/ThoughtDisplay', () => ({
  __esModule: true,
  default: ({ running, statusText }: { running?: boolean; statusText?: string }) =>
    React.createElement('div', {
      'data-testid': 'thought-display',
      'data-running': String(Boolean(running)),
      'data-status-text': statusText || '',
    }),
}));

vi.mock('@/renderer/components/media/FilePreview', () => ({
  __esModule: true,
  default: () => React.createElement('div'),
}));

vi.mock('@/renderer/components/media/HorizontalFileList', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => React.createElement('div', {}, children),
}));

vi.mock('@/renderer/components/media/FileAttachButton', () => ({
  __esModule: true,
  default: (props: {
    openFileSelector: () => void;
    openDirectorySelector?: () => void;
    onLocalFilesAdded?: () => void;
  }) => mockFileAttachButton(props),
}));

vi.mock('@/renderer/components/agent/AgentModeSelector', () => ({
  __esModule: true,
  default: (props: { backend?: string; initialMode?: string }) => mockAgentModeSelector(props),
}));

vi.mock('@/renderer/components/agent/AcpConfigSelector', () => ({
  __esModule: true,
  default: (props: { backend?: string }) => mockAcpConfigSelector(props),
}));

vi.mock('@/renderer/components/agent/AcpModelSelector', () => ({
  __esModule: true,
  default: (props: { backend?: string }) => mockAcpModelSelector(props),
}));

vi.mock('@/renderer/components/agent/ContextUsageIndicator', () => ({
  __esModule: true,
  default: () => React.createElement('div'),
}));

vi.mock('@/renderer/components/agent/AgentSetupCard', () => ({
  __esModule: true,
  default: () => React.createElement('div'),
}));

vi.mock('@/renderer/hooks/chat/useSendBoxDraft', () => ({
  getSendBoxDraftHook: vi.fn(() =>
    vi.fn(() => ({
      data: mockDraftData,
      mutate: vi.fn(),
    }))
  ),
}));

vi.mock('@/renderer/hooks/chat/useSendBoxFiles', () => ({
  createSetUploadFile: vi.fn(() => vi.fn()),
  useSendBoxFiles: vi.fn(() => ({
    handleFilesAdded: vi.fn(),
    clearFiles: mockClearFiles,
  })),
}));

vi.mock('@/renderer/hooks/chat/useAutoTitle', () => ({
  useAutoTitle: () => ({
    checkAndUpdateTitle: mockCheckAndUpdateTitle,
  }),
}));

vi.mock('@/renderer/hooks/chat/useSlashCommands', () => ({
  useSlashCommands: vi.fn(() => []),
}));

vi.mock('@/renderer/hooks/file/useOpenFileSelector', () => ({
  useOpenFileSelector: vi.fn(() => ({
    openFileSelector: vi.fn(),
    openDirectorySelector: vi.fn(),
    onSlashBuiltinCommand: vi.fn(),
  })),
}));

vi.mock('@/renderer/hooks/ui/useLatestRef', async () => {
  const ReactModule = await vi.importActual<typeof import('react')>('react');
  return {
    useLatestRef: <T,>(value: T) => {
      const ref = ReactModule.useRef(value);
      ref.current = value;
      return ref;
    },
  };
});

vi.mock('@/renderer/hooks/agent/useAgentReadinessCheck', () => ({
  useAgentReadinessCheck: vi.fn(() => ({
    isChecking: false,
    error: null,
    availableAgents: [],
    bestAgent: null,
    progress: 0,
    currentAgent: null,
    performFullCheck: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn(),
  })),
}));

vi.mock('@/renderer/hooks/system/useCommandQueueEnabled', () => ({
  useCommandQueueEnabled: () => mockUseCommandQueueEnabled(),
}));

vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({
  useAddOrUpdateMessage: () => mockAddOrUpdateMessage,
  useRemoveMessageByMsgId: () => mockRemoveMessageByMsgId,
}));

vi.mock('@/renderer/pages/conversation/platforms/useConversationCommandQueue', () => ({
  shouldEnqueueConversationCommand: (...args: unknown[]) => mockShouldEnqueueConversationCommand(...args),
  useConversationCommandQueue: (...args: unknown[]) => mockUseConversationCommandQueue(...args),
}));

vi.mock('@/renderer/pages/conversation/platforms/assertBridgeSuccess', () => ({
  assertBridgeSuccess: (...args: unknown[]) => mockAssertBridgeSuccess(...args),
}));

vi.mock('@/renderer/pages/conversation/platforms/acp/useAcpMessage', () => ({
  useAcpMessage: vi.fn(() => ({
    thought: { subject: '', description: '' },
    running: mockAcpRunning,
    hasHydratedRunningState: true,
    acpStatus: null,
    aiProcessing: mockAcpAiProcessing,
    setAiProcessing: vi.fn(),
    resetState: vi.fn(),
    tokenUsage: 0,
    contextLimit: 0,
    hasThinkingMessage: mockAcpHasThinkingMessage,
    hasStreamingContent: mockAcpHasStreamingContent,
    activity: mockAcpActivity,
  })),
}));

vi.mock('@/renderer/pages/conversation/platforms/acp/useAcpInitialMessage', () => ({
  useAcpInitialMessage: vi.fn(),
}));

vi.mock('@/renderer/pages/conversation/platforms/gemini/useGeminiMessage', () => ({
  useGeminiMessage: vi.fn(() => ({
    thought: { subject: '', description: '' },
    running: mockGeminiRunning,
    hasHydratedRunningState: true,
    tokenUsage: 0,
    setActiveMsgId: vi.fn(),
    setWaitingResponse: vi.fn(),
    resetState: vi.fn(),
    hasThinkingMessage: false,
  })),
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/useAionrsMessage', () => ({
  useAionrsMessage: vi.fn(() => ({
    thought: { subject: '', description: '' },
    running: mockAionrsRunning,
    hasHydratedRunningState: true,
    tokenUsage: 0,
    setActiveMsgId: vi.fn(),
    setWaitingResponse: vi.fn(),
    resetState: vi.fn(),
  })),
}));

vi.mock('@/renderer/pages/conversation/platforms/codex/useCodexMessage', () => ({
  useCodexMessage: vi.fn(() => ({
    thought: { subject: '', description: '' },
    running: false,
    hasHydratedRunningState: true,
    hasStreamingContent: false,
    activity: null,
    tokenUsage: 0,
    contextLimit: 0,
    resetState: vi.fn(),
  })),
}));

vi.mock('@/renderer/pages/conversation/platforms/gemini/useGeminiQuotaFallback', () => ({
  useGeminiQuotaFallback: vi.fn(() => ({
    handleGeminiError: vi.fn(),
  })),
}));

vi.mock('@/renderer/pages/conversation/platforms/gemini/useGeminiInitialMessage', () => ({
  useGeminiInitialMessage: vi.fn(),
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({
    setSendBoxHandler: mockSetSendBoxHandler,
  }),
}));

vi.mock('@/renderer/services/FileService', () => ({
  allSupportedExts: ['.txt'],
}));

vi.mock('@/renderer/styles/colors', () => ({
  iconColors: {
    secondary: '#999999',
  },
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: (...args: unknown[]) => mockEmitterEmit(...args),
  },
  useAddEventListener: vi.fn(),
}));

vi.mock('@/renderer/utils/file/fileSelection', () => ({
  mergeFileSelectionItems: vi.fn((current: unknown) => current),
}));

vi.mock('@/renderer/utils/file/messageFiles', () => ({
  buildDisplayMessage: (...args: Parameters<typeof mockBuildDisplayMessage>) => mockBuildDisplayMessage(...args),
  collectSelectedFiles: vi.fn((uploadFile: string[], atPath: Array<string | { path: string }>) => [
    ...uploadFile,
    ...atPath.map((item) => (typeof item === 'string' ? item : item.path)),
  ]),
}));

vi.mock('@/renderer/utils/model/modelContextLimits', () => ({
  getModelContextLimit: vi.fn(() => 8192),
}));

vi.mock('@arco-design/web-react', () => ({
  Message: {
    error: (...args: unknown[]) => mockArcoError(...args),
    warning: (...args: unknown[]) => mockArcoWarning(...args),
    success: (...args: unknown[]) => mockArcoSuccess(...args),
  },
  Tag: ({ children }: { children?: React.ReactNode }) => React.createElement('div', {}, children),
}));

vi.mock('@icon-park/react', () => ({
  Shield: () => React.createElement('span'),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; backend?: string; model?: string }) =>
      options?.defaultValue ?? options?.backend ?? options?.model ?? key,
  }),
}));

import AcpSendBox from '@/renderer/pages/conversation/platforms/acp/AcpSendBox';
import AionrsSendBox from '@/renderer/pages/conversation/platforms/aionrs/AionrsSendBox';
import CodexSendBox from '@/renderer/pages/conversation/platforms/codex/CodexSendBox';
import GeminiSendBox from '@/renderer/pages/conversation/platforms/gemini/GeminiSendBox';
import NanobotSendBox from '@/renderer/pages/conversation/platforms/nanobot/NanobotSendBox';
import OpenClawSendBox from '@/renderer/pages/conversation/platforms/openclaw/OpenClawSendBox';
import RemoteSendBox from '@/renderer/pages/conversation/platforms/remote/RemoteSendBox';

const resetQueueSpies = () => {
  for (const spy of Object.values(queueSpies)) {
    spy.mockReset();
  }
};

describe('platform send box queue integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uuidCounter = 0;
    resetQueueSpies();
    mockConversationStatus = 'idle';
    mockAcpRunning = false;
    mockAcpAiProcessing = false;
    mockAcpHasThinkingMessage = false;
    mockAcpHasStreamingContent = false;
    mockAcpActivity = null;
    mockGeminiRunning = false;
    mockAionrsRunning = false;

    mockShouldEnqueueConversationCommand.mockReturnValue(false);
    mockUseCommandQueueEnabled.mockReturnValue(true);
    mockUseConversationCommandQueue.mockReturnValue({
      items: [],
      isPaused: false,
      isInteractionLocked: false,
      hasPendingCommands: false,
      ...queueSpies,
    });

    mockConversationGetInvoke.mockImplementation(async () => ({
      status: mockConversationStatus,
      extra: {
        workspace: 'C:/workspace',
      },
    }));
    mockConversationStopInvoke.mockResolvedValue(undefined);
    mockConversationSendInvoke.mockResolvedValue({ success: true });
    mockAcpSendInvoke.mockResolvedValue({ success: true });
    mockGeminiSendInvoke.mockResolvedValue({ success: true });
    mockOpenClawSendInvoke.mockResolvedValue({ success: true });
    mockOpenClawRuntimeInvoke.mockResolvedValue({
      success: true,
      data: {
        runtime: {
          workspace: 'C:/workspace',
          backend: 'openclaw',
          agentName: 'OpenClaw',
          cliPath: 'C:/cli/openclaw',
          model: 'model-a',
          identityHash: 'identity-1',
          hasActiveSession: true,
        },
        expected: {
          expectedWorkspace: 'C:/workspace',
          expectedBackend: 'openclaw',
          expectedAgentName: 'OpenClaw',
          expectedCliPath: 'C:/cli/openclaw',
          expectedModel: 'model-a',
          expectedIdentityHash: 'identity-1',
        },
      },
    });
    mockDatabaseMessagesInvoke.mockResolvedValue([]);
    mockDraftData.atPath = [];
    mockDraftData.content = '';
    mockDraftData.uploadFile = [];
    mockAgentModeSelector.mockClear();
    mockAcpModelSelector.mockClear();
    mockAcpConfigSelector.mockClear();
    mockFileAttachButton.mockClear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it.each([
    ['acp', <AcpSendBox conversation_id='conv-acp' backend='claude' />],
    [
      'gemini',
      <GeminiSendBox
        conversation_id='conv-gemini'
        modelSelection={{
          currentModel: { useModel: 'gemini-2.5' },
          getDisplayModelName: (modelId: string) => modelId,
          providers: ['google'],
          geminiModeLookup: {},
          getAvailableModels: () => [],
          handleSelectModel: vi.fn(),
        }}
      />,
    ],
    [
      'aionrs',
      <AionrsSendBox
        conversation_id='conv-aionrs'
        modelSelection={{
          currentModel: { useModel: 'aionrs-1' },
          getDisplayModelName: (modelId: string) => modelId,
        }}
      />,
    ],
    ['nanobot', <NanobotSendBox conversation_id='conv-nanobot' />],
    ['remote', <RemoteSendBox conversation_id='conv-remote' />],
    ['openclaw', <OpenClawSendBox conversation_id='conv-openclaw' />],
    ['codex', <CodexSendBox conversation_id='conv-codex' workspacePath='C:/workspace' />],
  ])('wires a directory selector into %s attachments', (_name, element) => {
    render(element);

    expect(mockFileAttachButton).toHaveBeenCalledWith(
      expect.objectContaining({
        openFileSelector: expect.any(Function),
        openDirectorySelector: expect.any(Function),
      })
    );
  });

  it.each([
    ['acp', <AcpSendBox conversation_id='conv-acp' backend='claude' />],
    [
      'gemini',
      <GeminiSendBox
        conversation_id='conv-gemini'
        modelSelection={{
          currentModel: { useModel: 'gemini-2.5' },
          getDisplayModelName: (modelId: string) => modelId,
          providers: ['google'],
          geminiModeLookup: {},
          getAvailableModels: () => [],
          handleSelectModel: vi.fn(),
        }}
      />,
    ],
    [
      'aionrs',
      <AionrsSendBox
        conversation_id='conv-aionrs'
        modelSelection={{
          currentModel: { useModel: 'aionrs-1' },
          getDisplayModelName: (modelId: string) => modelId,
        }}
      />,
    ],
    ['nanobot', <NanobotSendBox conversation_id='conv-nanobot' />],
    ['remote', <RemoteSendBox conversation_id='conv-remote' />],
    ['openclaw', <OpenClawSendBox conversation_id='conv-openclaw' />],
    ['codex', <CodexSendBox conversation_id='conv-codex' />],
  ])('renders queue panel above the processing indicator for %s', (_name, element) => {
    mockUseConversationCommandQueue.mockReturnValue({
      items: [
        {
          commandId: 'queue-1',
          input: 'queued command',
          files: [],
          createdAt: Date.now(),
        },
      ],
      isPaused: false,
      isInteractionLocked: false,
      hasPendingCommands: true,
      ...queueSpies,
    });

    render(element);

    const queuePanel = screen.getByTestId('queue-panel');
    const thoughtDisplay = screen.getByTestId('thought-display');
    const sendbox = screen.getByTestId('sendbox');

    expect(queuePanel.compareDocumentPosition(thoughtDisplay) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(thoughtDisplay.compareDocumentPosition(sendbox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each([
    [
      'acp',
      <AcpSendBox conversation_id='conv-acp' backend='claude' />,
      mockAcpSendInvoke,
      (payload: { input: string; conversation_id: string }) => {
        expect(payload.input).toBe('queued command');
        expect(payload.conversation_id).toBe('conv-acp');
      },
    ],
    [
      'gemini',
      <GeminiSendBox
        conversation_id='conv-gemini'
        modelSelection={{
          currentModel: { useModel: 'gemini-2.5' },
          getDisplayModelName: (modelId: string) => modelId,
          providers: ['google'],
          geminiModeLookup: {},
          getAvailableModels: () => [],
          handleSelectModel: vi.fn(),
        }}
      />,
      mockGeminiSendInvoke,
      (payload: { input: string; conversation_id: string }) => {
        expect(payload.input).toContain('queued command');
        expect(payload.conversation_id).toBe('conv-gemini');
      },
    ],
    [
      'aionrs',
      <AionrsSendBox
        conversation_id='conv-aionrs'
        modelSelection={{
          currentModel: { useModel: 'aionrs-1' },
          getDisplayModelName: (modelId: string) => modelId,
        }}
      />,
      mockConversationSendInvoke,
      (payload: { input: string; conversation_id: string }) => {
        expect(payload.input).toContain('queued command');
        expect(payload.conversation_id).toBe('conv-aionrs');
      },
    ],
    [
      'nanobot',
      <NanobotSendBox conversation_id='conv-nanobot' />,
      mockConversationSendInvoke,
      (payload: { input: string; conversation_id: string }) => {
        expect(payload.input).toContain('queued command');
        expect(payload.conversation_id).toBe('conv-nanobot');
      },
    ],
    [
      'remote',
      <RemoteSendBox conversation_id='conv-remote' />,
      mockConversationSendInvoke,
      (payload: { input: string; conversation_id: string }) => {
        expect(payload.input).toBe('queued command');
        expect(payload.conversation_id).toBe('conv-remote');
      },
      false,
    ],
    [
      'openclaw',
      <OpenClawSendBox conversation_id='conv-openclaw' />,
      mockOpenClawSendInvoke,
      (payload: { input: string; conversation_id: string }) => {
        expect(payload.input).toContain('queued command');
        expect(payload.conversation_id).toBe('conv-openclaw');
      },
    ],
    [
      'codex',
      <CodexSendBox conversation_id='conv-codex' workspacePath='C:/workspace' />,
      mockConversationSendInvoke,
      (payload: { input: string; conversation_id: string }) => {
        expect(payload.input).toContain('queued command');
        expect(payload.conversation_id).toBe('conv-codex');
      },
    ],
  ])(
    'sends commands immediately for %s when queueing is not required',
    async (_name, element, sendSpy, assertPayload, shouldAssertBridgeSuccess = true) => {
      render(element);

      fireEvent.click(screen.getByRole('button', { name: 'trigger-send' }));

      await waitFor(() => {
        expect(sendSpy).toHaveBeenCalledTimes(1);
      });

      assertPayload(sendSpy.mock.calls[0]?.[0] as { input: string; conversation_id: string });
      expect(queueSpies.enqueue).not.toHaveBeenCalled();
      if (shouldAssertBridgeSuccess) {
        expect(mockAssertBridgeSuccess).toHaveBeenCalled();
      }
    }
  );

  it('does not misclassify successful team sends that resolve to void as queue execution failures', async () => {
    mockTeamSendInvoke.mockResolvedValue(undefined);

    render(<AcpSendBox conversation_id='conv-acp' backend='claude' teamId='team-1' />);

    fireEvent.click(screen.getByRole('button', { name: 'trigger-send' }));

    await waitFor(() => {
      expect(mockTeamSendInvoke).toHaveBeenCalledWith({
        teamId: 'team-1',
        content: 'queued command',
        files: [],
      });
    });

    expect(mockAcpSendInvoke).not.toHaveBeenCalled();
    expect(mockArcoWarning).not.toHaveBeenCalledWith(
      'The next queued command could not start. Edit, reorder, or remove it to continue.'
    );
  });

  it('still treats explicit team bridge sentinel errors as failures', async () => {
    mockTeamSendInvoke.mockResolvedValue({
      __bridgeError: true,
      message: 'team failed',
    });

    render(<AcpSendBox conversation_id='conv-acp' backend='claude' teamId='team-1' />);

    fireEvent.click(screen.getByRole('button', { name: 'trigger-send' }));

    await waitFor(() => {
      expect(mockTeamSendInvoke).toHaveBeenCalledTimes(1);
    });
  });

  it.each([
    ['acp', <AcpSendBox conversation_id='conv-acp' backend='claude' />],
    [
      'gemini',
      <GeminiSendBox
        conversation_id='conv-gemini'
        modelSelection={{
          currentModel: { useModel: 'gemini-2.5' },
          getDisplayModelName: (modelId: string) => modelId,
          providers: ['google'],
          geminiModeLookup: {},
          getAvailableModels: () => [],
          handleSelectModel: vi.fn(),
        }}
      />,
    ],
    [
      'aionrs',
      <AionrsSendBox
        conversation_id='conv-aionrs'
        modelSelection={{
          currentModel: { useModel: 'aionrs-1' },
          getDisplayModelName: (modelId: string) => modelId,
        }}
      />,
    ],
    ['nanobot', <NanobotSendBox conversation_id='conv-nanobot' />],
    ['openclaw', <OpenClawSendBox conversation_id='conv-openclaw' />],
    ['codex', <CodexSendBox conversation_id='conv-codex' />],
  ])('enqueues commands for %s when the current turn is still busy', async (_name, element) => {
    mockShouldEnqueueConversationCommand.mockReturnValue(true);

    render(element);

    fireEvent.click(screen.getByRole('button', { name: 'trigger-send' }));

    await waitFor(() => {
      expect(queueSpies.enqueue).toHaveBeenCalledWith({
        input: 'queued command',
        files: [],
      });
    });
  });

  it.each([
    ['acp', <AcpSendBox conversation_id='conv-acp' backend='claude' />],
    [
      'gemini',
      <GeminiSendBox
        conversation_id='conv-gemini'
        modelSelection={{
          currentModel: { useModel: 'gemini-2.5' },
          getDisplayModelName: (modelId: string) => modelId,
          providers: ['google'],
          geminiModeLookup: {},
          getAvailableModels: () => [],
          handleSelectModel: vi.fn(),
        }}
      />,
    ],
    ['nanobot', <NanobotSendBox conversation_id='conv-nanobot' />],
    ['openclaw', <OpenClawSendBox conversation_id='conv-openclaw' />],
    ['codex', <CodexSendBox conversation_id='conv-codex' />],
  ])('resets active execution after stop for %s', async (_name, element) => {
    render(element);

    fireEvent.click(screen.getByRole('button', { name: 'trigger-stop' }));

    await waitFor(() => {
      expect(mockConversationStopInvoke).toHaveBeenCalled();
    });

    expect(queueSpies.resetActiveExecution).toHaveBeenCalledWith('stop');
  });

  it('uses display message for ACP attachments so chat history can retain uploaded images', async () => {
    mockDraftData.uploadFile = ['C:/workspace/uploads/photo.png'];

    render(<AcpSendBox conversation_id='conv-acp' backend='claude' workspacePath='C:/workspace' />);

    fireEvent.click(screen.getByRole('button', { name: 'trigger-send' }));

    await waitFor(() => {
      expect(mockAcpSendInvoke).toHaveBeenCalledTimes(1);
    });

    expect(mockBuildDisplayMessage).toHaveBeenCalledWith(
      'queued command',
      ['C:/workspace/uploads/photo.png'],
      'C:/workspace'
    );
    expect(mockAcpSendInvoke).toHaveBeenCalledWith({
      input: 'queued command|C:/workspace/uploads/photo.png|C:/workspace',
      msg_id: 'uuid-1',
      conversation_id: 'conv-acp',
      files: ['C:/workspace/uploads/photo.png'],
    });
  });

  it('shows an ACP processing indicator while tool or thinking steps are running before content streams', () => {
    mockAcpRunning = true;
    mockAcpAiProcessing = true;
    mockAcpHasThinkingMessage = true;
    mockAcpHasStreamingContent = false;

    render(<AcpSendBox conversation_id='conv-acp' backend='codex' />);

    expect(screen.getByTestId('thought-display')).toHaveAttribute('data-running', 'true');
  });

  it('keeps the ACP processing indicator visible while assistant content is streaming', () => {
    mockAcpRunning = true;
    mockAcpAiProcessing = true;
    mockAcpHasThinkingMessage = true;
    mockAcpHasStreamingContent = true;

    render(<AcpSendBox conversation_id='conv-acp' backend='codex' />);

    expect(screen.getByTestId('thought-display')).toHaveAttribute('data-running', 'true');
    expect(screen.getByTestId('sendbox-loading')).toHaveTextContent('true');
  });

  it('passes the active ACP tool name into the processing indicator', () => {
    mockAcpRunning = true;
    mockAcpAiProcessing = true;
    mockAcpActivity = {
      phase: 'tool',
      title: 'Run npm test',
      status: 'in_progress',
    };

    render(<AcpSendBox conversation_id='conv-acp' backend='codex' />);

    expect(screen.getByTestId('thought-display')).toHaveAttribute('data-running', 'true');
    expect(screen.getByTestId('thought-display')).toHaveAttribute('data-status-text', 'Running tool: Run npm test');
  });

  it('blocks OpenClaw dispatch when runtime validation fails', async () => {
    mockOpenClawRuntimeInvoke.mockResolvedValue({
      success: true,
      data: {
        runtime: {
          workspace: 'C:/another-workspace',
          backend: 'openclaw',
          agentName: 'OpenClaw',
          cliPath: 'C:/cli/openclaw',
          model: 'model-a',
          identityHash: 'identity-1',
          hasActiveSession: true,
        },
        expected: {
          expectedWorkspace: 'C:/workspace',
          expectedBackend: 'openclaw',
          expectedAgentName: 'OpenClaw',
          expectedCliPath: 'C:/cli/openclaw',
          expectedModel: 'model-a',
          expectedIdentityHash: 'identity-1',
        },
      },
    });

    render(<OpenClawSendBox conversation_id='conv-openclaw' />);

    fireEvent.click(screen.getByRole('button', { name: 'trigger-send' }));

    await waitFor(() => {
      expect(mockArcoError).toHaveBeenCalledWith(expect.stringContaining('Agent switch validation failed'));
    });

    expect(mockOpenClawSendInvoke).not.toHaveBeenCalled();
  });

  it('hydrates the persisted Gemini mode into the selector before the first message', () => {
    render(
      <GeminiSendBox
        conversation_id='conv-gemini'
        sessionMode='yolo'
        modelSelection={{
          currentModel: { useModel: 'gemini-2.5' },
          getDisplayModelName: (modelId: string) => modelId,
          providers: ['google'],
          geminiModeLookup: {},
          getAvailableModels: () => [],
          handleSelectModel: vi.fn(),
        }}
      />
    );

    expect(mockAgentModeSelector).toHaveBeenCalledWith(
      expect.objectContaining({
        backend: 'gemini',
        initialMode: 'yolo',
      })
    );
  });

  it('hydrates the persisted Aion CLI mode into the selector before the first message', () => {
    render(
      <AionrsSendBox
        conversation_id='conv-aionrs'
        sessionMode='auto_edit'
        modelSelection={{
          currentModel: { useModel: 'aionrs-1' },
          getDisplayModelName: (modelId: string) => modelId,
        }}
      />
    );

    expect(mockAgentModeSelector).toHaveBeenCalledWith(
      expect.objectContaining({
        backend: 'aionrs',
        initialMode: 'auto_edit',
      })
    );
  });

  it('renders native Codex permission mode and reasoning controls inside the sendbox tools', () => {
    render(<CodexSendBox conversation_id='conv-codex' sessionMode='autoEdit' />);

    const tools = screen.getByTestId('sendbox-tools');
    expect(tools).toContainElement(screen.getByTestId('agent-mode-selector-codex'));
    expect(tools).toContainElement(screen.getByTestId('acp-config-selector-codex'));
    expect(tools).not.toContainElement(screen.queryByTestId('acp-model-selector-codex'));
    expect(mockAgentModeSelector).toHaveBeenCalledWith(
      expect.objectContaining({
        backend: 'codex',
        initialMode: 'autoEdit',
      })
    );
    expect(mockAcpModelSelector).not.toHaveBeenCalled();
  });

  it('sends the initial Codex message created from the guide page', async () => {
    sessionStorage.setItem(
      'codex_initial_message_conv-codex',
      JSON.stringify({
        input: 'start this Codex task',
        files: ['C:/workspace/src/main.ts'],
      })
    );

    render(<CodexSendBox conversation_id='conv-codex' workspacePath='C:/workspace' />);

    await waitFor(() => {
      expect(mockConversationSendInvoke).toHaveBeenCalledTimes(1);
    });

    expect(mockBuildDisplayMessage).toHaveBeenCalledWith(
      'start this Codex task',
      ['C:/workspace/src/main.ts'],
      'C:/workspace'
    );
    expect(mockAddOrUpdateMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'text',
        position: 'right',
        conversation_id: 'conv-codex',
        content: {
          content: 'start this Codex task|C:/workspace/src/main.ts|C:/workspace',
        },
      }),
      true
    );
    expect(mockConversationSendInvoke).toHaveBeenCalledWith({
      input: 'start this Codex task|C:/workspace/src/main.ts|C:/workspace',
      msg_id: 'uuid-1',
      conversation_id: 'conv-codex',
      files: ['C:/workspace/src/main.ts'],
    });
    expect(mockEmitterEmit).toHaveBeenCalledWith('chat.history.refresh');
    expect(sessionStorage.getItem('codex_initial_message_conv-codex')).toBeNull();
  });
});
