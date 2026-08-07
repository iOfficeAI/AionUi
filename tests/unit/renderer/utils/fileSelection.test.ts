/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import { resolveLocalFileReadRoot, stripWindowsVerbatimPrefix } from '@/renderer/utils/file/fileSelection';

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

describe('resolveLocalFileReadRoot', () => {
  it('uses the artifact parent for a Grok image outside the conversation workspace', () => {
    const imagePath = String.raw`C:\Users\admin\.grok\sessions\session-1\images\1.jpg`;
    const workspace = String.raw`C:\Users\admin\AppData\Roaming\CSBU WorkMate\grok-temp-1`;

    expect(resolveLocalFileReadRoot(imagePath, workspace)).toBe(
      String.raw`C:\Users\admin\.grok\sessions\session-1\images`
    );
  });

  it('keeps the conversation workspace for Codex images stored inside it', () => {
    const workspace = String.raw`C:\Users\admin\AppData\Roaming\CSBU WorkMate\codex-temp-1`;
    const imagePath = `${workspace}\\.codex\\generated_images\\image.png`;

    expect(resolveLocalFileReadRoot(imagePath, workspace)).toBe(workspace);
  });

  it('keeps the conversation workspace for relative image paths', () => {
    expect(resolveLocalFileReadRoot('images/1.jpg', '/workspace/demo')).toBe('/workspace/demo');
  });

  it('does not mistake a sibling path with the same prefix for a workspace child', () => {
    expect(resolveLocalFileReadRoot('/workspace/demo-copy/image.png', '/workspace/demo')).toBe('/workspace/demo-copy');
  });

  it('uses the artifact parent for a POSIX image outside the workspace', () => {
    expect(resolveLocalFileReadRoot('/var/tmp/grok/images/1.jpg', '/workspace/demo')).toBe('/var/tmp/grok/images');
  });

  it('compares Windows paths case-insensitively and ignores a trailing root separator', () => {
    const workspace = 'C:\\Users\\Admin\\Workspace\\';
    const imagePath = String.raw`c:\users\admin\workspace\images\1.jpg`;

    expect(resolveLocalFileReadRoot(imagePath, workspace)).toBe(workspace);
  });

  it('keeps a UNC workspace for images below the same share', () => {
    const workspace = String.raw`\\server\Artifacts\session-1`;
    const imagePath = String.raw`\\SERVER\artifacts\session-1\images\1.jpg`;

    expect(resolveLocalFileReadRoot(imagePath, workspace)).toBe(workspace);
  });

  it('uses the UNC artifact parent when the image is outside the workspace share', () => {
    const imagePath = String.raw`\\server\Artifacts\session-2\images\1.jpg`;

    expect(resolveLocalFileReadRoot(imagePath, String.raw`\\server\Artifacts\session-1`)).toBe(
      String.raw`\\server\Artifacts\session-2\images`
    );
  });
});
