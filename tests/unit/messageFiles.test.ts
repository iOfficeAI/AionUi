/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { buildDisplayMessage } from '@/renderer/utils/file/messageFiles';

describe('buildDisplayMessage', () => {
  const workspace = '/tmp/aion/workspace-1';

  it('stores workspace files as relative paths', () => {
    const files = [`${workspace}/uploads/photo.jpg`];
    const result = buildDisplayMessage('hello', files, workspace);
    expect(result).toContain('uploads/photo.jpg');
    expect(result).not.toContain(`${workspace}/uploads/photo.jpg`);
  });

  it('preserves nested subdirectories inside workspace as relative paths', () => {
    const files = [`${workspace}/uploads/subdir/doc.pdf`];
    const result = buildDisplayMessage('hello', files, workspace);
    expect(result).toContain('uploads/subdir/doc.pdf');
    expect(result).not.toContain(`${workspace}/uploads/subdir/doc.pdf`);
  });

  it('stores absolute paths outside workspace as workspace-relative basenames', () => {
    const files = ['/other/path/external.txt'];
    const result = buildDisplayMessage('hello', files, workspace);
    expect(result).toContain('external.txt');
    expect(result).not.toContain(`${workspace}/external.txt`);
    expect(result).not.toContain('/other/path');
  });

  it('converts relative paths into workspace-prefixed paths', () => {
    const files = ['relative/file.txt'];
    const result = buildDisplayMessage('hello', files, workspace);
    expect(result).toContain('relative/file.txt');
  });

  it('returns input unchanged when no files', () => {
    const result = buildDisplayMessage('hello', [], workspace);
    expect(result).toBe('hello');
  });

  it('preserves duplicate-upload suffixes so previews keep pointing to the uploaded file', () => {
    const files = [`${workspace}/uploads/photo_aionui_1234567890123.jpg`];
    const result = buildDisplayMessage('hello', files, workspace);
    expect(result).toContain('uploads/photo_aionui_1234567890123.jpg');
    expect(result).not.toContain(`${workspace}/uploads/photo_aionui_1234567890123.jpg`);
  });
});
