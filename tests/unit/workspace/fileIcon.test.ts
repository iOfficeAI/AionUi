/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  getFileIconName,
  getFolderIconName,
  getNodeIconExtension,
} from '@/renderer/pages/conversation/explorer/fileIcon/fileIcon';

describe('fileIcon helpers', () => {
  it('extracts a lowercase extension from the node name', () => {
    expect(getNodeIconExtension({ name: 'Report.PDF', relativePath: 'a/Report.PDF' })).toBe('pdf');
    expect(getNodeIconExtension({ name: 'index.tsx', relativePath: 'index.tsx' })).toBe('tsx');
  });

  it('falls back to relativePath when name is empty', () => {
    expect(getNodeIconExtension({ name: '', relativePath: 'src/main.ts' })).toBe('ts');
  });

  it('maps known extensions to catppuccin names', () => {
    expect(getFileIconName({ name: 'main.ts', relativePath: 'main.ts' })).toBe('typescript');
    expect(getFileIconName({ name: 'App.tsx', relativePath: 'App.tsx' })).toBe('typescript-react');
    expect(getFileIconName({ name: 'report.PDF', relativePath: 'report.PDF' })).toBe('pdf');
    expect(getFileIconName({ name: 'sheet.xlsx', relativePath: 'sheet.xlsx' })).toBe('ms-excel');
  });

  it('falls back to the default file icon for unknown/extensionless files', () => {
    expect(getFileIconName({ name: 'weird.zzz', relativePath: 'weird.zzz' })).toBe('file');
    expect(getFileIconName({ name: 'Dockerfile', relativePath: 'Dockerfile' })).toBe('file');
  });

  it('returns open/closed folder icons by expanded state', () => {
    expect(getFolderIconName(false)).toBe('folder');
    expect(getFolderIconName(true)).toBe('folder-open');
  });
});
