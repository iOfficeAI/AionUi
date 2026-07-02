/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ipcBridge } from '@/common';
import { useAutoPreviewOfficeFiles } from '@/renderer/hooks/file/useAutoPreviewOfficeFiles';

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      listWorkspaceFiles: { invoke: vi.fn() },
    },
    workspaceOfficeWatch: {
      start: { invoke: vi.fn() },
      stop: { invoke: vi.fn() },
      fileAdded: { on: vi.fn() },
    },
  },
}));

vi.mock('@/renderer/hooks/system/useAutoPreviewOfficeFilesEnabled', () => ({
  useAutoPreviewOfficeFilesEnabled: () => true,
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({
    findPreviewTab: vi.fn(),
    openPreview: vi.fn(),
  }),
}));

describe('useAutoPreviewOfficeFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ipcBridge.workspaceOfficeWatch.start.invoke).mockResolvedValue(undefined);
    vi.mocked(ipcBridge.workspaceOfficeWatch.stop.invoke).mockResolvedValue(undefined);
    vi.mocked(ipcBridge.workspaceOfficeWatch.fileAdded.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.fs.listWorkspaceFiles.invoke).mockResolvedValue([]);
  });

  it('lists workspace files by workspace root', async () => {
    renderHook(() => useAutoPreviewOfficeFiles({ conversation_id: 'conversation-1', workspace: '/Volumes/project' }));

    await waitFor(() => {
      expect(ipcBridge.fs.listWorkspaceFiles.invoke).toHaveBeenCalledWith({
        root: '/Volumes/project',
      });
    });
  });
});
