/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { resolveRelativePath } from '@/renderer/pages/conversation/Preview/components/renderers/HTMLRenderer';

const WORKSPACE = '/home/user/workspace';

describe('resolveRelativePath with workspace boundary', () => {
  it('resolves a relative path inside the workspace', () => {
    expect(resolveRelativePath('/home/user/workspace/index.html', 'img.png', WORKSPACE)).toBe(
      '/home/user/workspace/img.png'
    );
  });

  it('resolves a nested relative path inside the workspace', () => {
    expect(resolveRelativePath('/home/user/workspace/index.html', 'assets/img.png', WORKSPACE)).toBe(
      '/home/user/workspace/assets/img.png'
    );
  });

  it('resolves a "../" path that stays inside the workspace', () => {
    expect(resolveRelativePath('/home/user/workspace/sub/index.html', '../img.png', WORKSPACE)).toBe(
      '/home/user/workspace/img.png'
    );
  });

  it('throws when "../" escapes the workspace root', () => {
    expect(() => resolveRelativePath('/home/user/workspace/index.html', '../../../../etc/passwd', WORKSPACE)).toThrow(
      'Path traversal blocked'
    );
  });

  it('throws for an absolute path outside the workspace', () => {
    expect(() => resolveRelativePath('/home/user/workspace/index.html', '/etc/passwd', WORKSPACE)).toThrow(
      'Path traversal blocked'
    );
  });

  it('allows an absolute path inside the workspace', () => {
    expect(resolveRelativePath('/home/user/workspace/index.html', '/home/user/workspace/img.png', WORKSPACE)).toBe(
      '/home/user/workspace/img.png'
    );
  });

  it('allows an absolute path equal to the workspace root', () => {
    expect(resolveRelativePath('/home/user/workspace/index.html', '/home/user/workspace', WORKSPACE)).toBe(
      '/home/user/workspace'
    );
  });

  it('treats an empty workspace as no boundary', () => {
    expect(resolveRelativePath('/home/user/workspace/index.html', '../../../../etc/passwd', '')).toBe('/etc/passwd');
  });

  it('treats a root workspace as no boundary', () => {
    expect(resolveRelativePath('/home/user/workspace/index.html', '/etc/passwd', '/')).toBe('/etc/passwd');
  });

  it('rejects a target shorter than the workspace root', () => {
    // '/home' is a prefix segment of the workspace but not deep enough — must not
    // be treated as inside '/home/user/workspace'.
    expect(() => resolveRelativePath('/home/user/workspace/index.html', '/home', WORKSPACE)).toThrow(
      'Path traversal blocked'
    );
  });

  it('throws for a mixed-traversal path that escapes the workspace', () => {
    expect(() => resolveRelativePath('/home/user/workspace/index.html', 'sub/../../../etc/passwd', WORKSPACE)).toThrow(
      'Path traversal blocked'
    );
  });

  it('throws for a backslash traversal path that escapes the workspace', () => {
    expect(() => resolveRelativePath('/home/user/workspace/index.html', '..\\..\\etc\\passwd', WORKSPACE)).toThrow(
      'Path traversal blocked'
    );
  });

  it('returns paths unchanged when no workspace boundary is given', () => {
    // Legacy behavior: without a workspace root, no boundary check applies.
    expect(resolveRelativePath('/home/user/workspace/index.html', '/etc/passwd')).toBe('/etc/passwd');
    expect(resolveRelativePath('/home/user/workspace/index.html', '../../../../etc/passwd')).toBe('/etc/passwd');
  });

  it('keeps Windows drive paths within the workspace', () => {
    const winWorkspace = 'C:/Users/me/workspace';
    expect(resolveRelativePath('C:/Users/me/workspace/index.html', 'img.png', winWorkspace)).toBe(
      'C:/Users/me/workspace/img.png'
    );
  });

  it('throws for a Windows absolute path outside the workspace', () => {
    const winWorkspace = 'C:/Users/me/workspace';
    expect(() =>
      resolveRelativePath('C:/Users/me/workspace/index.html', 'C:/Windows/system.ini', winWorkspace)
    ).toThrow('Path traversal blocked');
  });

  it('throws for a Windows backslash traversal outside the workspace', () => {
    const winWorkspace = 'C:/Users/me/workspace';
    expect(() =>
      resolveRelativePath('C:/Users/me/workspace/index.html', '..\\..\\Windows\\system.ini', winWorkspace)
    ).toThrow('Path traversal blocked');
  });

  it('throws for an absolute path that uses ".." to escape the workspace', () => {
    // The literal starts with the workspace prefix but the ".." segments escape
    // it — the absolute branch must normalize before the boundary check.
    expect(() =>
      resolveRelativePath('/home/user/workspace/index.html', '/home/user/workspace/../../secret', WORKSPACE)
    ).toThrow('Path traversal blocked');
  });

  it('normalizes an absolute path with ".." that stays inside the workspace', () => {
    expect(
      resolveRelativePath('/home/user/workspace/index.html', '/home/user/workspace/sub/../img.png', WORKSPACE)
    ).toBe('/home/user/workspace/img.png');
  });

  it('throws for a Windows absolute path that uses ".." to escape the workspace', () => {
    const winWorkspace = 'C:/Users/me/workspace';
    expect(() =>
      resolveRelativePath(
        'C:/Users/me/workspace/index.html',
        'C:/Users/me/workspace/../../Windows/system.ini',
        winWorkspace
      )
    ).toThrow('Path traversal blocked');
  });
});
