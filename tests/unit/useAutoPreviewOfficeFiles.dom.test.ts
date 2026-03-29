/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for useAutoPreviewOfficeFiles hook.
 *
 * Core rule: auto-preview only fires for tool calls that become Success
 * AFTER the component mounts (user watched it happen). Tool calls that are
 * already Success at mount time are treated as historical and never trigger.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

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

import { useAutoPreviewOfficeFiles } from '../../src/renderer/hooks/file/useAutoPreviewOfficeFiles';
import type { IMessageToolGroup } from '../../src/common/chat/chatLib';

// ── Helpers ─────────────────────────────────────────────────────────────────

type ToolEntry = IMessageToolGroup['content'][number];

function makeToolGroup(tools: ToolEntry[], msgId = 'msg-1'): IMessageToolGroup {
  return {
    id: msgId,
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
    mockFindPreviewTab.mockReturnValue(null);
    mockGetFileTypeInfo.mockReturnValue({ contentType: 'ppt' });
  });

  it('tool already Success at mount (historical) does NOT trigger', async () => {
    const tool = makeWriteFileTool('call-historical', 'old.pptx');
    renderHook(() => useAutoPreviewOfficeFiles([makeToolGroup([tool])], '/workspace'));
    await act(async () => {});
    expect(mockOpenPreview).not.toHaveBeenCalled();
  });

  it('tool becomes Success after mount (user watching) triggers openPreview', async () => {
    const executing = makeWriteFileTool('call-1', 'slides.pptx', 'Executing');
    const success = makeWriteFileTool('call-1', 'slides.pptx', 'Success');

    const { rerender } = renderHook(
      ({ messages }: { messages: IMessageToolGroup[] }) =>
        useAutoPreviewOfficeFiles(messages, '/workspace'),
      { initialProps: { messages: [makeToolGroup([executing])] } }
    );
    await act(async () => {});
    expect(mockOpenPreview).not.toHaveBeenCalled();

    rerender({ messages: [makeToolGroup([success])] });
    await act(async () => {});

    expect(mockOpenPreview).toHaveBeenCalledOnce();
    expect(mockOpenPreview).toHaveBeenCalledWith(
      '',
      'ppt',
      expect.objectContaining({ filePath: '/workspace/slides.pptx', fileName: 'slides.pptx' })
    );
  });

  it('WriteFile with non-office extension does NOT trigger', async () => {
    const executing = makeWriteFileTool('call-ts', 'index.ts', 'Executing');
    const success = makeWriteFileTool('call-ts', 'index.ts', 'Success');

    const { rerender } = renderHook(
      ({ messages }: { messages: IMessageToolGroup[] }) =>
        useAutoPreviewOfficeFiles(messages, '/workspace'),
      { initialProps: { messages: [makeToolGroup([executing])] } }
    );
    await act(async () => {});

    rerender({ messages: [makeToolGroup([success])] });
    await act(async () => {});

    expect(mockOpenPreview).not.toHaveBeenCalled();
  });

  it('Bash output "Saved to report.docx" triggers openPreview', async () => {
    mockGetFileTypeInfo.mockReturnValue({ contentType: 'word' });
    const executing = makeBashTool('call-bash', '', 'Executing');
    const success = makeBashTool('call-bash', 'Saved to report.docx', 'Success');

    const { rerender } = renderHook(
      ({ messages }: { messages: IMessageToolGroup[] }) =>
        useAutoPreviewOfficeFiles(messages, '/workspace'),
      { initialProps: { messages: [makeToolGroup([executing])] } }
    );
    await act(async () => {});

    rerender({ messages: [makeToolGroup([success])] });
    await act(async () => {});

    expect(mockOpenPreview).toHaveBeenCalledOnce();
    expect(mockOpenPreview).toHaveBeenCalledWith(
      '',
      'word',
      expect.objectContaining({ filePath: '/workspace/report.docx', fileName: 'report.docx' })
    );
  });

  it('same callId does NOT trigger twice (dedup)', async () => {
    const executing = makeWriteFileTool('call-dedup', 'deck.pptx', 'Executing');
    const success = makeWriteFileTool('call-dedup', 'deck.pptx', 'Success');

    const { rerender } = renderHook(
      ({ messages }: { messages: IMessageToolGroup[] }) =>
        useAutoPreviewOfficeFiles(messages, '/workspace'),
      { initialProps: { messages: [makeToolGroup([executing])] } }
    );
    await act(async () => {});

    rerender({ messages: [makeToolGroup([success])] });
    await act(async () => {});
    expect(mockOpenPreview).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    mockFindPreviewTab.mockReturnValue(null);
    mockGetFileTypeInfo.mockReturnValue({ contentType: 'ppt' });

    // Re-render again with same messages — callId already in firedRef
    rerender({ messages: [makeToolGroup([success])] });
    await act(async () => {});
    expect(mockOpenPreview).not.toHaveBeenCalled();
  });

  it('already-open tab does NOT call openPreview', async () => {
    mockGetFileTypeInfo.mockReturnValue({ contentType: 'ppt' });
    mockFindPreviewTab.mockReturnValue({ id: 'existing-tab' });

    const executing = makeWriteFileTool('call-open', 'already-open.pptx', 'Executing');
    const success = makeWriteFileTool('call-open', 'already-open.pptx', 'Success');

    const { rerender } = renderHook(
      ({ messages }: { messages: IMessageToolGroup[] }) =>
        useAutoPreviewOfficeFiles(messages, '/workspace'),
      { initialProps: { messages: [makeToolGroup([executing])] } }
    );
    await act(async () => {});

    rerender({ messages: [makeToolGroup([success])] });
    await act(async () => {});

    expect(mockFindPreviewTab).toHaveBeenCalled();
    expect(mockOpenPreview).not.toHaveBeenCalled();
  });

  it('new tool added after mount triggers; historical tool does not re-trigger', async () => {
    mockGetFileTypeInfo.mockReturnValue({ contentType: 'word' });

    // tool1 is already Success at mount → historical
    const tool1 = makeWriteFileTool('call-first', 'first.docx', 'Success');
    // tool2 starts as Executing
    const tool2Executing = makeWriteFileTool('call-second', 'data.xlsx', 'Executing');

    const { rerender } = renderHook(
      ({ messages }: { messages: IMessageToolGroup[] }) =>
        useAutoPreviewOfficeFiles(messages, '/workspace'),
      { initialProps: { messages: [makeToolGroup([tool1]), makeToolGroup([tool2Executing], 'msg-2')] } }
    );
    await act(async () => {});
    expect(mockOpenPreview).not.toHaveBeenCalled();

    // tool2 completes
    mockGetFileTypeInfo.mockReturnValue({ contentType: 'excel' });
    const tool2Success = makeWriteFileTool('call-second', 'data.xlsx', 'Success');
    rerender({ messages: [makeToolGroup([tool1]), makeToolGroup([tool2Success], 'msg-2')] });
    await act(async () => {});

    expect(mockOpenPreview).toHaveBeenCalledOnce();
    expect(mockOpenPreview).toHaveBeenCalledWith('', 'excel', expect.objectContaining({ fileName: 'data.xlsx' }));
  });
});
