/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for Chisl indexer ignore-pattern filtering.
 */

import { describe, expect, it } from 'vitest';
import { shouldIgnoreIndexPath, toWorkspaceRelativePath } from '@/process/services/indexer/ignore';
import { CHISL_INDEX_DB_FILENAME } from '@/process/services/indexer/paths';

describe('shouldIgnoreIndexPath', () => {
  it('returns false for normal source files', () => {
    expect(shouldIgnoreIndexPath('src/index.ts', '/root/src/index.ts')).toBe(false);
  });

  it('ignores .git directories at any depth', () => {
    expect(shouldIgnoreIndexPath('.git/config', '/root/.git/config')).toBe(true);
    expect(shouldIgnoreIndexPath('sub/.git/HEAD', '/root/sub/.git/HEAD')).toBe(true);
  });

  it('ignores node_modules directories at any depth', () => {
    expect(shouldIgnoreIndexPath('node_modules/foo/index.js', '/root/node_modules/foo/index.js')).toBe(true);
    expect(shouldIgnoreIndexPath('packages/web/node_modules/x.js', '/root/packages/web/node_modules/x.js')).toBe(true);
  });

  it('ignores build / output directories', () => {
    for (const dir of ['dist', 'out', 'build', '.next', '.turbo', 'coverage', 'target']) {
      expect(shouldIgnoreIndexPath(`${dir}/asset.js`, `/root/${dir}/asset.js`)).toBe(true);
      expect(shouldIgnoreIndexPath(`packages/a/${dir}/asset.js`, `/root/packages/a/${dir}/asset.js`)).toBe(true);
    }
  });

  it('ignores hidden OS files', () => {
    expect(shouldIgnoreIndexPath('.DS_Store', '/root/.DS_Store')).toBe(true);
    expect(shouldIgnoreIndexPath('sub/Thumbs.db', '/root/sub/Thumbs.db')).toBe(true);
  });

  it('ignores secret files and credential-like names', () => {
    expect(shouldIgnoreIndexPath('.env', '/root/.env')).toBe(true);
    expect(shouldIgnoreIndexPath('.env.local', '/root/.env.local')).toBe(true);
    expect(shouldIgnoreIndexPath('secrets/credentials.json', '/root/secrets/credentials.json')).toBe(true);
    expect(shouldIgnoreIndexPath('certs/server.pem', '/root/certs/server.pem')).toBe(true);
    expect(shouldIgnoreIndexPath('keys/id_rsa', '/root/keys/id_rsa')).toBe(true);
  });

  it('ignores the chisl index db filename', () => {
    expect(shouldIgnoreIndexPath(CHISL_INDEX_DB_FILENAME, `/root/${CHISL_INDEX_DB_FILENAME}`)).toBe(true);
  });

  it('ignores paths that resolve to the configured index db path even if not at root', () => {
    const dbPath = '/var/data/chisl-index.db';
    expect(shouldIgnoreIndexPath('var/data/chisl-index.db', dbPath, { indexDbPath: dbPath })).toBe(true);
  });

  it('respects extra ignored directory names', () => {
    expect(
      shouldIgnoreIndexPath('vendor/lib/x.ts', '/root/vendor/lib/x.ts', { extraIgnoredDirNames: ['vendor'] })
    ).toBe(true);
  });

  it('does not ignore empty or root relative paths', () => {
    expect(shouldIgnoreIndexPath('', '/root')).toBe(false);
    expect(shouldIgnoreIndexPath('.', '/root/.')).toBe(false);
  });
});

describe('toWorkspaceRelativePath', () => {
  it('resolves an absolute path relative to the workspace root using forward slashes', () => {
    const root = process.platform === 'win32' ? 'C:\\root' : '/root';
    const result = toWorkspaceRelativePath(root, `${root}${process.platform === 'win32' ? '\\' : '/'}src/a.ts`);
    expect(result).toBe('src/a.ts');
  });

  it('returns null for paths that escape the workspace root', () => {
    const root = process.platform === 'win32' ? 'C:\\root' : '/root';
    const outside = process.platform === 'win32' ? 'C:\\elsewhere' : '/elsewhere';
    expect(toWorkspaceRelativePath(root, outside)).toBeNull();
  });

  it('accepts paths already expressed relative to the workspace root', () => {
    expect(toWorkspaceRelativePath('/root', 'src/a.ts')).toBe('src/a.ts');
  });
});
