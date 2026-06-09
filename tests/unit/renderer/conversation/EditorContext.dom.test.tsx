/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import React, { type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcBridge } from '@/common';
import { EDITOR_MAX_EDITABLE_BYTES } from '@/renderer/pages/conversation/Editor/editorLanguage';
import { EditorProvider, useEditorContext } from '@/renderer/pages/conversation/Editor/EditorContext';

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      getFileMetadata: { invoke: vi.fn() },
      readFile: { invoke: vi.fn() },
      writeFile: { invoke: vi.fn() },
    },
    dialog: {
      showOpen: { invoke: vi.fn() },
      showSave: { invoke: vi.fn() },
    },
    // Save flow snapshots to Local History after the disk write succeeds.
    // The test's IPC mock predates that wiring — stub it so the save
    // `try` block doesn't throw and `originalContent` still updates.
    localHistory: {
      addSnapshot: { invoke: vi.fn().mockResolvedValue({ success: true }) },
    },
  },
}));

// Layout mode is read from a module-level in-memory ref. The default
// mode ('chat') blocks editor open/close — tests below force the
// 'command-center' mode so the provider's gate is open.
import * as layoutModeStorage from '@/renderer/utils/layout/layoutModeStorage';
import { syncActiveLayoutMode } from '@/renderer/utils/layout/layoutModeStorage';

type MockedIpcBridge = {
  fs: {
    getFileMetadata: { invoke: ReturnType<typeof vi.fn> };
    readFile: { invoke: ReturnType<typeof vi.fn> };
    writeFile: { invoke: ReturnType<typeof vi.fn> };
  };
  dialog: {
    showOpen: { invoke: ReturnType<typeof vi.fn> };
    showSave: { invoke: ReturnType<typeof vi.fn> };
  };
};

const mockedIpcBridge = ipcBridge as unknown as MockedIpcBridge;

// Force the layout mode to 'command-center' for the entire test file
// so the editor is accessible. The function is module-scoped, so
// importing it gives us a stable handle to the in-memory ref.
vi.spyOn(layoutModeStorage, 'isEditorAccessibleInLayoutMode').mockReturnValue(true);
// `syncActiveLayoutMode` is already exported; call it directly in
// beforeEach to reset the ref between tests.
void syncActiveLayoutMode;

const getActiveBuffer = (ctx: ReturnType<typeof useEditorContext>) => ctx.activeBuffer;

describe('EditorContext', () => {
  const wrapper = ({ children }: { children: ReactNode }) => <EditorProvider>{children}</EditorProvider>;

  beforeEach(() => {
    vi.clearAllMocks();
    syncActiveLayoutMode('command-center');
    mockedIpcBridge.fs.getFileMetadata.invoke.mockResolvedValue({
      name: 'file.ts',
      path: '/workspace/file.ts',
      size: 100,
      type: 'file',
      lastModified: 10,
    });
    mockedIpcBridge.fs.readFile.invoke.mockResolvedValue('original');
    mockedIpcBridge.fs.writeFile.invoke.mockResolvedValue(true);
    mockedIpcBridge.dialog.showOpen.invoke.mockResolvedValue(['/workspace/file.ts']);
    mockedIpcBridge.dialog.showSave.invoke.mockResolvedValue('/workspace/saved.ts');
  });

  afterEach(() => {
    cleanup();
  });

  it('opens a file and initializes a clean editor buffer', async () => {
    const { result } = renderHook(() => useEditorContext(), { wrapper });

    await act(async () => {
      await result.current.openEditorFile({ path: '/workspace/file.ts', workspace: '/workspace' });
    });

    expect(result.current.isOpen).toBe(true);
    expect(getActiveBuffer(result.current)?.fileName).toBe('file.ts');
    expect(getActiveBuffer(result.current)?.content).toBe('original');
    expect(getActiveBuffer(result.current)?.language).toBe('typescript');
    expect(result.current.isDirty).toBe(false);
  });

  it('marks edited content dirty and clears dirty state after saving', async () => {
    const { result } = renderHook(() => useEditorContext(), { wrapper });

    await act(async () => {
      await result.current.openEditorFile({ path: '/workspace/file.ts', workspace: '/workspace' });
    });
    act(() => {
      result.current.setEditorContent('modified');
    });

    expect(result.current.isDirty).toBe(true);

    await act(async () => {
      await result.current.saveEditorFile();
    });

    expect(mockedIpcBridge.fs.writeFile.invoke).toHaveBeenCalledWith({ path: '/workspace/file.ts', data: 'modified' });
    expect(result.current.isDirty).toBe(false);
  });

  it('queues a pending open action instead of replacing dirty content', async () => {
    const { result } = renderHook(() => useEditorContext(), { wrapper });

    await act(async () => {
      await result.current.openEditorFile({ path: '/workspace/file.ts', workspace: '/workspace' });
    });
    act(() => {
      result.current.setEditorContent('modified');
    });
    await act(async () => {
      await result.current.openEditorFile({ path: '/workspace/next.ts', workspace: '/workspace' });
    });

    expect(getActiveBuffer(result.current)?.filePath).toBe('/workspace/file.ts');
    expect(result.current.pendingAction).toEqual({
      type: 'open-file',
      request: { path: '/workspace/next.ts', workspace: '/workspace' },
    });
  });

  it('rejects oversized files before reading their content', async () => {
    mockedIpcBridge.fs.getFileMetadata.invoke.mockResolvedValueOnce({
      name: 'huge.ts',
      path: '/workspace/huge.ts',
      size: EDITOR_MAX_EDITABLE_BYTES + 1,
      type: 'file',
      lastModified: 10,
    });
    const { result } = renderHook(() => useEditorContext(), { wrapper });

    await act(async () => {
      await result.current.openEditorFile({ path: '/workspace/huge.ts', workspace: '/workspace' });
    });

    expect(mockedIpcBridge.fs.readFile.invoke).not.toHaveBeenCalled();
    expect(getActiveBuffer(result.current)).toBeNull();
  });
});
