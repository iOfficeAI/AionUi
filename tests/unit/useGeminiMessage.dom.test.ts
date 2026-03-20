/**
 * Regression tests for useGeminiMessage hook
 * Covers resetState ref sync (#1354 follow-up) and activeMsgIdRef filtering
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Capture IPC listener set up by the hook
let capturedResponseListener: ((message: unknown) => void) | null = null;
const mockGetInvoke = vi.fn().mockResolvedValue(null);

vi.mock('@/common', () => ({
  ipcBridge: {
    geminiConversation: {
      responseStream: {
        on: vi.fn((listener: (message: unknown) => void) => {
          capturedResponseListener = listener;
          return () => {
            capturedResponseListener = null;
          };
        }),
      },
    },
    conversation: {
      get: { invoke: (...args: unknown[]) => mockGetInvoke(...args) },
      update: { invoke: vi.fn().mockResolvedValue(null) },
      stop: { invoke: vi.fn().mockResolvedValue(null) },
    },
    database: {
      getConversationMessages: { invoke: vi.fn().mockResolvedValue([]) },
    },
  },
}));

vi.mock('@/common/chat/chatLib', () => ({
  transformMessage: vi.fn((msg: unknown) => msg),
}));

vi.mock('@/renderer/messages/hooks', () => ({
  useAddOrUpdateMessage: vi.fn(() => vi.fn()),
}));

// Mock renderer dependencies required for GeminiSendBox.tsx module to load
vi.mock('@/renderer/hooks/useAgentReadinessCheck', () => ({
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

vi.mock('@/renderer/hooks/useAutoTitle', () => ({
  useAutoTitle: vi.fn(() => ({ checkAndUpdateTitle: vi.fn() })),
}));

vi.mock('@/renderer/hooks/useLatestRef', () => ({
  useLatestRef: vi.fn((val: unknown) => ({ current: val })),
}));

vi.mock('@/renderer/hooks/useOpenFileSelector', () => ({
  useOpenFileSelector: vi.fn(() => ({ openFileSelector: vi.fn(), onSlashBuiltinCommand: vi.fn() })),
}));

vi.mock('@/renderer/hooks/useSendBoxDraft', () => ({
  getSendBoxDraftHook: vi.fn(() => vi.fn(() => ({ data: null, mutate: vi.fn() }))),
}));

vi.mock('@/renderer/hooks/useSendBoxFiles', () => ({
  createSetUploadFile: vi.fn(() => vi.fn()),
  useSendBoxFiles: vi.fn(() => ({ handleFilesAdded: vi.fn(), clearFiles: vi.fn() })),
}));

vi.mock('@/renderer/hooks/useSlashCommands', () => ({
  useSlashCommands: vi.fn(() => []),
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: vi.fn(() => ({ setSendBoxHandler: vi.fn() })),
}));

vi.mock('@/renderer/services/FileService', () => ({
  allSupportedExts: [],
  MAX_UPLOAD_SIZE_MB: 50,
  FileService: { uploadFile: vi.fn(), isSupportedFile: vi.fn(() => true) },
  isSupportedFile: vi.fn(() => true),
}));

vi.mock('@/renderer/styles/colors', () => ({
  iconColors: { primary: '#000', secondary: '#666' },
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: { emit: vi.fn() },
  useAddEventListener: vi.fn(),
}));

vi.mock('@/renderer/utils/fileSelection', () => ({
  mergeFileSelectionItems: vi.fn((a: unknown) => a),
}));

vi.mock('@/renderer/utils/messageFiles', () => ({
  buildDisplayMessage: vi.fn((msg: unknown) => msg),
  collectSelectedFiles: vi.fn(() => []),
}));

vi.mock('@/renderer/utils/modelContextLimits', () => ({
  getModelContextLimit: vi.fn(() => null),
}));

vi.mock('@/renderer/components/AgentSetupCard', () => ({ default: vi.fn(() => null) }));
vi.mock('@/renderer/components/ContextUsageIndicator', () => ({ default: vi.fn(() => null) }));
vi.mock('@/renderer/components/FilePreview', () => ({ default: vi.fn(() => null) }));
vi.mock('@/renderer/components/HorizontalFileList', () => ({ default: vi.fn(() => null) }));
vi.mock('@/renderer/components/sendbox', () => ({ default: vi.fn(() => null) }));
vi.mock('@/renderer/components/ThoughtDisplay', () => ({ default: vi.fn(() => null) }));
vi.mock('@/renderer/components/AgentModeSelector', () => ({ default: vi.fn(() => null) }));

vi.mock('@arco-design/web-react', () => ({
  Button: vi.fn(() => null),
  Message: { warning: vi.fn(), success: vi.fn(), error: vi.fn() },
  Tag: vi.fn(() => null),
}));

vi.mock('@icon-park/react', () => ({
  Plus: vi.fn(() => null),
  Shield: vi.fn(() => null),
}));

vi.mock('react-i18next', () => ({
  useTranslation: vi.fn(() => ({ t: (key: string) => key })),
}));

vi.mock('@/common/utils', () => ({
  uuid: vi.fn(() => 'test-uuid'),
}));

// Import after all vi.mock calls so hoisting takes effect
import { useGeminiMessage } from '../../src/renderer/pages/conversation/platforms/gemini/useGeminiMessage';

const CONVERSATION_ID = 'test-conv-1';

describe('useGeminiMessage', () => {
  beforeEach(() => {
    capturedResponseListener = null;
    mockGetInvoke.mockResolvedValue(null);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('resetState() resets running state to false', async () => {
    const { result } = renderHook(() => useGeminiMessage(CONVERSATION_ID));

    // Flush initial useEffect (conversation.get.invoke promise)
    await act(async () => {
      await Promise.resolve();
    });

    // Set waitingResponse to true via the exposed setter
    act(() => {
      result.current.setWaitingResponse(true);
    });

    expect(result.current.running).toBe(true);

    // Call resetState — should synchronously clear all running flags
    act(() => {
      result.current.resetState();
    });

    expect(result.current.running).toBe(false);
  });

  it('resetState() clears activeMsgIdRef so thought events from new messages pass through', async () => {
    const { result } = renderHook(() => useGeminiMessage(CONVERSATION_ID));

    await act(async () => {
      await Promise.resolve();
    });

    // Pin activeMsgIdRef to "msg-A"
    act(() => {
      result.current.setActiveMsgId('msg-A');
    });

    // Thought from a different msg_id should be filtered out
    act(() => {
      capturedResponseListener?.({
        type: 'thought',
        conversation_id: CONVERSATION_ID,
        msg_id: 'msg-B',
        data: { subject: 'filtered', description: 'should not appear' },
      });
      vi.runAllTimers();
    });

    expect(result.current.thought.subject).toBe('');

    // Reset clears activeMsgIdRef to null
    act(() => {
      result.current.resetState();
    });

    // Same thought event (msg-B) should now pass through
    act(() => {
      capturedResponseListener?.({
        type: 'thought',
        conversation_id: CONVERSATION_ID,
        msg_id: 'msg-B',
        data: { subject: 'visible', description: 'should appear' },
      });
      vi.runAllTimers();
    });

    expect(result.current.thought.subject).toBe('visible');
  });

  it('activeMsgIdRef correctly filters stale events after a new request begins', async () => {
    const { result } = renderHook(() => useGeminiMessage(CONVERSATION_ID));

    await act(async () => {
      await Promise.resolve();
    });

    // Simulate: old request → stop → new request lifecycle
    act(() => {
      result.current.setActiveMsgId('msg-old');
    });

    act(() => {
      result.current.resetState();
    });

    // New request starts
    act(() => {
      result.current.setActiveMsgId('msg-new');
    });

    // Thought from new request should pass through
    act(() => {
      capturedResponseListener?.({
        type: 'thought',
        conversation_id: CONVERSATION_ID,
        msg_id: 'msg-new',
        data: { subject: 'new-thought', description: 'new request' },
      });
      vi.runAllTimers();
    });

    expect(result.current.thought.subject).toBe('new-thought');

    // Reset thought for the next assertion
    act(() => {
      result.current.setThought({ subject: '', description: '' });
    });

    // Thought from a stale/unrelated msg_id should be filtered
    act(() => {
      capturedResponseListener?.({
        type: 'thought',
        conversation_id: CONVERSATION_ID,
        msg_id: 'msg-stale',
        data: { subject: 'stale-thought', description: 'should be filtered' },
      });
      vi.runAllTimers();
    });

    expect(result.current.thought.subject).toBe('');
  });
});
