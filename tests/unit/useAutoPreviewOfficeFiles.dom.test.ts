/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for useAutoPreviewOfficeFiles hook:
 * - WriteFile Success with .pptx triggers openPreview
 * - WriteFile Success with .ts does NOT trigger
 * - Bash Success with "Saved to report.docx" triggers openPreview
 * - Same callId does NOT trigger twice (dedup)
 * - Already-open tab (findPreviewTab returns truthy) does NOT call openPreview
 * - Tool status 'Executing' does NOT trigger
 * - Multiple messages: only fires for the new one added
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act } from '@testing-library/react';

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockFindPreviewTab = vi.fn();
const mockOpenPreview = vi.fn();

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({
    findPreviewTab: mockFindPreviewTab,
    openPreview: mockOpenPreview,
  }),
}));

const mockGetFileTypeInfo = vi.fn();
vi.mock('@/renderer/utils/file/fileType', () => ({
  getFileTypeInfo: (...args: unknown[]) => mockGetFileTypeInfo(...args),
}));

vi.mock('@/common/chat/chatLib', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/common/chat/chatLib')>();
  return {
    ...actual,
    joinPath: (base: string, rel: string) => `${base}/${rel}`,
  };
});

// Import after mocks
import { useAutoPreviewOfficeFiles } from '../../src/renderer/hooks/file/useAutoPreviewOfficeFiles';
import type { IMessageToolGroup } from '../../src/common/chat/chatLib';

// ── Helpers ─────────────────────────────────────────────────────────────────

type ToolEntry = IMessageToolGroup['content'][number];

function makeToolGroup(tools: ToolEntry[]): IMessageToolGroup {
  return {
    id: 'msg-1',
    type: 'tool_group',
    position: 'left',
    conversation_id: 'conv-1',
    content: tools,
    createdAt: Date.now(),
  };
}

function makeWriteFileTool(callId: string, fileName: string, status: ToolEntry['status'] = 'Success'): ToolEntry {
  return {
    callId,
    name: 'WriteFile',
    description: 'Write a file',
    renderOutputAsMarkdown: false,
    status,
    resultDisplay: { fileName, fileDiff: '' },
  };
}

function makeBashTool(callId: string, output: string, status: ToolEntry['status'] = 'Success'): ToolEntry {
  return {
    callId,
    name: 'Bash',
    description: 'Run a bash command',
    renderOutputAsMarkdown: false,
    status,
    resultDisplay: output,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useAutoPreviewOfficeFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no existing tab open, file type returns 'ppt'
    mockFindPreviewTab.mockReturnValue(null);
    mockGetFileTypeInfo.mockReturnValue({ contentType: 'ppt' });
  });

  it('WriteFile Success with .pptx triggers openPreview', async () => {
    const tool = makeWriteFileTool('call-1', 'slides.pptx');
    const messages = [makeToolGroup([tool])];

    renderHook(() => useAutoPreviewOfficeFiles(messages, '/workspace'));

    await act(async () => {});

    expect(mockOpenPreview).toHaveBeenCalledOnce();
    expect(mockOpenPreview).toHaveBeenCalledWith(
      '',
      'ppt',
      expect.objectContaining({
        filePath: '/workspace/slides.pptx',
        fileName: 'slides.pptx',
      })
    );
  });

  it('WriteFile Success with .ts does NOT trigger openPreview', async () => {
    const tool = makeWriteFileTool('call-ts', 'index.ts');
    const messages = [makeToolGroup([tool])];

    renderHook(() => useAutoPreviewOfficeFiles(messages, '/workspace'));

    await act(async () => {});

    expect(mockOpenPreview).not.toHaveBeenCalled();
  });

  it('Bash Success with "Saved to report.docx" triggers openPreview', async () => {
    mockGetFileTypeInfo.mockReturnValue({ contentType: 'word' });
    const tool = makeBashTool('call-bash', 'Saved to report.docx');
    const messages = [makeToolGroup([tool])];

    renderHook(() => useAutoPreviewOfficeFiles(messages, '/workspace'));

    await act(async () => {});

    expect(mockOpenPreview).toHaveBeenCalledOnce();
    expect(mockOpenPreview).toHaveBeenCalledWith(
      '',
      'word',
      expect.objectContaining({
        filePath: '/workspace/report.docx',
        fileName: 'report.docx',
      })
    );
  });

  it('same callId does NOT trigger openPreview twice (dedup)', async () => {
    mockGetFileTypeInfo.mockReturnValue({ contentType: 'ppt' });
    const tool = makeWriteFileTool('call-dedup', 'deck.pptx');
    const initialMessages = [makeToolGroup([tool])];

    const { rerender } = renderHook(
      ({ messages, workspace }: { messages: typeof initialMessages; workspace: string }) =>
        useAutoPreviewOfficeFiles(messages, workspace),
      { initialProps: { messages: initialMessages, workspace: '/workspace' } }
    );

    await act(async () => {});

    expect(mockOpenPreview).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    mockFindPreviewTab.mockReturnValue(null);
    mockGetFileTypeInfo.mockReturnValue({ contentType: 'ppt' });

    // Re-render with the same messages (same callId) — should not fire again
    rerender({ messages: initialMessages, workspace: '/workspace' });

    await act(async () => {});

    expect(mockOpenPreview).not.toHaveBeenCalled();
  });

  it('already-open tab (findPreviewTab returns truthy) does NOT call openPreview', async () => {
    mockGetFileTypeInfo.mockReturnValue({ contentType: 'ppt' });
    mockFindPreviewTab.mockReturnValue({ id: 'existing-tab', type: 'ppt', content: '' });

    const tool = makeWriteFileTool('call-open', 'already-open.pptx');
    const messages = [makeToolGroup([tool])];

    renderHook(() => useAutoPreviewOfficeFiles(messages, '/workspace'));

    await act(async () => {});

    expect(mockFindPreviewTab).toHaveBeenCalled();
    expect(mockOpenPreview).not.toHaveBeenCalled();
  });

  it("tool status 'Executing' does NOT trigger openPreview", async () => {
    const tool = makeWriteFileTool('call-exec', 'slides.pptx', 'Executing');
    const messages = [makeToolGroup([tool])];

    renderHook(() => useAutoPreviewOfficeFiles(messages, '/workspace'));

    await act(async () => {});

    expect(mockOpenPreview).not.toHaveBeenCalled();
  });

  it('multiple messages: only fires for newly added tool calls', async () => {
    mockGetFileTypeInfo.mockReturnValue({ contentType: 'word' });

    const tool1 = makeWriteFileTool('call-first', 'first.docx');
    const initialMessages = [makeToolGroup([tool1])];

    const { rerender } = renderHook(
      ({ messages, workspace }: { messages: typeof initialMessages; workspace: string }) =>
        useAutoPreviewOfficeFiles(messages, workspace),
      { initialProps: { messages: initialMessages, workspace: '/workspace' } }
    );

    await act(async () => {});

    expect(mockOpenPreview).toHaveBeenCalledOnce();
    expect(mockOpenPreview).toHaveBeenCalledWith('', 'word', expect.objectContaining({ fileName: 'first.docx' }));

    vi.clearAllMocks();
    mockFindPreviewTab.mockReturnValue(null);
    mockGetFileTypeInfo.mockReturnValue({ contentType: 'excel' });

    // Add a second tool call message
    const tool2 = makeWriteFileTool('call-second', 'data.xlsx');
    const updatedMessages = [makeToolGroup([tool1]), makeToolGroup([tool2])];

    rerender({ messages: updatedMessages, workspace: '/workspace' });

    await act(async () => {});

    // Should only fire for the NEW tool (tool2), not tool1 again
    expect(mockOpenPreview).toHaveBeenCalledOnce();
    expect(mockOpenPreview).toHaveBeenCalledWith('', 'excel', expect.objectContaining({ fileName: 'data.xlsx' }));
  });
});
