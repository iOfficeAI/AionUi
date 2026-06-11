/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import { stripWindowsVerbatimPrefix } from '@/renderer/utils/file/fileSelection';

// Regression for issue #3191: the WebUI directory picker backend used to
// return Windows extended-length (verbatim) paths like `\\?\C:\DEV`, which
// broke Claude Code spawning and duplicated project-list entries.
describe('stripWindowsVerbatimPrefix', () => {
  it('strips the verbatim disk prefix', () => {
    expect(stripWindowsVerbatimPrefix('\\\\?\\C:\\DEV\\project')).toBe('C:\\DEV\\project');
    expect(stripWindowsVerbatimPrefix('\\\\?\\C:\\')).toBe('C:\\');
  });

  it('rewrites the verbatim UNC prefix to a regular UNC path', () => {
    expect(stripWindowsVerbatimPrefix('\\\\?\\UNC\\server\\share\\dir')).toBe('\\\\server\\share\\dir');
  });

  it('leaves non-verbatim paths untouched', () => {
    expect(stripWindowsVerbatimPrefix('C:\\DEV\\project')).toBe('C:\\DEV\\project');
    expect(stripWindowsVerbatimPrefix('\\\\server\\share')).toBe('\\\\server\\share');
    expect(stripWindowsVerbatimPrefix('/home/user/project')).toBe('/home/user/project');
    expect(stripWindowsVerbatimPrefix('')).toBe('');
  });
});
