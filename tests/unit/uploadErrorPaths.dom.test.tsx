/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Covers the simplified error-handling paths in upload-related components and hooks
 * after the FILE_TOO_LARGE check was removed (no size limit on uploads).
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ─── shared mocks ────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({ children, icon, ...props }: React.ComponentProps<'button'> & { icon?: React.ReactNode }) => (
    <button {...props}>{icon ?? children}</button>
  ),
  Dropdown: ({ children }: React.PropsWithChildren) => <>{children}</>,
  Menu: Object.assign(({ children }: React.PropsWithChildren) => <div>{children}</div>, {
    Item: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  }),
  Message: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@icon-park/react', () => ({
  Plus: () => <span>Plus</span>,
}));

vi.mock('@/renderer/styles/colors', () => ({
  iconColors: { primary: '#000', secondary: '#666' },
}));

vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => ({ conversationId: 'conv-1' }),
}));

vi.mock('@/renderer/services/FileService', () => ({
  FileService: { processDroppedFiles: vi.fn() },
  isSupportedFile: vi.fn(() => true),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => false, // WebUI mode so file input is rendered
}));

vi.mock('@/renderer/hooks/file/useUploadState', () => ({
  trackUpload: vi.fn(() => ({ id: 1, onProgress: vi.fn(), finish: vi.fn() })),
}));

// ─── FileAttachButton ─────────────────────────────────────────────────────────

describe('FileAttachButton — upload error path', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows generic error toast when processDroppedFiles throws', async () => {
    const { Message } = await import('@arco-design/web-react');
    const { FileService } = await import('@/renderer/services/FileService');
    vi.mocked(FileService.processDroppedFiles).mockRejectedValueOnce(new Error('Network error'));

    const { default: FileAttachButton } = await import('@/renderer/components/media/FileAttachButton');
    render(<FileAttachButton openFileSelector={vi.fn()} onLocalFilesAdded={vi.fn()} />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['data'], 'test.txt', { type: 'text/plain' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    await fireEvent.change(fileInput);

    expect(Message.error).toHaveBeenCalledWith('common.fileAttach.failed');
  });
});

// ─── useDragUpload ────────────────────────────────────────────────────────────

describe('useDragUpload — upload error path', () => {
  beforeEach(() => vi.clearAllMocks());

  it('logs and shows error toast when processDroppedFiles throws', async () => {
    const { renderHook } = await import('@testing-library/react');
    const { Message } = await import('@arco-design/web-react');
    const { FileService } = await import('@/renderer/services/FileService');
    vi.mocked(FileService.processDroppedFiles).mockRejectedValueOnce(new Error('Upload error'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { useDragUpload } = await import('@renderer/hooks/file/useDragUpload');
    const { result } = renderHook(() =>
      useDragUpload({ supportedExts: ['.txt'], onFilesAdded: vi.fn(), conversationId: 'conv-1' })
    );

    const file = new File(['data'], 'test.txt', { type: 'text/plain' });
    const dt = { files: [file], items: [], types: [] };
    const dropEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: dt,
    } as unknown as React.DragEvent;

    await result.current.dragHandlers.onDrop!(dropEvent);

    expect(consoleSpy).toHaveBeenCalledWith('Failed to process dropped files:', expect.any(Error));
    expect(Message.error).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
