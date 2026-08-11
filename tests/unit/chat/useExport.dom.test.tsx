import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useExport } from '@/renderer/pages/conversation/GroupedHistory/hooks/useExport';

const mockGetDesktopPath = vi.fn();
const mockGetFileMetadata = vi.fn();
const mockGetMessages = vi.fn();
const mockGetWorkspace = vi.fn();
const mockCreateZip = vi.fn();
const mockCancelZip = vi.fn();
const mockShowOpen = vi.fn();
const mockMessageSuccess = vi.fn();
const mockMessageWarning = vi.fn();
const mockMessageError = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    application: {
      getPath: { invoke: (...args: unknown[]) => mockGetDesktopPath(...args) },
    },
    fs: {
      getFileMetadata: { invoke: (...args: unknown[]) => mockGetFileMetadata(...args) },
      createZip: { invoke: (...args: unknown[]) => mockCreateZip(...args) },
      cancelZip: { invoke: (...args: unknown[]) => mockCancelZip(...args) },
    },
    database: {
      getConversationMessages: { invoke: (...args: unknown[]) => mockGetMessages(...args) },
    },
    conversation: {
      getWorkspace: { invoke: (...args: unknown[]) => mockGetWorkspace(...args) },
    },
    dialog: {
      showOpen: { invoke: (...args: unknown[]) => mockShowOpen(...args) },
    },
  },
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: vi.fn(() => true),
}));

vi.mock('react-i18next', () => ({
  useTranslation: vi.fn(() => ({
    t: (key: string) => key,
  })),
}));

vi.mock('@arco-design/web-react', () => ({
  Message: {
    success: (...args: unknown[]) => mockMessageSuccess(...args),
    warning: (...args: unknown[]) => mockMessageWarning(...args),
    error: (...args: unknown[]) => mockMessageError(...args),
  },
}));

describe('useExport', () => {
  let dateNowSpy: ReturnType<typeof vi.spyOn>;

  const conversation = {
    id: 'conv-1',
    name: 'Current chat',
    type: 'gemini',
    extra: { workspace: '/workspace' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1764021296000);
    mockGetDesktopPath.mockResolvedValue('/Desktop');
    mockGetFileMetadata.mockRejectedValue(new Error('missing'));
    mockGetMessages.mockResolvedValue([
      {
        id: 'msg-1',
        conversation_id: 'conv-1',
        type: 'text',
        position: 'right',
        content: { content: 'hello export' },
      },
    ]);
    mockGetWorkspace.mockResolvedValue(undefined);
    mockCreateZip.mockResolvedValue(true);
    mockShowOpen.mockResolvedValue(['/picked']);
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
  });

  it('opens the export modal and seeds the desktop path', async () => {
    const { result } = renderHook(() =>
      useExport({
        conversations: [conversation as never],
        selectedConversationIds: new Set(),
        setSelectedConversationIds: vi.fn(),
      })
    );

    await act(async () => {
      result.current.handleExportConversation(conversation as never);
    });

    await waitFor(() => {
      expect(result.current.exportModalVisible).toBe(true);
      expect(result.current.exportTargetPath).toBe('/Desktop');
    });
  });

  it('opens the desktop directory picker and updates the export path', async () => {
    const { result } = renderHook(() =>
      useExport({
        conversations: [conversation as never],
        selectedConversationIds: new Set(),
        setSelectedConversationIds: vi.fn(),
      })
    );

    await act(async () => {
      result.current.handleExportConversation(conversation as never);
    });

    await act(async () => {
      await result.current.handleSelectExportFolder();
    });

    expect(mockShowOpen).toHaveBeenCalledWith({
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: '/Desktop',
    });
    expect(result.current.exportTargetPath).toBe('/picked');
  });

  it('warns when batch export is triggered without any selection', () => {
    const { result } = renderHook(() =>
      useExport({
        conversations: [conversation as never],
        selectedConversationIds: new Set(),
        setSelectedConversationIds: vi.fn(),
      })
    );

    act(() => {
      result.current.handleBatchExport();
    });

    expect(mockMessageWarning).toHaveBeenCalledWith('conversation.history.batchNoSelection');
  });

  it('creates a unique zip path and exports a single conversation', async () => {
    mockGetFileMetadata.mockResolvedValueOnce({ size: 1 }).mockRejectedValueOnce(new Error('missing'));

    const { result } = renderHook(() =>
      useExport({
        conversations: [conversation as never],
        selectedConversationIds: new Set(),
        setSelectedConversationIds: vi.fn(),
      })
    );

    await act(async () => {
      result.current.handleExportConversation(conversation as never);
    });

    act(() => {
      result.current.handleSelectExportDirectoryFromModal(['/exports']);
    });

    await act(async () => {
      await result.current.handleConfirmExport();
    });

    await waitFor(() => {
      expect(mockCreateZip).toHaveBeenCalled();
    });

    const zipCall = mockCreateZip.mock.calls[0]?.[0];
    expect(zipCall.path).toMatch(/^\/exports\/Current chat-\d{8}-\d{6}-1764021296000-1\.zip$/);
    expect(zipCall.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Current chat__conv-1/conversation/conversation.json',
        }),
        expect.objectContaining({
          name: 'Current chat__conv-1/conversation/conversation.md',
        }),
      ])
    );
    expect(mockMessageSuccess).toHaveBeenCalledWith('conversation.history.exportSuccess');
  });

  it('exports all selected conversations in batch mode and clears the selection', async () => {
    const secondConversation = {
      id: 'conv-2',
      name: 'Second chat',
      type: 'gemini',
      extra: {},
    };
    const setSelectedConversationIds = vi.fn();

    const { result } = renderHook(() =>
      useExport({
        conversations: [conversation as never, secondConversation as never],
        selectedConversationIds: new Set(['conv-1', 'conv-2']),
        setSelectedConversationIds,
        onBatchModeChange: vi.fn(),
      })
    );

    await act(async () => {
      result.current.handleBatchExport();
    });

    await waitFor(() => {
      expect(result.current.exportModalVisible).toBe(true);
    });

    act(() => {
      result.current.handleSelectExportDirectoryFromModal(['/exports']);
    });

    await act(async () => {
      await result.current.handleConfirmExport();
    });

    const zipCall = mockCreateZip.mock.calls.at(-1)?.[0];
    expect(zipCall.path).toMatch(/^\/exports\/batch-export-\d{8}-\d{6}\.zip$/);
    expect(zipCall.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Current chat__conv-1/conversation/conversation.json',
        }),
        expect.objectContaining({
          name: 'Second chat__conv-2/conversation/conversation.json',
        }),
      ])
    );
    expect(setSelectedConversationIds).toHaveBeenCalledWith(new Set());
    expect(mockMessageSuccess).toHaveBeenCalledWith('conversation.history.exportSuccess');
  });

  it('warns when confirming export without a target directory', async () => {
    const { result } = renderHook(() =>
      useExport({
        conversations: [conversation as never],
        selectedConversationIds: new Set(),
        setSelectedConversationIds: vi.fn(),
      })
    );

    await act(async () => {
      result.current.handleExportConversation(conversation as never);
    });

    act(() => {
      result.current.handleSelectExportDirectoryFromModal(['   ']);
    });

    await act(async () => {
      await result.current.handleConfirmExport();
    });

    expect(mockCreateZip).not.toHaveBeenCalled();
    expect(mockMessageWarning).toHaveBeenCalledWith('conversation.history.exportSelectFolder');
  });

  it('shows an error when the export directory dialog fails', async () => {
    mockShowOpen.mockRejectedValueOnce(new Error('dialog failed'));

    const { result } = renderHook(() =>
      useExport({
        conversations: [conversation as never],
        selectedConversationIds: new Set(),
        setSelectedConversationIds: vi.fn(),
      })
    );

    await act(async () => {
      result.current.handleExportConversation(conversation as never);
    });

    await act(async () => {
      await result.current.handleSelectExportFolder();
    });

    expect(mockMessageError).toHaveBeenCalledWith('conversation.history.exportFailed');
  });

  it('shows an error when zip creation fails', async () => {
    mockCreateZip.mockRejectedValueOnce(new Error('zip failed'));

    const { result } = renderHook(() =>
      useExport({
        conversations: [conversation as never],
        selectedConversationIds: new Set(),
        setSelectedConversationIds: vi.fn(),
      })
    );

    await act(async () => {
      result.current.handleExportConversation(conversation as never);
    });

    act(() => {
      result.current.handleSelectExportDirectoryFromModal(['/exports']);
    });

    await act(async () => {
      await result.current.handleConfirmExport();
    });

    expect(mockMessageError).toHaveBeenCalledWith('conversation.history.exportFailed');
    expect(result.current.exportModalLoading).toBe(false);
  });
});
