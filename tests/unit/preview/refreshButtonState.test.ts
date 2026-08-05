/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// The refresh control's state, which is the only signal a user gets that a file they
// have open changed underneath them.
//
// The property that needs guarding hardest: this is DERIVED, never captured once. A
// file opened from a chat link starts as a `local` ref and becomes a `project` ref
// after an async resolve, moving it from "you will not be told about changes" to
// "you will". A state snapshotted when the tab opened would describe the wrong thing
// forever, and — since the button still renders and still clicks — would do so
// without any visible error.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  registerTabReloader,
  reloadViaViewer,
  resetTabReloadersForTest,
} from '@/renderer/pages/conversation/Preview/context/tabReloaderRegistry';
import {
  isRefreshActionable,
  isRefreshVisible,
  refreshButtonState,
  refreshStateToken,
  type RefreshableTab,
} from '@/renderer/pages/conversation/Preview/components/PreviewPanel/refreshButtonState';

const projectRef = { kind: 'project' as const, pe_id: 'peA', relative_path: 'src/a.ts' };
const localRef = { kind: 'local' as const, path: '/elsewhere/a.ts' };
const uploadRef = { kind: 'upload' as const, path: '/managed/a.ts' };

const tab = (over: Partial<RefreshableTab> = {}): RefreshableTab => ({
  content_type: 'code',
  metadata: { fileRef: projectRef },
  ...over,
});

describe('a project file that has not changed', () => {
  it('offers a grey, clickable refresh', () => {
    expect(refreshButtonState(tab(), false)).toEqual({ kind: 'idle' });
  });

  it('is clickable even though nothing has changed — a manual reload is always allowed', () => {
    expect(isRefreshActionable(refreshButtonState(tab(), false))).toBe(true);
  });
});

describe('a project file that changed on disk', () => {
  it('turns amber', () => {
    expect(refreshButtonState(tab(), true)).toEqual({ kind: 'updated' });
  });

  it('is clickable', () => {
    expect(isRefreshActionable(refreshButtonState(tab(), true))).toBe(true);
  });
});

// Only project files are watched. These stay grey forever, so the tooltip has to say
// why rather than leaving the user waiting for a colour that will never come.
describe('files nothing will report changes for', () => {
  it.each([
    ['local', localRef],
    ['upload', uploadRef],
  ])('marks a %s file as having no signal source', (_label, fileRef) => {
    expect(refreshButtonState(tab({ metadata: { fileRef } }), false)).toEqual({
      kind: 'idle',
      reason: 'no-signal-source',
    });
  });

  it('still lets the user reload one by hand', () => {
    expect(isRefreshActionable(refreshButtonState(tab({ metadata: { fileRef: localRef } }), false))).toBe(true);
  });
});

describe('a tab with no addressable file', () => {
  it('shows the control but cannot act', () => {
    const state = refreshButtonState(tab({ metadata: {} }), false);
    expect(state).toEqual({ kind: 'disabled', reason: 'no-identity' });
    expect(isRefreshVisible(state)).toBe(true);
    expect(isRefreshActionable(state)).toBe(false);
  });

  it('handles metadata being absent entirely', () => {
    expect(refreshButtonState({ content_type: 'markdown' }, false).kind).toBe('disabled');
  });
});

// Re-reading these reaches the same verdict, so a button would visibly do nothing —
// the same objection that ruled out a refresh that only re-renders a cached document.
describe('states where refreshing cannot change anything', () => {
  it('hides the control for an oversized file', () => {
    expect(refreshButtonState(tab({ metadata: { fileRef: projectRef, oversized: true } }), false)).toEqual({
      kind: 'hidden',
    });
  });

  it('hides the control for an unsupported format', () => {
    expect(refreshButtonState(tab({ content_type: 'unsupported' }), false)).toEqual({ kind: 'hidden' });
  });

  // Even with a change reported: the file is still too large to show.
  it('stays hidden for an oversized file even if a change was reported', () => {
    expect(refreshButtonState(tab({ metadata: { fileRef: projectRef, oversized: true } }), true).kind).toBe('hidden');
  });

  it('renders nothing at all in that state', () => {
    expect(isRefreshVisible({ kind: 'hidden' })).toBe(false);
  });
});

// The reason this is a function of the tab rather than a value stored on it.
describe('recomputing as a ref gains its project identity', () => {
  it('moves from "no signal source" to plain idle once the ref is upgraded', () => {
    const before = refreshButtonState(tab({ metadata: { fileRef: localRef } }), false);
    expect(before).toEqual({ kind: 'idle', reason: 'no-signal-source' });

    // Same tab, after the resolve wrote a project ref back onto it.
    const after = refreshButtonState(tab({ metadata: { fileRef: projectRef } }), false);
    expect(after).toEqual({ kind: 'idle' });
  });

  // Worth stating explicitly: an unconsumed change wins over the "no signal source"
  // hint. That combination only arises transiently — a change reported while the tab
  // still held its pre-upgrade ref — and amber is the honest answer, because
  // something really did change.
  it('reports a change even if the ref has not been upgraded yet', () => {
    expect(refreshButtonState(tab({ metadata: { fileRef: localRef } }), true)).toEqual({ kind: 'updated' });
  });

  // The ordering that makes the above safe: hiding beats everything, because there
  // is nothing to reload no matter what was reported.
  it('prefers hidden over a reported change', () => {
    expect(refreshButtonState(tab({ content_type: 'unsupported' }), true)).toEqual({ kind: 'hidden' });
  });

  // And missing identity beats a reported change, since a reload needs an address.
  it('prefers disabled over a reported change', () => {
    expect(refreshButtonState(tab({ metadata: {} }), true)).toEqual({ kind: 'disabled', reason: 'no-identity' });
  });
});

// The token exists so a test can assert what the user sees without coupling to
// whichever class expresses "amber", which is the fragile part of a colour assertion.
describe('the state token used as a test hook', () => {
  it.each([
    [{ kind: 'hidden' } as const, 'hidden'],
    [{ kind: 'disabled', reason: 'no-identity' } as const, 'disabled'],
    [{ kind: 'idle' } as const, 'idle'],
    [{ kind: 'idle', reason: 'no-signal-source' } as const, 'idle-no-signal'],
    [{ kind: 'updated' } as const, 'updated'],
  ])('renders %o as %s', (state, expected) => {
    expect(refreshStateToken(state)).toBe(expected);
  });

  // Distinguishable from plain idle: the two look the same but promise different
  // things, and a test asserting the tooltip needs to tell them apart.
  it('distinguishes the two grey states', () => {
    expect(refreshStateToken({ kind: 'idle' })).not.toBe(
      refreshStateToken({ kind: 'idle', reason: 'no-signal-source' })
    );
  });
});

// The one path in this feature that can destroy work: "save, then reload". A reload
// replaces the on-screen content with the file's, so it may only run once the edit is
// actually on disk. If a refused save let the reload proceed, the user would lose the
// edit and read it as "refresh ate my work" rather than "the save failed" — which is
// exactly why the save-outcome classifier exists.
describe('viewer-owned reloads', () => {
  beforeEach(() => resetTabReloadersForTest());

  it('reports no reloader for a tab that has not registered one', () => {
    expect(reloadViaViewer('tab-1')).toBe(false);
  });

  it('invokes the registered reloader', () => {
    const reload = vi.fn();
    registerTabReloader('tab-1', reload);

    expect(reloadViaViewer('tab-1')).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads only the tab asked for', () => {
    const first = vi.fn();
    const second = vi.fn();
    registerTabReloader('tab-1', first);
    registerTabReloader('tab-2', second);

    reloadViaViewer('tab-2');

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('stops reloading a tab whose viewer unmounted', () => {
    const reload = vi.fn();
    const unregister = registerTabReloader('tab-1', reload);

    unregister();

    expect(reloadViaViewer('tab-1')).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  // A remount registers before the previous cleanup runs, so cleanup must not remove
  // an entry that already belongs to the newer registration.
  it('keeps the newer registration when an older cleanup runs late', () => {
    const older = vi.fn();
    const newer = vi.fn();
    const cleanupOlder = registerTabReloader('tab-1', older);
    registerTabReloader('tab-1', newer);

    cleanupOlder();

    expect(reloadViaViewer('tab-1')).toBe(true);
    expect(newer).toHaveBeenCalledTimes(1);
    expect(older).not.toHaveBeenCalled();
  });
});
