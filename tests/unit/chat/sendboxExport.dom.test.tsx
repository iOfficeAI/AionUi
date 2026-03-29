import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SendBox from '@/renderer/components/chat/sendbox';
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';

const mockConversationGet = vi.fn();
const mockMessagesGet = vi.fn();
const mockDesktopPathGet = vi.fn();
const mockWriteFile = vi.fn();
const mockCopyText = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      get: { invoke: (...args: unknown[]) => mockConversationGet(...args) },
      warmup: { invoke: vi.fn().mockResolvedValue(undefined) },
    },
    database: {
      getConversationMessages: { invoke: (...args: unknown[]) => mockMessagesGet(...args) },
    },
    application: {
      getPath: { invoke: (...args: unknown[]) => mockDesktopPathGet(...args) },
    },
    fs: {
      writeFile: { invoke: (...args: unknown[]) => mockWriteFile(...args) },
    },
  },
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: vi.fn(() => null),
}));

vi.mock('@/renderer/hooks/chat/useInputFocusRing', () => ({
  useInputFocusRing: vi.fn(() => ({
    activeBorderColor: 'var(--color-border-2)',
    inactiveBorderColor: 'var(--color-border-2)',
    activeShadow: 'none',
  })),
}));

vi.mock('@/renderer/hooks/file/useDragUpload', () => ({
  useDragUpload: vi.fn(() => ({
    isFileDragging: false,
    dragHandlers: {},
  })),
}));

vi.mock('@renderer/hooks/file/useUploadState', () => ({
  useUploadState: vi.fn(() => ({ isUploading: false })),
}));

vi.mock('@/renderer/hooks/file/usePasteService', () => ({
  usePasteService: vi.fn(() => ({
    onPaste: vi.fn(),
    onFocus: vi.fn(),
  })),
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: vi.fn(() => ({
    setSendBoxHandler: vi.fn(),
    domSnippets: [],
    removeDomSnippet: vi.fn(),
    clearDomSnippets: vi.fn(),
  })),
}));

vi.mock('@/renderer/utils/ui/clipboard', () => ({
  copyText: (...args: unknown[]) => mockCopyText(...args),
}));

vi.mock('react-i18next', () => ({
  useTranslation: vi.fn(() => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'messages.export.saveSuccess') {
        return `${key}:${options?.path ?? ''}`;
      }
      return key;
    },
  })),
}));

const onSend = vi.fn().mockResolvedValue(undefined);
const onSlashBuiltinCommand = vi.fn();

const SendBoxHarness: React.FC<{ initialValue?: string }> = ({ initialValue = '/export' }) => {
  const [value, setValue] = useState(initialValue);
  return (
    <ConversationProvider value={{ conversationId: 'conv-1', workspace: '/workspace', type: 'gemini' }}>
      <SendBox value={value} onChange={setValue} onSend={onSend} onSlashBuiltinCommand={onSlashBuiltinCommand} />
    </ConversationProvider>
  );
};

describe('SendBox export flow', () => {
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
    mockDesktopPathGet.mockResolvedValue('/Desktop');
    mockWriteFile.mockResolvedValue(true);
    mockCopyText.mockResolvedValue(undefined);
  });

  it('opens the export action menu from the slash command', async () => {
    render(<SendBoxHarness />);

    fireEvent.click(screen.getAllByRole('option')[0]);

    expect(await screen.findByText('messages.export.copyLabel')).toBeInTheDocument();
    expect(screen.getByText('messages.export.saveLabel')).toBeInTheDocument();
  });

  it('copies the conversation transcript from the export menu', async () => {
    render(<SendBoxHarness />);

    fireEvent.click(screen.getAllByRole('option')[0]);
    fireEvent.click(await screen.findByText('messages.export.copyLabel'));

    await waitFor(() => {
      expect(mockCopyText).toHaveBeenCalledWith(expect.stringContaining('hello export'));
    });
  });

  it('navigates the export menu with arrow keys and saves from the filename step', async () => {
    render(<SendBoxHarness />);

    const input = screen.getByRole('textbox');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByText('messages.export.copyLabel')).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    const filenameInput = await screen.findByPlaceholderText('messages.export.fileNamePlaceholder');
    fireEvent.keyDown(filenameInput, { key: 'Enter' });

    await waitFor(() => {
      expect(mockWriteFile).toHaveBeenCalledWith({
        path: expect.stringMatching(/^\/workspace\/.+\.txt$/),
        data: expect.stringContaining('hello export'),
      });
    });
  });

  it('returns from filename mode with Escape and closes the export flow from the menu', async () => {
    render(<SendBoxHarness />);

    const input = screen.getByRole('textbox');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByText('messages.export.copyLabel')).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    const filenameInput = await screen.findByPlaceholderText('messages.export.fileNamePlaceholder');
    fireEvent.keyDown(filenameInput, { key: 'Escape' });

    expect(await screen.findByText('messages.export.copyLabel')).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByText('messages.export.copyLabel')).not.toBeInTheDocument();
    });
  });

  it('prompts for a filename and saves into the workspace path', async () => {
    render(<SendBoxHarness />);

    fireEvent.click(screen.getAllByRole('option')[0]);
    fireEvent.click(await screen.findByText('messages.export.saveLabel'));

    expect(await screen.findByText('messages.export.fileNameLabel')).toBeInTheDocument();
    expect(screen.getByText(/\/workspace\//)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => {
      expect(mockWriteFile).toHaveBeenCalledWith({
        path: expect.stringMatching(/^\/workspace\/.+\.txt$/),
        data: expect.stringContaining('hello export'),
      });
    });
  });

  it('closes the export flow when normal text is typed after opening it', async () => {
    render(<SendBoxHarness />);

    const input = screen.getByRole('textbox');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByText('messages.export.copyLabel')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'plain message' } });

    await waitFor(() => {
      expect(screen.queryByText('messages.export.copyLabel')).not.toBeInTheDocument();
    });
  });

  it('does not send the message when Enter is used inside the export overlay', async () => {
    render(<SendBoxHarness />);

    const input = screen.getByRole('textbox');

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(await screen.findByText('messages.export.copyLabel')).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });

    expect(onSend).not.toHaveBeenCalled();
    expect(await screen.findByText('messages.export.copySuccess')).toBeInTheDocument();
  });

  it('keeps the export overlay active instead of the normal slash menu after /export is opened', async () => {
    render(<SendBoxHarness />);

    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByText('messages.export.copyLabel')).toBeInTheDocument();
    expect(screen.queryByText('/open')).not.toBeInTheDocument();
    expect(screen.queryByText('/export')).not.toBeInTheDocument();
  });

  it('still executes the builtin /open command separately from /export', async () => {
    render(<SendBoxHarness initialValue='/open' />);

    fireEvent.click(screen.getByRole('option', { name: /\/open/i }));

    await waitFor(() => {
      expect(onSlashBuiltinCommand).toHaveBeenCalledWith('open');
    });
    expect(screen.queryByText('messages.export.copyLabel')).not.toBeInTheDocument();
  });
});
