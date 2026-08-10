/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tripwire for "add a folder (incl. a pe ROOT) to chat → chip appears".
 *
 * The Explorer tree's add-to-chat builds a project `chatRef`. A pe ROOT is a
 * folder whose `relative_path` is '' (so `item.path` is the empty string), and a
 * directory has `isFile === false`. Three independent gates inside SendBox used
 * to drop such an item even though the backend resolves a directory ref fine:
 *   gate-1 identity: dedup/ownership keyed on `item.path` ('' → treated as "no
 *          path" and dropped, and two roots collided on '').
 *   gate-2 render key: the chip's React key read `item.path` directly ('' for
 *          every root → duplicate keys).
 *   gate-3 render filter: `unmatchedSelectedWorkspaceItems` dropped every
 *          `!item.isFile` (folder) item.
 *
 * This test drives the real emitter append lane through a harness that mirrors
 * AcpSendBox's own merge-into-state wiring, so the full path (append →
 * mergeFileSelectionItems → SendBox ownership → gate-3 filter → chip) runs.
 *
 * Mutation checks (documented for the reviewer):
 *   - revert getSelectedItemKey to `item.path` → the "two pe roots" case loses a
 *     chip (both collapse onto the '' key in buildOwnedSelectionItems).
 *   - revert the gate-3 filter to `!item.isFile` → every folder case loses its
 *     chip.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

const CONVERSATION_ID = 'folder-chip-conversation';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      listAvailableSkills: { invoke: vi.fn().mockResolvedValue([]) },
      listWorkspaceFiles: { invoke: vi.fn().mockResolvedValue([]) },
    },
  },
}));

vi.mock('@/renderer/hooks/chat/useInputFocusRing', () => ({
  useInputFocusRing: () => ({
    activeBorderColor: 'var(--color-primary-6)',
    inactiveBorderColor: 'var(--color-border-2)',
    activeShadow: 'none',
  }),
}));

vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => ({
    conversation_id: CONVERSATION_ID,
    type: 'acp',
  }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({
    setSendBoxHandler: vi.fn(),
    domSnippets: [],
    removeDomSnippet: vi.fn(),
    clearDomSnippets: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({
  useMessageList: () => [],
}));

vi.mock('@/renderer/hooks/file/useConversationExport', () => ({
  useConversationExport: () => ({
    isOpen: false,
    showMenu: false,
    step: 'menu',
    filename: '',
    pathPreview: '',
    menuItems: [],
    activeIndex: 0,
    loading: false,
    openExportFlow: vi.fn(),
    closeExportFlow: vi.fn(),
    handleKeyDown: vi.fn(),
    onSelectMenuItem: vi.fn(),
    setActiveIndex: vi.fn(),
    setFilename: vi.fn(),
    submitFilename: vi.fn(),
  }),
}));

vi.mock('@/renderer/components/chat/BtwOverlay/useBtwCommand', () => ({
  useBtwCommand: () => ({
    answer: '',
    question: '',
    isLoading: false,
    isOpen: false,
    ask: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

vi.mock('@/renderer/hooks/file/useDragUpload', () => ({
  useDragUpload: () => ({ isFileDragging: false, dragHandlers: {} }),
}));

vi.mock('@/renderer/hooks/file/usePasteService', () => ({
  usePasteService: () => ({ onPaste: vi.fn(), onFocus: vi.fn() }),
}));

vi.mock('@/renderer/hooks/file/useUploadState', () => ({
  useUploadState: () => ({ isUploading: false }),
}));

vi.mock('@/renderer/hooks/file/useAbortUploadsOnConversationChange', () => ({
  useAbortUploadsOnConversationChange: vi.fn(),
}));

vi.mock('@/renderer/hooks/system/useLiveTranscriptInsertion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/renderer/hooks/system/useLiveTranscriptInsertion')>();
  return {
    ...actual,
    useLiveTranscriptInsertion: () => ({ handleLiveTranscript: vi.fn() }),
  };
});

// NOTE: the emitter is intentionally NOT mocked — this test drives the real
// append lane end to end.

vi.mock('@/renderer/components/chat/BtwOverlay', () => ({ default: () => null }));
vi.mock('@/renderer/components/chat/SpeechInputButton', () => ({ default: () => null }));
vi.mock('@/renderer/components/media/UploadProgressBar', () => ({ default: () => null }));

import SendBox from '@/renderer/components/chat/SendBox';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { mergeFileSelectionItems, type FileSelectionItem } from '@/renderer/utils/file/fileSelection';
import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';
import { projectFileRef } from '@/common/types/chatFile';

// Mirror AcpSendBox's own file-selection wiring: the wrapper listens to the
// append lane, merges into its state (mergeFileSelectionItems), and feeds
// SendBox; SendBox's onSelectedWorkspaceItemsChange re-emits the canonical set.
const Harness: React.FC = () => {
  const [items, setItems] = useState<FileSelectionItem[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useAddEventListener(
    'acp.selected.file',
    (next: FileSelectionItem[], tid: string | undefined) => {
      if (tid === undefined || tid === CONVERSATION_ID) setItems(next);
    },
    []
  );
  useAddEventListener(
    'acp.selected.file.append',
    (additions: FileSelectionItem[], tid: string | undefined) => {
      if (tid !== undefined && tid !== CONVERSATION_ID) return;
      const merged = mergeFileSelectionItems(itemsRef.current, additions);
      if (merged !== itemsRef.current) setItems(merged as FileSelectionItem[]);
    },
    []
  );

  return (
    <SendBox
      value=''
      onChange={vi.fn()}
      onSend={vi.fn().mockResolvedValue(undefined)}
      selectedWorkspaceItems={items}
      onSelectedWorkspaceItemsChange={(next) => emitter.emit('acp.selected.file', next, CONVERSATION_ID)}
    />
  );
};

const fileItem = (peId: string, rel: string, name: string): FileOrFolderItem => ({
  path: rel,
  name,
  isFile: true,
  relativePath: rel,
  chatRef: projectFileRef(peId, rel),
});

// A folder carries the tree node's identity: relative_path may be '' (pe root),
// isFile is false, and the ref is a project ref.
const folderItem = (peId: string, rel: string, name: string): FileOrFolderItem => ({
  path: rel,
  name,
  isFile: false,
  relativePath: rel || undefined,
  chatRef: projectFileRef(peId, rel),
});

const appendToChat = async (item: FileOrFolderItem): Promise<void> => {
  await act(async () => {
    emitter.emit('acp.selected.file.append', [item], CONVERSATION_ID);
  });
};

// The chip row (unmatchedSelectedWorkspaceItems) renders arco Tags each with a
// close button. Count chips by their close buttons to stay resilient to labels.
const chipCount = (): number => document.querySelectorAll('.arco-tag-close-btn').length;

describe('SendBox add-folder-to-chat produces a chip', () => {
  it('renders a chip for a file (baseline — never regressed)', async () => {
    render(<Harness />);
    await appendToChat(fileItem('peA', 'main.ts', 'main.ts'));
    await waitFor(() => expect(screen.getByText('main.ts')).toBeInTheDocument());
    expect(chipCount()).toBe(1);
  });

  it('renders a chip for a subdirectory folder (gate-3)', async () => {
    render(<Harness />);
    await appendToChat(folderItem('peA', 'crates', 'crates'));
    await waitFor(() => expect(screen.getByText('crates')).toBeInTheDocument());
    expect(chipCount()).toBe(1);
  });

  it('renders a chip for a pe ROOT (relative_path = "") — the reported bug (gate-1 + gate-2 + gate-3)', async () => {
    render(<Harness />);
    await appendToChat(folderItem('peZed', '', 'zed'));
    await waitFor(() => expect(screen.getByText('zed')).toBeInTheDocument());
    expect(chipCount()).toBe(1);
  });

  it('keeps TWO distinct pe roots as two chips — no collision on the empty path (gate-1 identity + gate-2 key)', async () => {
    render(<Harness />);
    await appendToChat(folderItem('peZed', '', 'zed'));
    await appendToChat(folderItem('peOpenclaw', '', 'openclaw'));
    await waitFor(() => expect(screen.getByText('zed')).toBeInTheDocument());
    expect(screen.getByText('openclaw')).toBeInTheDocument();
    expect(chipCount()).toBe(2);
  });

  it('does NOT render a non-file item that carries no chatRef (gate-3 stays narrow)', async () => {
    render(<Harness />);
    // A degenerate folder-shaped item with no ref identity must still be dropped.
    const noRef: FileOrFolderItem = { path: 'ghost', name: 'ghost', isFile: false };
    await appendToChat(noRef);
    // Give the append lane a tick; assert nothing chipped.
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText('ghost')).not.toBeInTheDocument();
    expect(chipCount()).toBe(0);
  });

  it('add file + subdir + pe root together → three chips, all present', async () => {
    render(<Harness />);
    await appendToChat(fileItem('peA', 'main.ts', 'main.ts'));
    await appendToChat(folderItem('peA', 'crates', 'crates'));
    await appendToChat(folderItem('peZed', '', 'zed'));
    await waitFor(() => expect(screen.getByText('zed')).toBeInTheDocument());
    expect(screen.getByText('main.ts')).toBeInTheDocument();
    expect(screen.getByText('crates')).toBeInTheDocument();
    expect(chipCount()).toBe(3);
  });

  // Closing one of two pe roots must remove exactly that root and keep the other.
  // Both roots have item.path === '', so their only distinguishing identity is
  // chatFileRefKey(item.chatRef). This guards the IDENTITY fix (gate-1): the
  // close handler and ownership set key by getSelectedItemKey.
  // Mutation: revert getSelectedItemKey to item.path → both roots collapse onto
  // '' (never even reach two chips / close removes both) and this test breaks.
  // NOTE (honest scope): reverting ONLY the chip's React render key (gate-2) back
  // to item.path does NOT break this test — the final rendered set is driven by
  // state identity, not the render key. gate-2 is React-reconciliation hygiene
  // (avoids duplicate '' keys → console error + ambiguous node reuse); it is
  // retained for correctness but is not independently asserted here.
  it('closing one of two pe roots removes the right one (gate-1 identity in the close handler)', async () => {
    render(<Harness />);
    await appendToChat(folderItem('peZed', '', 'zed'));
    await appendToChat(folderItem('peOpenclaw', '', 'openclaw'));
    await waitFor(() => expect(screen.getByText('zed')).toBeInTheDocument());
    expect(chipCount()).toBe(2);

    // Close the "zed" chip via its own close button.
    const zedTag = screen.getByText('zed').closest('.arco-tag') as HTMLElement;
    const closeBtn = zedTag.querySelector('.arco-tag-close-btn') as HTMLElement;
    await act(async () => {
      fireEvent.click(closeBtn);
    });

    await waitFor(() => expect(screen.queryByText('zed')).not.toBeInTheDocument());
    expect(screen.getByText('openclaw')).toBeInTheDocument();
    expect(chipCount()).toBe(1);
  });
});
