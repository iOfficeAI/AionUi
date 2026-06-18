/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the upload state store, focused on the abort wiring added
 * for ELECTRON-1K2 (uploads cannot be cancelled / are not bound to the
 * conversation lifecycle).
 */

import { describe, it, expect, vi } from 'vitest';

import { abortUpload, abortUploads, trackUpload } from '@/renderer/hooks/file/useUploadState';

describe('useUploadState abort wiring', () => {
  it('invokes onAbort exactly once when abortUpload is called', () => {
    const onAbort = vi.fn();
    const tracker = trackUpload(100, { source: 'sendbox', name: 'a.txt', onAbort });

    abortUpload(tracker.id);
    abortUpload(tracker.id); // second call must be a no-op

    expect(onAbort).toHaveBeenCalledTimes(1);

    // Cleanup so the store is empty between tests.
    tracker.finish();
  });

  it('tracker.abort() reaches the registered onAbort handler', () => {
    const onAbort = vi.fn();
    const tracker = trackUpload(100, { source: 'sendbox', name: 'b.txt', onAbort });

    tracker.abort();

    expect(onAbort).toHaveBeenCalledTimes(1);
    tracker.finish();
  });

  it('abortUploads with exceptConversationId only aborts uploads bound to other conversations', () => {
    const onAbortKept = vi.fn();
    const onAbortDropped = vi.fn();
    const onAbortUnbound = vi.fn();

    const kept = trackUpload(10, {
      source: 'sendbox',
      name: 'keep.txt',
      conversationId: 'cur',
      onAbort: onAbortKept,
    });
    const dropped = trackUpload(10, {
      source: 'sendbox',
      name: 'drop.txt',
      conversationId: 'old',
      onAbort: onAbortDropped,
    });
    const unbound = trackUpload(10, {
      source: 'sendbox',
      name: 'unbound.txt',
      onAbort: onAbortUnbound,
    });

    abortUploads({ source: 'sendbox', exceptConversationId: 'cur' });

    expect(onAbortKept).not.toHaveBeenCalled();
    expect(onAbortDropped).toHaveBeenCalledTimes(1);
    expect(onAbortUnbound).toHaveBeenCalledTimes(1); // unbound != 'cur', so it is aborted

    kept.finish();
    dropped.finish();
    unbound.finish();
  });

  it('abortUploads scoped by source only affects matching uploads', () => {
    const onAbortSendbox = vi.fn();
    const onAbortWorkspace = vi.fn();

    const sendbox = trackUpload(10, { source: 'sendbox', onAbort: onAbortSendbox });
    const workspace = trackUpload(10, { source: 'workspace', onAbort: onAbortWorkspace });

    abortUploads({ source: 'sendbox' });

    expect(onAbortSendbox).toHaveBeenCalledTimes(1);
    expect(onAbortWorkspace).not.toHaveBeenCalled();

    sendbox.finish();
    workspace.finish();
  });
});
