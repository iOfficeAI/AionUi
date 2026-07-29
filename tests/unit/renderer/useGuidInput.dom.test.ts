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

    // Paste/drag bytes are uploaded to the managed dir → `upload` refs.
    expect(result.current.files).toEqual([
      { kind: 'upload', path: '/tmp/a.png' },
      { kind: 'upload', path: '/tmp/b.txt' },
    ]);
    expect(result.current.dir).toBe('/Users/me/projects/my-project');
  });

  it('handleFilesUploaded also preserves the selected workspace dir', () => {
    const { result } = renderHook(() => useGuidInput({ locationState: null }));

    act(() => {
      result.current.setDir('/Users/me/projects/my-project');
      result.current.handleFilesUploaded(['/tmp/c.pdf']);
    });

    expect(result.current.files).toEqual([{ kind: 'upload', path: '/tmp/c.pdf' }]);
    expect(result.current.dir).toBe('/Users/me/projects/my-project');
  });
});

describe('useGuidInput — source-tagged file kinds', () => {
  // Tripwire: the Guid "Add files" entry (backend-machine picker) must produce
  // `local` refs, while device uploads/paste produce `upload`. If handleFilesPicked
  // is ever wired to uploadFileRef, this flips to `upload` and fails.
  it('handleFilesPicked tags backend-machine picks as local refs', () => {
    const { result } = renderHook(() => useGuidInput({ locationState: null }));

    act(() => {
      result.current.handleFilesPicked(['/backend/abs/a.ts', '/backend/abs/b.ts']);
    });

    expect(result.current.files).toEqual([
      { kind: 'local', path: '/backend/abs/a.ts' },
      { kind: 'local', path: '/backend/abs/b.ts' },
    ]);
  });

  it('keeps local (picked) and upload (device) kinds distinct in one list', () => {
    const { result } = renderHook(() => useGuidInput({ locationState: null }));

    act(() => {
      result.current.handleFilesPicked(['/backend/local.ts']);
      result.current.handleFilesUploaded(['/tmp/upload.png']);
    });

    expect(result.current.files).toEqual([
      { kind: 'local', path: '/backend/local.ts' },
      { kind: 'upload', path: '/tmp/upload.png' },
    ]);
  });

  it('handleRemoveFile removes by the ref path regardless of kind', () => {
    const { result } = renderHook(() => useGuidInput({ locationState: null }));

    act(() => {
      result.current.handleFilesPicked(['/backend/local.ts']);
      result.current.handleFilesUploaded(['/tmp/upload.png']);
    });
    act(() => {
      result.current.handleRemoveFile('/backend/local.ts');
    });

    expect(result.current.files).toEqual([{ kind: 'upload', path: '/tmp/upload.png' }]);
  });
});
