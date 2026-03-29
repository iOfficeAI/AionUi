import React from 'react';
import { act, fireEvent, render, screen, waitFor, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConversationExport } from '@/renderer/hooks/file/useConversationExport';

const mockConversationGet = vi.fn();
const mockMessagesGet = vi.fn();
const mockWriteFile = vi.fn();
const mockCopyText = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      get: { invoke: (...args: unknown[]) => mockConversationGet(...args) },
    },
    database: {
      getConversationMessages: { invoke: (...args: unknown[]) => mockMessagesGet(...args) },
    },
    fs: {
      writeFile: { invoke: (...args: unknown[]) => mockWriteFile(...args) },
    },
    application: {
      getPath: { invoke: vi.fn().mockResolvedValue('/Desktop') },
    },
  },
}));

vi.mock('@/renderer/utils/ui/clipboard', () => ({
  copyText: (...args: unknown[]) => mockCopyText(...args),
}));

const t = (key: string, options?: Record<string, unknown>) => {
  if (key === 'messages.export.saveSuccess') {
    return `saved:${options?.path ?? ''}`;
  }
  if (key === 'messages.export.conversationLabel') return 'Conversation';
  if (key === 'messages.export.conversationIdLabel') return 'Conversation ID';
  if (key === 'messages.export.exportedAtLabel') return 'Exported At';
  if (key === 'messages.export.typeLabel') return 'Type';
  if (key === 'messages.export.noMessages') return 'No messages';
  if (key === 'messages.export.userLabel') return 'Visitor';
  if (key === 'messages.export.assistantLabel') return 'Responder';
  if (key === 'messages.export.systemLabel') return 'System';
  if (key === 'messages.copy') {
    return 'Copy';
  }
  if (key === 'common.copySuccess') {
    return 'Copied';
  }
  if (key === 'common.copyFailed') {
    return 'Copy failed';
  }
  return key;
};

describe('useConversationExport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConversationGet.mockResolvedValue({
      id: 'conv-1',
      name: 'Current chat',
      type: 'gemini',
    });
    mockMessagesGet.mockResolvedValue([
      {
        id: 'msg-1',
        conversation_id: 'conv-1',
        type: 'text',
        position: 'right',
        content: { content: 'hello export' },
      },
    ]);
    mockWriteFile.mockResolvedValue(true);
    mockCopyText.mockResolvedValue(undefined);
  });

  it('shows a copy-path action in the save success message', async () => {
    const success = vi.fn();
    const error = vi.fn();

    const { result } = renderHook(() =>
      useConversationExport({
        conversationId: 'conv-1',
        workspace: '/workspace',
        t,
        messageApi: { success, error },
      })
    );

    await act(async () => {
      await result.current.openExportFlow();
    });

    expect(result.current.filename).toMatch(/^\d{4}-\d{2}-\d{2}-conv-1-hello-export\.txt$/);

    await act(async () => {
      result.current.onSelectMenuItem('save');
    });

    await act(async () => {
      await result.current.submitFilename();
    });

    expect(mockWriteFile).toHaveBeenCalledWith({
      path: expect.stringMatching(/^\/workspace\/.+\.txt$/),
      data: expect.stringContaining('Visitor:\nhello export'),
    });

    const successPayload = success.mock.calls[0]?.[0];
    expect(successPayload).toMatchObject({ duration: 5000 });

    if (!successPayload || typeof successPayload !== 'object' || !('content' in successPayload)) {
      throw new Error('Expected save success message payload with content');
    }

    render(<>{successPayload.content}</>);

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    await waitFor(() => {
      expect(mockCopyText).toHaveBeenCalledWith(expect.stringMatching(/^\/workspace\/.+\.txt$/));
    });

    expect(success).toHaveBeenLastCalledWith('Copied');
    expect(error).not.toHaveBeenCalled();
  });

  it('reports unavailable export when no conversation id exists', async () => {
    const success = vi.fn();
    const error = vi.fn();

    const { result } = renderHook(() =>
      useConversationExport({
        workspace: '/workspace',
        t,
        messageApi: { success, error },
      })
    );

    await act(async () => {
      await result.current.openExportFlow();
    });

    expect(error).toHaveBeenCalledWith('messages.export.unavailable');
    expect(success).not.toHaveBeenCalled();
  });

  it('reports prepare failure when conversation loading throws', async () => {
    mockConversationGet.mockRejectedValueOnce(new Error('boom'));
    const error = vi.fn();

    const { result } = renderHook(() =>
      useConversationExport({
        conversationId: 'conv-1',
        workspace: '/workspace',
        t,
        messageApi: { success: vi.fn(), error },
      })
    );

    await act(async () => {
      await result.current.openExportFlow();
    });

    expect(error).toHaveBeenCalledWith('messages.export.prepareFailed');
  });

  it('copies transcript to clipboard when copy action is selected', async () => {
    const success = vi.fn();
    const error = vi.fn();

    const { result } = renderHook(() =>
      useConversationExport({
        conversationId: 'conv-1',
        workspace: '/workspace',
        t,
        messageApi: { success, error },
      })
    );

    await act(async () => {
      await result.current.openExportFlow();
    });

    act(() => {
      result.current.onSelectMenuItem('copy');
    });

    await waitFor(() => {
      expect(mockCopyText).toHaveBeenCalledWith(expect.stringContaining('Visitor:\nhello export'));
    });

    expect(success).toHaveBeenCalledWith('messages.export.copySuccess');
    expect(error).not.toHaveBeenCalled();
  });

  it('reports error when clipboard copy fails', async () => {
    const success = vi.fn();
    const error = vi.fn();
    mockCopyText.mockRejectedValueOnce(new Error('clipboard denied'));

    const { result } = renderHook(() =>
      useConversationExport({
        conversationId: 'conv-1',
        workspace: '/workspace',
        t,
        messageApi: { success, error },
      })
    );

    await act(async () => {
      await result.current.openExportFlow();
    });

    act(() => {
      result.current.onSelectMenuItem('copy');
    });

    await waitFor(() => {
      expect(error).toHaveBeenCalledWith('messages.export.copyFailed');
    });

    expect(success).not.toHaveBeenCalled();
  });

  it('navigates menu items with ArrowDown and wraps around with ArrowUp', async () => {
    const { result } = renderHook(() =>
      useConversationExport({
        conversationId: 'conv-1',
        workspace: '/workspace',
        t,
        messageApi: { success: vi.fn(), error: vi.fn() },
      })
    );

    await act(async () => {
      await result.current.openExportFlow();
    });

    expect(result.current.activeIndex).toBe(0);

    act(() => {
      result.current.handleKeyDown({
        key: 'ArrowDown',
        shiftKey: false,
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent);
    });
    expect(result.current.activeIndex).toBe(1);

    act(() => {
      result.current.handleKeyDown({
        key: 'ArrowUp',
        shiftKey: false,
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent);
    });
    expect(result.current.activeIndex).toBe(0);

    // ArrowUp from 0 wraps to last item
    act(() => {
      result.current.handleKeyDown({
        key: 'ArrowUp',
        shiftKey: false,
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent);
    });
    expect(result.current.activeIndex).toBe(1);
  });

  it('selects menu item with Enter key in menu step', async () => {
    const success = vi.fn();
    const error = vi.fn();

    const { result } = renderHook(() =>
      useConversationExport({
        conversationId: 'conv-1',
        workspace: '/workspace',
        t,
        messageApi: { success, error },
      })
    );

    await act(async () => {
      await result.current.openExportFlow();
    });

    expect(result.current.step).toBe('menu');
    expect(result.current.activeIndex).toBe(0);

    // Enter with activeIndex=0 → 'copy' action
    act(() => {
      result.current.handleKeyDown({
        key: 'Enter',
        shiftKey: false,
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent);
    });

    await waitFor(() => {
      expect(mockCopyText).toHaveBeenCalled();
    });
  });

  it('submits filename when Enter is pressed in filename step', async () => {
    const success = vi.fn();
    const error = vi.fn();

    const { result } = renderHook(() =>
      useConversationExport({
        conversationId: 'conv-1',
        workspace: '/workspace',
        t,
        messageApi: { success, error },
      })
    );

    await act(async () => {
      await result.current.openExportFlow();
    });

    act(() => {
      result.current.onSelectMenuItem('save');
    });

    expect(result.current.step).toBe('filename');

    act(() => {
      result.current.handleKeyDown({
        key: 'Enter',
        shiftKey: false,
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent);
    });

    await waitFor(() => {
      expect(mockWriteFile).toHaveBeenCalled();
    });

    expect(success).toHaveBeenCalled();
  });

  it('returns cached transcript without re-fetching on second call', async () => {
    const success = vi.fn();
    const error = vi.fn();

    const { result } = renderHook(() =>
      useConversationExport({
        conversationId: 'conv-1',
        workspace: '/workspace',
        t,
        messageApi: { success, error },
      })
    );

    await act(async () => {
      await result.current.openExportFlow();
    });

    // First copy triggers loadTranscript — builds and caches transcript
    act(() => {
      result.current.onSelectMenuItem('copy');
    });
    await waitFor(() => {
      expect(mockCopyText).toHaveBeenCalledTimes(1);
    });

    // Second copy uses cached transcript — no additional IPC calls
    act(() => {
      result.current.onSelectMenuItem('copy');
    });
    await waitFor(() => {
      expect(mockCopyText).toHaveBeenCalledTimes(2);
    });

    expect(mockConversationGet).toHaveBeenCalledTimes(1);
    expect(mockMessagesGet).toHaveBeenCalledTimes(1);
  });

  it('shows unavailable error when base directory is empty', async () => {
    const success = vi.fn();
    const error = vi.fn();

    const { result } = renderHook(() =>
      useConversationExport({
        conversationId: 'conv-1',
        workspace: '/workspace',
        t,
        messageApi: { success, error },
      })
    );

    // Do not call openExportFlow — baseDirectoryRef.current remains empty
    await act(async () => {
      await result.current.submitFilename();
    });

    expect(error).toHaveBeenCalledWith('messages.export.unavailable');
    expect(success).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });
});
