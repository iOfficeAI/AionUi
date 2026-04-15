/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { buildDisplayMessage } from '@/renderer/utils/file/messageFiles';

describe('buildDisplayMessage', () => {
  const workspace = '/tmp/aion/workspace-1';

  it('stores workspace files with workspace prefix', () => {
    const files = [`${workspace}/uploads/photo.jpg`];
    const result = buildDisplayMessage('hello', files, workspace);
    expect(result).toContain(`${workspace}/uploads/photo.jpg`);
  });

  it('preserves nested subdirectories inside workspace with prefix', () => {
    const files = [`${workspace}/uploads/subdir/doc.pdf`];
    const result = buildDisplayMessage('hello', files, workspace);
    expect(result).toContain(`${workspace}/uploads/subdir/doc.pdf`);
  });

  it('keeps absolute paths outside workspace verbatim (e.g. cache-dir uploads)', () => {
    const files = ['/other/path/external.txt'];
    const result = buildDisplayMessage('hello', files, workspace);
    // The marker must point at the real on-disk file. The conversationBridge
    // rewrites this with canonical workspace paths after any copy step.
    expect(result).toContain('/other/path/external.txt');
  });

  it('converts relative paths into workspace-prefixed paths', () => {
    const files = ['relative/file.txt'];
    const result = buildDisplayMessage('hello', files, workspace);
    expect(result).toContain(`${workspace}/relative/file.txt`);
  });

  it('returns input unchanged when no files', () => {
    const result = buildDisplayMessage('hello', [], workspace);
    expect(result).toBe('hello');
  });

  it('preserves AIONUI timestamp collision suffix in marker paths so FilePreview can resolve the real file', () => {
    const files = [`${workspace}/uploads/photo_aionui_1234567890123.jpg`];
    const result = buildDisplayMessage('hello', files, workspace);
    // Regression guard for PR #2370 revert: previously the suffix was stripped here,
    // causing chat-history image previews to show "Image not found" because the marker
    // path no longer matched the real file on disk. See FilePreview.tsx for the
    // display-only cleanup via getCleanFileName().
    expect(result).toContain(`${workspace}/uploads/photo_aionui_1234567890123.jpg`);
    expect(result).not.toContain(`${workspace}/uploads/photo.jpg`);
  });
});
