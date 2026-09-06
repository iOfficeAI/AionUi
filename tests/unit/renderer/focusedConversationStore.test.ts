/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getFocusedConversation,
  getFocusedProject,
  getMountedConversationIds,
  isConversationMounted,
  registerMountedConversation,
  resetFocusedConversationStoreForTest,
  resolveAnnouncementTarget,
  setFocusedConversation,
  setFocusedProject,
  subscribeFocusedProject,
  unregisterMountedConversation,
} from '@/renderer/pages/conversation/hooks/focusedConversationStore';

afterEach(() => resetFocusedConversationStoreForTest());

describe('focusedConversationStore — mounted set', () => {
  it('keeps the mounted ids in mount order', () => {
    registerMountedConversation('a');
    registerMountedConversation('b');
    expect(getMountedConversationIds()).toEqual(['a', 'b']);
    expect(isConversationMounted('a')).toBe(true);
    expect(isConversationMounted('c')).toBe(false);
  });

  it('drops an id from the mounted set on unregister', () => {
    const releaseA = registerMountedConversation('a');
    registerMountedConversation('b');
    releaseA();
    expect(getMountedConversationIds()).toEqual(['b']);
    expect(isConversationMounted('a')).toBe(false);
  });

  it('keeps a conversation mounted while a second view of it is still on screen', () => {
    const releaseFirst = registerMountedConversation('a');
    registerMountedConversation('a');

    releaseFirst();
    expect(isConversationMounted('a')).toBe(true);

    unregisterMountedConversation('a');
    expect(isConversationMounted('a')).toBe(false);
  });

  it('ignores a release that already ran, so a remount is not undone', () => {
    const release = registerMountedConversation('a');
    release();
    release();
    registerMountedConversation('a');
    expect(getMountedConversationIds()).toEqual(['a']);
  });

  it('ignores an unregister for an id that was never mounted', () => {
    registerMountedConversation('a');
    unregisterMountedConversation('ghost');
    expect(getMountedConversationIds()).toEqual(['a']);
  });
});

describe('focusedConversationStore — focus', () => {
  it('focuses the only mounted conversation automatically', () => {
    registerMountedConversation('a');
    expect(getFocusedConversation()).toBe('a');
  });

  it('does not move focus when a second conversation mounts', () => {
    registerMountedConversation('a');
    registerMountedConversation('b');
    expect(getFocusedConversation()).toBe('a');
  });

  it('follows the last interaction while several are mounted', () => {
    registerMountedConversation('a');
    registerMountedConversation('b');

    setFocusedConversation('b');
    expect(getFocusedConversation()).toBe('b');

    setFocusedConversation('a');
    expect(getFocusedConversation()).toBe('a');
  });

  it('falls back to the remaining conversation when the focused one unmounts', () => {
    registerMountedConversation('a');
    registerMountedConversation('b');
    setFocusedConversation('a');

    unregisterMountedConversation('a');
    expect(getFocusedConversation()).toBe('b');
  });

  it('falls back to the oldest surviving view with three columns open', () => {
    registerMountedConversation('a');
    registerMountedConversation('b');
    registerMountedConversation('c');
    setFocusedConversation('a');

    unregisterMountedConversation('a');
    expect(getFocusedConversation()).toBe('b');
  });

  it('clears focus when the last conversation unmounts', () => {
    registerMountedConversation('a');
    unregisterMountedConversation('a');
    expect(getFocusedConversation()).toBeNull();
  });

  it('treats an empty id as no focus', () => {
    setFocusedConversation('a');
    setFocusedConversation('');
    expect(getFocusedConversation()).toBeNull();
  });

  it('settles on the named conversation once its view mounts', () => {
    // Naming a column and then letting the columns mount must end on the named
    // one, whichever order they arrive in.
    setFocusedConversation('b');
    registerMountedConversation('a');
    registerMountedConversation('b');
    expect(getFocusedConversation()).toBe('b');
  });

  it('settles on the named conversation however late its view mounts', async () => {
    // The answer is derived on read, not latched when the name is set, so the
    // named view winning does not depend on it arriving in any particular tick.
    setFocusedConversation('b');
    registerMountedConversation('a');

    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    registerMountedConversation('b');
    expect(getFocusedConversation()).toBe('b');

    // And it stays there — nothing expires it behind the user's back.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getFocusedConversation()).toBe('b');
  });

  it('does not strand the focus on a view that never mounts', () => {
    setFocusedConversation('missing');
    registerMountedConversation('a');
    expect(getFocusedConversation()).toBe('a');
  });

  it('keeps the name while nothing is on screen to fall back to', () => {
    // The team route names its active member column, whose view does not
    // register; clearing the name is the caller's job, not a guess made here.
    setFocusedConversation('b');
    expect(getFocusedConversation()).toBe('b');
  });

  it('stays focused while one of two views of the same conversation closes', () => {
    // The mounted set refcounts duplicates; the derived focus has to read that
    // refcount, not merely "was it ever registered".
    setFocusedConversation('a');
    const releaseFirst = registerMountedConversation('a');
    registerMountedConversation('a');
    registerMountedConversation('b');

    releaseFirst();
    expect(getFocusedConversation()).toBe('a');

    unregisterMountedConversation('a');
    expect(getFocusedConversation()).toBe('b');
  });

  it('does not let a closed column retake the focus when it comes back', () => {
    // Once b's view leaves and a takes over, every reader has been answering
    // "a" — so b's name is spent. Remounting b must not move the focus back
    // with no click behind it; only naming it again does.
    setFocusedConversation('b');
    const releaseB = registerMountedConversation('b');
    registerMountedConversation('a');
    expect(getFocusedConversation()).toBe('b');

    releaseB();
    expect(getFocusedConversation()).toBe('a');

    registerMountedConversation('b');
    expect(getFocusedConversation()).toBe('a');

    setFocusedConversation('b');
    expect(getFocusedConversation()).toBe('b');
  });

  it('keeps the name when its view leaves with nothing on screen behind it', () => {
    // The route transition: the old view unmounts before the new one mounts,
    // so there is no fallback to promote and the name is still the only fact.
    setFocusedConversation('b');
    const releaseB = registerMountedConversation('b');

    releaseB();
    expect(getFocusedConversation()).toBe('b');

    registerMountedConversation('b');
    expect(getFocusedConversation()).toBe('b');
  });

  it('keeps a name whose view has not mounted yet while others come and go', () => {
    // Spending the name is scoped to the name's own view leaving. A column the
    // caller named but that has not arrived yet must still win when it does,
    // however much churn happens meanwhile.
    setFocusedConversation('c');
    const releaseA = registerMountedConversation('a');
    registerMountedConversation('b');

    releaseA();
    expect(getFocusedConversation()).toBe('b');

    registerMountedConversation('c');
    expect(getFocusedConversation()).toBe('c');
  });

  it('lets a later explicit focus replace a pending one', () => {
    setFocusedConversation('b');
    setFocusedConversation(null);
    registerMountedConversation('a');
    expect(getFocusedConversation()).toBe('a');
  });

  it('notifies subscribers when focus changes and skips no-op writes', () => {
    const listener = vi.fn();
    subscribeFocusedProject(listener);

    setFocusedConversation('a');
    expect(listener).toHaveBeenCalledTimes(1);

    setFocusedConversation('a');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('focusedConversationStore — announcement targets', () => {
  it('keeps a target the emitter already knows', () => {
    registerMountedConversation('a');
    expect(resolveAnnouncementTarget('b')).toBe('b');
  });

  it('addresses the focused conversation when the emitter has none', () => {
    registerMountedConversation('a');
    registerMountedConversation('b');
    setFocusedConversation('b');
    expect(resolveAnnouncementTarget(undefined)).toBe('b');
  });

  it('stays undefined — a broadcast — when nothing is focused', () => {
    expect(resolveAnnouncementTarget(undefined)).toBeUndefined();
  });
});

describe('focusedConversationStore — focused project', () => {
  it('sets and reads the focused project id', () => {
    setFocusedProject('proj-1');
    expect(getFocusedProject()).toBe('proj-1');
    setFocusedProject(null);
    expect(getFocusedProject()).toBeNull();
  });

  it('is independent of the mounted conversation set', () => {
    setFocusedProject('proj-1');
    registerMountedConversation('a');
    unregisterMountedConversation('a');
    expect(getFocusedProject()).toBe('proj-1');
  });
});
