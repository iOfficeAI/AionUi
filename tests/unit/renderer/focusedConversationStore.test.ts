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

  it('falls back to the most recently mounted survivor with three columns open', () => {
    registerMountedConversation('a');
    registerMountedConversation('b');
    registerMountedConversation('c');
    setFocusedConversation('a');

    unregisterMountedConversation('a');
    expect(getFocusedConversation()).toBe('c');
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
