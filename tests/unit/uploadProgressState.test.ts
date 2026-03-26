/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect } from 'vitest';

// Mock useSyncExternalStore so it behaves synchronously (calls getSnapshot immediately)
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
  };
});

import { trackUpload, useUploadState } from '@renderer/hooks/file/useUploadState';

describe('useUploadState - upload tracking', () => {
  it('starts idle with no active uploads', () => {
    const state = useUploadState();
    expect(state.isUploading).toBe(false);
    expect(state.activeCount).toBe(0);
    expect(state.overallPercent).toBe(0);
  });

  it('becomes active when an upload is tracked', () => {
    const tracker = trackUpload(1000, 'sendbox');
    const state = useUploadState();
    expect(state.isUploading).toBe(true);
    expect(state.activeCount).toBeGreaterThanOrEqual(1);
    tracker.finish();
  });

  it('returns to idle after all uploads finish', () => {
    const tracker = trackUpload(1000, 'sendbox');
    tracker.finish();
    // Global state should have no more uploads from this tracker
    // (other tests may add their own, but this is a pure unit check)
    const state = useUploadState();
    expect(state.activeCount).toBe(0);
    expect(state.isUploading).toBe(false);
  });

  it('updates overallPercent from onProgress()', () => {
    const tracker = trackUpload(1000, 'sendbox');
    tracker.onProgress(75);
    const state = useUploadState('sendbox');
    expect(state.overallPercent).toBe(75);
    tracker.finish();
  });

  it('computes weighted average across multiple uploads', () => {
    // 1000-byte file at 100% and 1000-byte file at 0% → 50%
    const a = trackUpload(1000, 'sendbox');
    const b = trackUpload(1000, 'sendbox');
    a.onProgress(100);
    b.onProgress(0);
    const state = useUploadState('sendbox');
    expect(state.overallPercent).toBe(50);
    a.finish();
    b.finish();
  });

  it('source-scoped state only counts uploads of that source', () => {
    const sb = trackUpload(1000, 'sendbox');
    const ws = trackUpload(1000, 'workspace');

    expect(useUploadState('sendbox').activeCount).toBe(1);
    expect(useUploadState('workspace').activeCount).toBe(1);

    sb.finish();
    ws.finish();
  });

  it('workspace progress is not affected by sendbox uploads', () => {
    const sb = trackUpload(2000, 'sendbox');
    sb.onProgress(80);

    const workspaceState = useUploadState('workspace');
    expect(workspaceState.isUploading).toBe(false);
    expect(workspaceState.overallPercent).toBe(0);

    sb.finish();
  });

  it('sendbox-scoped state is not affected by workspace uploads', () => {
    const ws = trackUpload(2000, 'workspace');
    ws.onProgress(50);

    const sendboxState = useUploadState('sendbox');
    // Workspace upload must NOT disable the sendbox send button
    expect(sendboxState.isUploading).toBe(false);

    ws.finish();
  });
});
