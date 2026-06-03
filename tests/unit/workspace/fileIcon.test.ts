/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { getNodeIconExtension, getFileIconStyle } from '@/renderer/pages/conversation/Workspace/utils/fileIcon';

describe('fileIcon helpers', () => {
  it('extracts a lowercase extension from the node name', () => {
    expect(getNodeIconExtension({ name: 'Report.PDF', relativePath: 'a/Report.PDF' })).toBe('pdf');
    expect(getNodeIconExtension({ name: 'index.tsx', relativePath: 'index.tsx' })).toBe('tsx');
  });

  it('falls back to relativePath when name is empty', () => {
    expect(getNodeIconExtension({ name: '', relativePath: 'src/main.ts' })).toBe('ts');
  });

  it('returns empty string for extensionless files', () => {
    expect(getNodeIconExtension({ name: 'Dockerfile', relativePath: 'Dockerfile' })).toBe('');
  });

  it('returns a style object for a known extension', () => {
    const style = getFileIconStyle('docx');
    expect(typeof style).toBe('object');
    expect(style).not.toBeNull();
  });

  it('returns an empty object for an unknown extension', () => {
    expect(getFileIconStyle('zzz')).toEqual({});
    expect(getFileIconStyle('')).toEqual({});
  });
});
