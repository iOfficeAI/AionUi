/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, render, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// PreviewContext pulls ipcBridge (WS-backed emitters + fs IO). Stub the surface
// it wires on mount so the provider mounts cleanly in jsdom and this test
// exercises only the scope-reset behavior.
const { ipcPreviewOpenListeners } = vi.hoisted(() => ({
  ipcPreviewOpenListeners: [] as Array<(payload: unknown) => void>,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fileStream: { contentUpdate: { on: () => () => {} } },
    preview: {
      open: {
        on: (cb: (payload: unknown) => void) => {
          ipcPreviewOpenListeners.push(cb);
          return () => {
            const index = ipcPreviewOpenListeners.indexOf(cb);
            if (index >= 0) ipcPreviewOpenListeners.splice(index, 1);
          };
        },
      },
    },
    fs: {
      writeFile: { invoke: async () => true },
      getFileMetadata: { invoke: async () => null },
      readFile: { invoke: async () => null },
      getImageBase64: { invoke: async () => null },
    },
  },
}));

import {
  PreviewProvider,
  usePreviewContext,
  type PreviewContextValue,
} from '@/renderer/pages/conversation/Preview/context/PreviewContext';
import {
  registerMountedConversation,
  resetFocusedConversationStoreForTest,
  setFocusedConversation,
} from '@/renderer/pages/conversation/hooks/focusedConversationStore';

/**
 * Capture the live context value on every render so assertions read the latest
 * state (the probe re-renders whenever the context updates).
 */
let ctx: PreviewContextValue;
const Probe: React.FC = () => {
  ctx = usePreviewContext();
  return null;
};

const mount = (): void => {
  render(
    <PreviewProvider>
      <Probe />
    </PreviewProvider>
  );
};

// Open a preview with no file_path so the mtime poller stays off (keeps the test
// free of timers / fs IPC).
const openADoc = (): void => {
  act(() => {
    ctx.openPreview('# hello', 'markdown', { title: 'Doc' });
  });
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  resetFocusedConversationStoreForTest();
});

describe('PreviewContext scope isolation (closePreviewIfScopeChanged)', () => {
  it('keeps the preview open when the scope key is unchanged', () => {
    mount();
    // Establish the current scope, then open a preview within it.
    act(() => ctx.closePreviewIfScopeChanged('/ws/a'));
    openADoc();
    expect(ctx.isOpen).toBe(true);

    // Same scope again → no reset.
    act(() => ctx.closePreviewIfScopeChanged('/ws/a'));
    expect(ctx.isOpen).toBe(true);
    expect(ctx.tabs).toHaveLength(1);
  });

  it('closes the preview when the scope key changes to a scope with no saved state', () => {
    mount();
    act(() => ctx.closePreviewIfScopeChanged('/ws/a'));
    openADoc();
    expect(ctx.isOpen).toBe(true);

    // Different scope with nothing persisted → loads empty (panel closed).
    act(() => ctx.closePreviewIfScopeChanged('/ws/b'));
    expect(ctx.isOpen).toBe(false);
    expect(ctx.tabs).toHaveLength(0);
  });

  it('restores a scope’s open tab + visibility after switching away and back (per-project)', () => {
    mount();
    act(() => ctx.closePreviewIfScopeChanged('projA'));
    act(() => ctx.openPreview('# doc a', 'markdown', { title: 'A.md', file_name: 'A.md' }));
    expect(ctx.isOpen).toBe(true);
    expect(ctx.tabs).toHaveLength(1);

    // Leave A (state persisted) → enter B (empty).
    act(() => ctx.closePreviewIfScopeChanged('projB'));
    expect(ctx.isOpen).toBe(false);
    expect(ctx.tabs).toHaveLength(0);

    // Back to A → its open tab + visibility restored.
    act(() => ctx.closePreviewIfScopeChanged('projA'));
    expect(ctx.isOpen).toBe(true);
    expect(ctx.tabs).toHaveLength(1);
    expect(ctx.tabs[0].title).toBe('A.md');
  });
});

/**
 * One preview panel serves every mounted conversation and follows the focused
 * one (approved: a shared panel, not one per column). Its "add to chat" used to
 * write into a single global handler ref, so whichever send box mounted last
 * received the text regardless of which column the user was working in.
 */
describe('PreviewContext add-to-chat targets the focused conversation', () => {
  it('writes into the focused conversation send box', () => {
    mount();
    const toA = vi.fn();
    const toB = vi.fn();
    act(() => {
      ctx.setSendBoxHandler(toA, 'conv-a');
      ctx.setSendBoxHandler(toB, 'conv-b');
    });

    registerMountedConversation('conv-a');
    registerMountedConversation('conv-b');
    setFocusedConversation('conv-b');
    act(() => ctx.addToSendBox('from preview'));
    expect(toB).toHaveBeenCalledWith('from preview');
    expect(toA).not.toHaveBeenCalled();

    setFocusedConversation('conv-a');
    act(() => ctx.addToSendBox('second'));
    expect(toA).toHaveBeenCalledWith('second');
    expect(toB).toHaveBeenCalledTimes(1);
  });

  it('drops a send box registration when its view unmounts', () => {
    mount();
    const toA = vi.fn();
    let release: (() => void) | undefined;
    act(() => {
      release = ctx.setSendBoxHandler(toA, 'conv-a');
    });
    registerMountedConversation('conv-a');

    act(() => release?.());
    act(() => ctx.addToSendBox('after unmount'));
    expect(toA).not.toHaveBeenCalled();
  });

  it('keeps a sibling send box on the same conversation reachable', () => {
    // Two columns can show the same conversation; the focus store refcounts
    // exactly that. One of them unmounting must not silence the other.
    mount();
    const first = vi.fn();
    const second = vi.fn();
    let releaseFirst: (() => void) | undefined;
    act(() => {
      releaseFirst = ctx.setSendBoxHandler(first, 'conv-a');
      ctx.setSendBoxHandler(second, 'conv-a');
    });
    registerMountedConversation('conv-a');

    act(() => releaseFirst?.());
    act(() => ctx.addToSendBox('still delivered'));
    expect(second).toHaveBeenCalledWith('still delivered');
    expect(first).not.toHaveBeenCalled();
  });

  it('uses the most recently registered send box for a conversation', () => {
    mount();
    const first = vi.fn();
    const second = vi.fn();
    act(() => {
      ctx.setSendBoxHandler(first, 'conv-a');
      ctx.setSendBoxHandler(second, 'conv-a');
    });
    registerMountedConversation('conv-a');

    act(() => ctx.addToSendBox('newest wins'));
    expect(second).toHaveBeenCalledWith('newest wins');
    expect(first).not.toHaveBeenCalled();
  });

  it('uses the unscoped composer only while no conversation is focused', () => {
    mount();
    const unscoped = vi.fn();
    act(() => ctx.setSendBoxHandler(unscoped, undefined));

    // No conversation focused at all — the guide-page composer still works.
    act(() => ctx.addToSendBox('no conversation'));
    expect(unscoped).toHaveBeenCalledWith('no conversation');
  });

  it('refuses to deliver elsewhere when the focused conversation has no send box', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mount();
      const unscoped = vi.fn();
      act(() => ctx.setSendBoxHandler(unscoped, undefined));

      // A focused conversation whose send box is absent must not have its
      // preview text delivered into an unrelated composer.
      registerMountedConversation('conv-a');
      act(() => ctx.addToSendBox('focused but unregistered'));
      expect(unscoped).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('releases the registration it created, not an equal callback registered later', () => {
    // The same function can be registered more than once; a release must remove
    // its own entry, not whichever equal one it finds first or last.
    mount();
    const shared = vi.fn();
    const other = vi.fn();
    let releaseFirst: (() => void) | undefined;
    act(() => {
      releaseFirst = ctx.setSendBoxHandler(shared, 'conv-a');
      ctx.setSendBoxHandler(other, 'conv-a');
      ctx.setSendBoxHandler(shared, 'conv-a');
    });
    registerMountedConversation('conv-a');

    act(() => releaseFirst?.());
    act(() => ctx.addToSendBox('newest still wins'));
    expect(shared).toHaveBeenCalledWith('newest still wins');
    expect(other).not.toHaveBeenCalled();
  });

  it('ignores a release that already ran', () => {
    // The release is idempotent by looking its own entry up rather than by
    // holding a flag; running it twice must not take out a later registration.
    mount();
    const first = vi.fn();
    const second = vi.fn();
    let releaseFirst: (() => void) | undefined;
    act(() => {
      releaseFirst = ctx.setSendBoxHandler(first, 'conv-a');
    });
    act(() => releaseFirst?.());
    act(() => {
      ctx.setSendBoxHandler(second, 'conv-a');
    });
    registerMountedConversation('conv-a');

    act(() => releaseFirst?.());
    act(() => ctx.addToSendBox('survives a double release'));
    expect(second).toHaveBeenCalledWith('survives a double release');
    expect(first).not.toHaveBeenCalled();
  });

  it('says so when nothing at all can receive the text', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mount();
      // No conversation focused and no composer registered: the text has
      // nowhere to go, and dropping it quietly is the failure mode this
      // contract exists to avoid.
      act(() => ctx.addToSendBox('nowhere to go'));
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('keeps unscoped composers independent of each other', () => {
    mount();
    const first = vi.fn();
    const second = vi.fn();
    let releaseFirst: (() => void) | undefined;
    act(() => {
      releaseFirst = ctx.setSendBoxHandler(first, undefined);
      ctx.setSendBoxHandler(second, undefined);
    });

    act(() => releaseFirst?.());
    act(() => ctx.addToSendBox('unscoped'));
    expect(second).toHaveBeenCalledWith('unscoped');
    expect(first).not.toHaveBeenCalled();
  });
});

/**
 * The backend can open a preview on its own (an agent showing a page). That
 * frame reaches every window and every column, so the panel takes only what it
 * can attribute to the focused conversation while its view is on screen — and
 * a refused open is logged, never dropped in silence.
 */
describe('PreviewContext backend-driven opens follow the focused conversation', () => {
  const emitIpcPreviewOpen = (payload: Record<string, unknown>): void => {
    act(() => {
      for (const listener of ipcPreviewOpenListeners) listener(payload);
    });
  };

  it('opens an unaddressed backend preview, which is every frame today', () => {
    mount();
    emitIpcPreviewOpen({ content: 'https://example.test', content_type: 'html' });
    expect(ctx.isOpen).toBe(true);
  });

  it('opens a backend preview addressed to the focused conversation', () => {
    mount();
    registerMountedConversation('conv-a');
    setFocusedConversation('conv-a');
    emitIpcPreviewOpen({ content: 'https://example.test', content_type: 'html', conversation_id: 'conv-a' });
    expect(ctx.isOpen).toBe(true);
  });

  it('shows an unaddressed backend preview while one conversation is on screen', () => {
    mount();
    registerMountedConversation('conv-a');
    setFocusedConversation('conv-a');
    emitIpcPreviewOpen({ content: 'https://example.test', content_type: 'html' });
    expect(ctx.isOpen).toBe(true);
  });

  it('shows an unaddressed backend preview in the shared panel, however many are on screen', () => {
    // The panel follows the focused conversation, so content that names nobody
    // goes where the user is looking. A frame the renderer cannot attribute is
    // not the same as a frame it can attribute elsewhere: refusing on a mount
    // count would throw away every agent preview in split view, since aioncore
    // names no conversation yet.
    mount();
    registerMountedConversation('conv-a');
    registerMountedConversation('conv-b');
    setFocusedConversation('conv-a');
    emitIpcPreviewOpen({ content: 'https://example.test', content_type: 'html' });
    expect(ctx.isOpen).toBe(true);
  });

  it('refuses an addressed backend preview while the named conversation has no view on screen, and says so', () => {
    // Mid route transition the name is all the store has (rule 3), so the
    // focused id can name a conversation with nothing on screen. Comparing
    // against that name alone would open the panel for something the user
    // cannot see.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mount();
      setFocusedConversation('conv-a');
      emitIpcPreviewOpen({ content: 'https://example.test', content_type: 'html', conversation_id: 'conv-a' });
      expect(ctx.isOpen).toBe(false);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('refuses a backend preview addressed elsewhere, and says so', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mount();
      registerMountedConversation('conv-a');
      setFocusedConversation('conv-a');
      emitIpcPreviewOpen({ content: 'https://example.test', content_type: 'html', conversation_id: 'conv-b' });
      expect(ctx.isOpen).toBe(false);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
