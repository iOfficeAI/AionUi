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
  }: {
    disabled?: boolean;
    loading?: boolean;
    onSend: (message: string) => Promise<void> | void;
    onStop?: () => Promise<void> | void;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'sendbox' },
      React.createElement('div', { 'data-testid': 'sendbox-loading' }, String(Boolean(loading))),
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
  default: () => React.createElement('div', { 'data-testid': 'thought-display' }),
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
  default: () => React.createElement('div'),
}));

vi.mock('@/renderer/components/agent/AgentModeSelector', () => ({
  __esModule: true,
  default: () => React.createElement('div'),
}));

vi.mock('@/renderer/components/agent/AcpConfigSelector', () => ({
  __esModule: true,
  default: () => React.createElement('div'),
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
    aiProcessing: false,
    setAiProcessing: vi.fn(),
    resetState: vi.fn(),
    tokenUsage: 0,
    contextLimit: 0,
    hasThinkingMessage: false,
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
});
