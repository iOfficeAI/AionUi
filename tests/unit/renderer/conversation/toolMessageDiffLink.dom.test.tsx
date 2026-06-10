/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Bet A4 — close the "tool message → Pierre diff → open file at line" loop.
 *
 * Covers the four moving parts touched in this change:
 *   1. `FileChangesPanel` exposes a real <button> "View diff" affordance
 *      when `onDiffClick` is provided.
 *   2. `useDiffPreviewHandlers.handleDiffClick` propagates the file path
 *      into `launchPreview` (as `relativePath`) so the launcher can
 *      resolve `metadata.file_path`.
 *   3. `MessageToolCall` integration: clicking the new "View diff" button
 *      on a Replace/Edit tool-call message fires `launchPreview` with
 *      `contentType: 'diff'` and a `diffContent` containing both the
 *      old and new strings.
 *   4. `DiffViewer` (DiffPreview) passes `metadata.file_path` through
 *      to the underlying Pierre `DiffView`, which is what enables
 *      `requestEditorRevealLine` + `ipcBridge.shell.openFile` to land
 *      on the real file when the user clicks a line.
 *   5. `usePreviewLauncher` (pin) — when `contentType === 'diff'` and
 *      `diffContent` is provided, it skips the disk-read branch but
 *      still resolves `metadata.file_path` to the joined absolute path
 *      (when a workspace is known).
 */

import type { IMessageToolCall } from '@/common/chat/chatLib';
import { ipcBridge } from '@/common';
import { useDiffPreviewHandlers } from '@/renderer/hooks/file/useDiffPreviewHandlers';
import { usePreviewLauncher } from '@/renderer/hooks/file/usePreviewLauncher';
import DiffPreview from '@/renderer/pages/conversation/Preview/components/viewers/DiffViewer';
import MessageToolCall from '@/renderer/pages/conversation/Messages/components/MessageToolCall';
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import FileChangesPanel, { type FileChangeItem } from '@/renderer/components/base/FileChangesPanel';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import React, { type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  // Captured from the stubbed PreviewContext.openPreview (a single object
  // holding the most recent invocation). Both the useDiffPreviewHandlers
  // test and the usePreviewLauncher pin test assert on this.
  openPreview: undefined as
    | undefined
    | {
        content: string;
        type: string;
        metadata?: Record<string, unknown>;
      },
  diffViewProps: undefined as undefined | Record<string, unknown>,
}));

// Stub the full PreviewContext tree: the diff launcher only needs
// `openPreview` to be captured so the test can assert on the resolved
// metadata, not the entire preview state machine.
vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({
    openPreview: vi.fn((content: string, type: string, metadata?: unknown) => {
      h.openPreview = { content, type, metadata: metadata as Record<string, unknown> };
    }),
    closePreview: vi.fn(),
    closeTab: vi.fn(),
    switchTab: vi.fn(),
    updateContent: vi.fn(),
    saveContent: vi.fn(),
    findPreviewTab: vi.fn(() => null),
    closePreviewByIdentity: vi.fn(),
    addToSendBox: vi.fn(),
    setSendBoxHandler: vi.fn(),
    domSnippets: [],
    addDomSnippet: vi.fn(),
    removeDomSnippet: vi.fn(),
    clearDomSnippets: vi.fn(),
    isOpen: false,
    tabs: [],
    activeTabId: null,
    activeTab: null,
  }),
  PreviewProvider: ({ children }: { children: ReactNode }) => children,
}));

// Stub the heavy Monaco / Pierre renderer. The actual integration under
// test is that `DiffPreview` forwards `metadata.file_path` to `DiffView`;
// we capture those props here and assert on the captured object.
vi.mock('@/renderer/components/media/DiffView', () => ({
  default: (props: Record<string, unknown>) => {
    h.diffViewProps = props;
    return <div data-testid='diff-view-mock' />;
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      // The pin test for usePreviewLauncher's diff branch must not touch
      // the disk; an empty stub keeps the launcher in the diff branch.
      getImageBase64: { invoke: vi.fn() },
      readFile: { invoke: vi.fn() },
    },
    conversation: {},
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    // Map the keys used in this test to their human labels so accessible-name
    // queries find the new <button> ("View diff") and the existing Preview
    // span. Falls back to the key (then to params.defaultValue) so other
    // strings used by the rendered tree still render something legible.
    t: (key: string, params?: { defaultValue?: string }): string => {
      const map: Record<string, string> = {
        'preview.viewDiff': 'View diff',
        'preview.preview': 'Preview',
        'messages.toolShell.stateDone': 'Done',
      };
      if (map[key]) return map[key];
      if (params?.defaultValue) return params.defaultValue;
      return key;
    },
  }),
}));

vi.mock('@/renderer/pages/conversation/Editor', () => ({
  useEditorContextSafe: () => null,
}));

vi.mock('@/renderer/utils/previewError', () => ({
  classifyPreviewError: () => 'unknown',
}));

const conversationWrapper = ({ children }: { children: ReactNode }) => (
  <ConversationProvider value={{ conversation_id: 'conv-1', type: 'acp', workspace: '/workspace/proj' }}>
    {children}
  </ConversationProvider>
);

// ---------------------------------------------------------------------------
// 1. FileChangesPanel: <button> "View diff" affordance
// ---------------------------------------------------------------------------

describe('FileChangesPanel — View diff button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const sampleFiles: FileChangeItem[] = [
    { file_name: 'a.ts', fullPath: '/workspace/proj/src/a.ts', insertions: 3, deletions: 1 },
    { file_name: 'b.ts', fullPath: '/workspace/proj/src/b.ts', insertions: 1, deletions: 0 },
  ];

  it('renders a real <button> for each file row when onDiffClick is provided', () => {
    const onDiffClick = vi.fn();
    render(<FileChangesPanel title='Files' files={sampleFiles} onDiffClick={onDiffClick} />);

    const buttons = screen.getAllByRole('button', { name: 'View diff' });
    expect(buttons).toHaveLength(sampleFiles.length);
    for (const btn of buttons) {
      expect(btn.tagName).toBe('BUTTON');
      expect(btn).toHaveAttribute('type', 'button');
    }
  });

  it('clicking the View diff button fires onDiffClick with the matching file and stops propagation', () => {
    const onDiffClick = vi.fn();
    render(
      <div onClick={() => onDiffClick('parent-bubbled')}>
        <FileChangesPanel title='Files' files={sampleFiles} onDiffClick={onDiffClick} />
      </div>
    );

    const buttons = screen.getAllByRole('button', { name: 'View diff' });
    fireEvent.click(buttons[0]);

    // The first call from the click is the button itself; the parent
    // bubble would have fired 'parent-bubbled'. We assert the button
    // produced a real, file-scoped invocation and the parent didn't
    // receive a synthetic click (event.stopPropagation in the handler).
    expect(onDiffClick).toHaveBeenCalledWith(sampleFiles[0]);
    expect(onDiffClick).not.toHaveBeenCalledWith('parent-bubbled');
  });

  it('omits the View diff button entirely when onDiffClick is not provided', () => {
    render(<FileChangesPanel title='Files' files={sampleFiles} onFileClick={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'View diff' })).not.toBeInTheDocument();
    // The legacy +N/-M stats span still renders (pre-existing pattern);
    // the new affordance does not.
    expect(screen.getAllByText('+3').length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 2. useDiffPreviewHandlers: handleDiffClick → launchPreview (real launcher)
// ---------------------------------------------------------------------------

describe('useDiffPreviewHandlers — handleDiffClick path propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.openPreview = undefined;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes the source path as relativePath, sets contentType=diff, and forwards diffText verbatim', async () => {
    const { result } = renderHook(
      () =>
        useDiffPreviewHandlers({
          diffText: '--- a/foo.ts\n+++ b/foo.ts\n-old\n+new',
          display_name: 'foo.ts',
          file_path: 'src/foo.ts',
        }),
      { wrapper: conversationWrapper }
    );

    act(() => {
      result.current.handleDiffClick({ file_name: 'foo.ts', fullPath: 'src/foo.ts', insertions: 1, deletions: 1 });
    });

    // The real usePreviewLauncher is async — wait for openPreview to land.
    await waitFor(() => expect(h.openPreview).toBeDefined());
    const captured = h.openPreview as unknown as { content: string; type: string; metadata?: Record<string, unknown> };
    expect(captured.type).toBe('diff');
    expect(captured.content).toBe('--- a/foo.ts\n+++ b/foo.ts\n-old\n+new');
    // With a known workspace, metadata.file_path must be the joined absolute path.
    expect(captured.metadata?.file_path).toBe('/workspace/proj/src/foo.ts');
    expect(captured.metadata?.file_name).toBe('foo.ts');
  });
});

// ---------------------------------------------------------------------------
// 3. MessageToolCall integration: View diff button → launchPreview
// ---------------------------------------------------------------------------

describe('MessageToolCall — Edit tool-call message → View diff integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.openPreview = undefined;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const buildEditMessage = (): IMessageToolCall =>
    ({
      id: 'tc-1',
      type: 'tool_call',
      position: 'left',
      conversation_id: 'conv-1',
      created_at: 0,
      content: {
        call_id: 'call-1',
        name: 'Edit',
        args: {
          file_path: 'src/greeter.ts',
          old_string: "export const greet = () => 'hi';\n",
          new_string: 'export const greet = (name: string) => `hello ${name}`;\n',
        },
        status: 'completed',
      },
    }) as IMessageToolCall;

  it('renders the View diff button and clicking it fires launchPreview with both old and new content embedded in diffContent', async () => {
    render(
      <ConversationProvider value={{ conversation_id: 'conv-1', type: 'acp', workspace: '/workspace/proj' }}>
        <MessageToolCall message={buildEditMessage()} />
      </ConversationProvider>
    );

    const viewDiffButton = await screen.findByRole('button', { name: 'View diff' });
    expect(viewDiffButton).toBeInTheDocument();

    fireEvent.click(viewDiffButton);

    await waitFor(() => expect(h.openPreview).toBeDefined());

    const captured = h.openPreview as unknown as { content: string; type: string; metadata?: Record<string, unknown> };
    expect(captured.type).toBe('diff');

    const diffContent = captured.content;
    // Both old and new strings must appear in the unified patch so the
    // diff renderer can show them on either side of the comparison.
    expect(diffContent).toContain("export const greet = () => 'hi';");
    expect(diffContent).toContain('export const greet = (name: string) => `hello ${name}`;');
    // Path is propagated through to metadata so click-to-jump can resolve.
    expect(captured.metadata?.file_path).toBe('/workspace/proj/src/greeter.ts');
  });
});

// ---------------------------------------------------------------------------
// 4. DiffPreview → DiffView forwards metadata.file_path
// ---------------------------------------------------------------------------

describe('DiffPreview — metadata.file_path propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.diffViewProps = undefined;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const sampleDiff = '--- a/src/a.ts\n+++ b/src/a.ts\n-old line\n+new line\n';

  it('passes the absolute file_path from metadata to Pierre DiffView and the diff body verbatim', () => {
    render(
      <DiffPreview
        content={sampleDiff}
        metadata={{ file_path: '/abs/proj/src/a.ts', file_name: 'a.ts' }}
        viewMode='preview'
        onViewModeChange={() => {}}
      />
    );

    expect(h.diffViewProps).toBeDefined();
    const props = h.diffViewProps as unknown as Record<string, unknown>;
    expect(props.file_path).toBe('/abs/proj/src/a.ts');
    expect(props.diff).toBe(sampleDiff);
  });
});

// ---------------------------------------------------------------------------
// 5. usePreviewLauncher: diff branch pin
// ---------------------------------------------------------------------------

describe('usePreviewLauncher — diff branch pins metadata.file_path without disk read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.openPreview = undefined;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('with a workspace context, contentType=diff + diffContent, resolves metadata.file_path to the joined absolute path', async () => {
    const { result } = renderHook(() => usePreviewLauncher(), { wrapper: conversationWrapper });

    await act(async () => {
      await result.current.launchPreview({
        relativePath: 'src/a.ts',
        file_name: 'a.ts',
        contentType: 'diff',
        editable: false,
        language: 'diff',
        diffContent: '--- a/src/a.ts\n+++ b/src/a.ts\n',
      });
    });

    // The diff branch must call openPreview (so the PreviewPanel
    // re-renders) and must NOT call fs.readFile (the file on disk
    // would be the unedited original, not the patch).
    expect(h.openPreview).toBeDefined();
    const captured = h.openPreview as unknown as { content: string; type: string; metadata?: Record<string, unknown> };
    expect(captured.type).toBe('diff');
    expect(captured.content).toContain('--- a/src/a.ts');
    expect(captured.metadata?.file_path).toBe('/workspace/proj/src/a.ts');

    // The mocked ipcBridge.fs.readFile.invoke should never have been
    // called because the launcher must short-circuit to the diff branch.
    const bridge = ipcBridge as unknown as { fs: { readFile: { invoke: ReturnType<typeof vi.fn> } } };
    expect(bridge.fs.readFile.invoke).not.toHaveBeenCalled();
  });
});
