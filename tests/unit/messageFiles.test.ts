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

  it('stores absolute paths outside workspace using workspace basename prefix', () => {
    const files = ['/other/path/external.txt'];
    const result = buildDisplayMessage('hello', files, workspace);
    expect(result).toContain(`${workspace}/external.txt`);
    expect(result).not.toContain('/other/path');
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

  it('preserves AIONUI timestamp suffixes for files already inside the workspace', () => {
    const files = [`${workspace}/uploads/photo_aionui_1234567890123.jpg`];
    const result = buildDisplayMessage('hello', files, workspace);
    expect(result).toContain(`${workspace}/uploads/photo_aionui_1234567890123.jpg`);
  });

  it('preserves AIONUI timestamp suffixes when rebasing external files into the workspace marker', () => {
    const files = ['/tmp/photo_aionui_1234567890123.jpg'];
    const result = buildDisplayMessage('hello', files, workspace);
    expect(result).toContain(`${workspace}/photo_aionui_1234567890123.jpg`);
  });
});
