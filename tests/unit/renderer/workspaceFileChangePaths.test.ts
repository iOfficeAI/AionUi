/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  isDiffableWorkspaceFile,
  resolveWorkspaceChangeReadPath,
} from '@/renderer/pages/conversation/Workspace/utils/fileChangePaths';

describe('workspace file change paths', () => {
  it('rebuilds Windows read paths using the workspace separator', () => {
    expect(resolveWorkspaceChangeReadPath('C:\\repo\\project', 'C:\\repo\\project/src/main.ts', 'src/main.ts')).toBe(
      'C:\\repo\\project\\src\\main.ts'
    );
  });

  it('rebuilds POSIX read paths using forward slashes', () => {
    expect(resolveWorkspaceChangeReadPath('/repo/project', '/repo/project\\src\\main.ts', 'src\\main.ts')).toBe(
      '/repo/project/src/main.ts'
    );
  });

  it('keeps common text files diffable', () => {
    expect(isDiffableWorkspaceFile('src/main.ts')).toBe(true);
    expect(isDiffableWorkspaceFile('data/report.csv')).toBe(true);
    expect(isDiffableWorkspaceFile('README')).toBe(true);
  });

  it('does not treat binary or Office files as text diffs', () => {
    expect(isDiffableWorkspaceFile('report.xlsx')).toBe(false);
    expect(isDiffableWorkspaceFile('slides.pptx')).toBe(false);
    expect(isDiffableWorkspaceFile('archive.zip')).toBe(false);
  });
});
