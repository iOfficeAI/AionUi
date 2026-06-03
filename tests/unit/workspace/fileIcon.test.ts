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
} from '@/renderer/pages/conversation/Workspace/utils/fileIcon';

describe('fileIcon helpers', () => {
  it('extracts a lowercase extension from the node name', () => {
    expect(getNodeIconExtension({ name: 'Report.PDF', relativePath: 'a/Report.PDF' })).toBe('pdf');
    expect(getNodeIconExtension({ name: 'index.tsx', relativePath: 'index.tsx' })).toBe('tsx');
  });

  it('falls back to relativePath when name is empty', () => {
    expect(getNodeIconExtension({ name: '', relativePath: 'src/main.ts' })).toBe('ts');
  });

  it('maps known extensions to vscode-icons names', () => {
    expect(getFileIconName({ name: 'main.ts', relativePath: 'main.ts' })).toBe('file-type-typescript');
    expect(getFileIconName({ name: 'App.tsx', relativePath: 'App.tsx' })).toBe('file-type-reactts');
    expect(getFileIconName({ name: 'report.PDF', relativePath: 'report.PDF' })).toBe('file-type-pdf2');
    expect(getFileIconName({ name: 'sheet.xlsx', relativePath: 'sheet.xlsx' })).toBe('file-type-excel');
  });

  it('falls back to the default file icon for unknown/extensionless files', () => {
    expect(getFileIconName({ name: 'weird.zzz', relativePath: 'weird.zzz' })).toBe('default-file');
    expect(getFileIconName({ name: 'Dockerfile', relativePath: 'Dockerfile' })).toBe('default-file');
  });

  it('returns open/closed folder icons by expanded state', () => {
    expect(getFolderIconName(false)).toBe('default-folder');
    expect(getFolderIconName(true)).toBe('default-folder-opened');
  });
});
