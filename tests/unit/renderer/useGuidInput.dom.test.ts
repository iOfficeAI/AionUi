/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regression test for ELECTRON-1K6: pasting/dropping files into the Guid input
 * must not clear the user-selected workspace dir. Drag and paste both flow
 * through `handleFilesPasted` (see `useDragUpload({ onFilesAdded: handleFilesPasted })`).
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useGuidInput } from '@/renderer/pages/guid/hooks/useGuidInput';

vi.mock('@/renderer/hooks/file/useDragUpload', () => ({
  useDragUpload: () => ({ isFileDragging: false, dragHandlers: {} }),
}));

vi.mock('@/renderer/hooks/file/usePasteService', () => ({
  usePasteService: () => ({ onPaste: vi.fn(), onFocus: vi.fn() }),
}));

describe('useGuidInput — ELECTRON-1K6', () => {
  it('handleFilesPasted preserves the selected workspace dir', () => {
    const { result } = renderHook(() => useGuidInput({ locationState: null }));

    act(() => {
      result.current.setDir('/Users/me/projects/my-project');
    });
    expect(result.current.dir).toBe('/Users/me/projects/my-project');

    act(() => {
      result.current.handleFilesPasted([
        // FileMetadata only needs `path` for this hook's purposes.
        { path: '/tmp/a.png' } as never,
        { path: '/tmp/b.txt' } as never,
      ]);
    });

    expect(result.current.files).toEqual(['/tmp/a.png', '/tmp/b.txt']);
    expect(result.current.dir).toBe('/Users/me/projects/my-project');
  });

  it('handleFilesUploaded also preserves the selected workspace dir', () => {
    const { result } = renderHook(() => useGuidInput({ locationState: null }));

    act(() => {
      result.current.setDir('/Users/me/projects/my-project');
      result.current.handleFilesUploaded(['/tmp/c.pdf']);
    });

    expect(result.current.files).toEqual(['/tmp/c.pdf']);
    expect(result.current.dir).toBe('/Users/me/projects/my-project');
  });
});
