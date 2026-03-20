/**
 * Contract tests for aionui-fs Rust crate.
 *
 * These tests verify that the Rust implementations produce identical results
 * to the original TypeScript implementations for the same inputs.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fsp from 'fs/promises';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { readDirectoryTree, copyDirectory, verifyDirectoryStructure, ensureDir } from '@aionui/native';
import type { DirOrFile } from '@aionui/native';

// ============================================================================
// Test helpers
// ============================================================================

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'aionui-fs-contract-'));
});

afterEach(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

// Helper: create a directory tree from a descriptor
type TreeDesc = Record<string, string | TreeDesc>;

async function createTree(base: string, tree: TreeDesc): Promise<void> {
  await fsp.mkdir(base, { recursive: true });
  for (const [name, content] of Object.entries(tree)) {
    const fullPath = path.join(base, name);
    if (typeof content === 'string') {
      await fsp.writeFile(fullPath, content);
    } else {
      await fsp.mkdir(fullPath, { recursive: true });
      await createTree(fullPath, content);
    }
  }
}

// Helper: collect all names in a DirOrFile tree (flattened)
function collectNames(node: DirOrFile | null): string[] {
  if (!node) return [];
  const names = [node.name];
  if (node.children) {
    for (const child of node.children) {
      names.push(...collectNames(child));
    }
  }
  return names;
}

// ============================================================================
// readDirectoryTree
// ============================================================================

describe('readDirectoryTree', () => {
  it('returns directory tree matching IDirOrFile shape', async () => {
    await createTree(tmpDir, {
      'file.txt': 'hello',
      sub: {
        'nested.txt': 'world',
      },
    });

    const tree = await readDirectoryTree(tmpDir);
    expect(tree).not.toBeNull();
    expect(tree!.isDir).toBe(true);
    expect(tree!.isFile).toBe(false);
    expect(tree!.children).toHaveLength(2);

    // Directories first, then files
    expect(tree!.children![0].name).toBe('sub');
    expect(tree!.children![0].isDir).toBe(true);
    expect(tree!.children![1].name).toBe('file.txt');
    expect(tree!.children![1].isFile).toBe(true);
  });

  it('returns null for non-existent directory', async () => {
    const result = await readDirectoryTree(path.join(tmpDir, 'nonexistent'));
    expect(result).toBeNull();
  });

  it('returns null for file path', async () => {
    const filePath = path.join(tmpDir, 'not-a-dir.txt');
    await fsp.writeFile(filePath, 'content');

    const result = await readDirectoryTree(filePath);
    expect(result).toBeNull();
  });

  it('returns empty children for empty directory', async () => {
    const tree = await readDirectoryTree(tmpDir);
    expect(tree).not.toBeNull();
    expect(tree!.children).toEqual([]);
  });

  it('respects maxDepth=0 (no children)', async () => {
    await createTree(tmpDir, {
      sub: { 'file.txt': '' },
    });

    const tree = await readDirectoryTree(tmpDir, tmpDir, 0);
    expect(tree).not.toBeNull();
    expect(tree!.children).toEqual([]);
  });

  it('respects maxDepth=1 (one level deep)', async () => {
    await createTree(tmpDir, {
      a: {
        b: {
          'deep.txt': '',
        },
      },
    });

    const tree = await readDirectoryTree(tmpDir, tmpDir, 1);
    expect(tree).not.toBeNull();
    const subDir = tree!.children!.find((c) => c.name === 'a');
    expect(subDir).toBeDefined();
    expect(subDir!.isDir).toBe(true);
    // maxDepth=1: 'a' has empty children
    expect(subDir!.children).toEqual([]);
  });

  it('skips node_modules by default', async () => {
    await createTree(tmpDir, {
      node_modules: { 'pkg.js': '' },
      'index.ts': '',
    });

    const tree = await readDirectoryTree(tmpDir, tmpDir, 2);
    const names = tree!.children!.map((c) => c.name);
    expect(names).toContain('index.ts');
    expect(names).not.toContain('node_modules');
  });

  it('skips custom skip names', async () => {
    await createTree(tmpDir, {
      '.git': { HEAD: 'ref' },
      dist: { 'bundle.js': '' },
      'src.ts': '',
    });

    const tree = await readDirectoryTree(tmpDir, tmpDir, 2, ['.git', 'dist']);
    const names = tree!.children!.map((c) => c.name);
    expect(names).toContain('src.ts');
    expect(names).not.toContain('.git');
    expect(names).not.toContain('dist');
  });

  it('sorts directories first, then alphabetically', async () => {
    await createTree(tmpDir, {
      'zebra.txt': '',
      'alpha.txt': '',
      beta_dir: {},
      alpha_dir: {},
    });

    const tree = await readDirectoryTree(tmpDir, tmpDir, 1);
    const names = tree!.children!.map((c) => c.name);
    expect(names).toEqual(['alpha_dir', 'beta_dir', 'alpha.txt', 'zebra.txt']);
  });

  it('computes correct relative paths', async () => {
    await createTree(tmpDir, {
      sub: { 'file.txt': '' },
    });

    const tree = await readDirectoryTree(tmpDir, tmpDir, 2);
    // Root relative path is empty
    expect(tree!.relativePath).toBe('');

    const sub = tree!.children!.find((c) => c.name === 'sub')!;
    expect(sub.relativePath).toBe('sub');

    const file = sub.children!.find((c) => c.name === 'file.txt')!;
    // Windows uses backslash, Unix uses forward slash
    expect(file.relativePath).toMatch(/^sub[/\\]file\.txt$/);
  });

  it('search returns only matching entries and their ancestors', async () => {
    await createTree(tmpDir, {
      src: {
        'main.rs': '',
        'util.rs': '',
      },
      'README.md': '',
    });

    const tree = await readDirectoryTree(tmpDir, tmpDir, 10, [], 'main');
    expect(tree).not.toBeNull();

    // src/ should be included (has matching child)
    const src = tree!.children!.find((c) => c.name === 'src');
    expect(src).toBeDefined();

    // main.rs should be in src's children
    expect(src!.children!.some((c) => c.name === 'main.rs')).toBe(true);

    // util.rs should NOT be included
    expect(src!.children!.some((c) => c.name === 'util.rs')).toBe(false);

    // README.md should NOT be at top level
    expect(tree!.children!.some((c) => c.name === 'README.md')).toBe(false);
  });

  it('search with no matches returns empty children', async () => {
    await createTree(tmpDir, {
      'file.txt': 'hello',
    });

    const tree = await readDirectoryTree(tmpDir, tmpDir, 10, [], 'nonexistent_term');
    expect(tree).not.toBeNull();
    expect(tree!.children).toEqual([]);
  });

  it('handles concurrent deleted files gracefully (race condition)', async () => {
    await createTree(tmpDir, {
      'keep.txt': 'keep',
      'vanish.txt': 'vanish',
    });

    // Delete one file before reading
    await fsp.unlink(path.join(tmpDir, 'vanish.txt'));

    const tree = await readDirectoryTree(tmpDir, tmpDir, 1);
    const names = tree!.children!.map((c) => c.name);
    expect(names).toContain('keep.txt');
    // vanish.txt may or may not appear depending on timing, but should not crash
    expect(tree).not.toBeNull();
  });

  it('provides fullPath as absolute path', async () => {
    await createTree(tmpDir, {
      'test.txt': '',
    });

    const tree = await readDirectoryTree(tmpDir, tmpDir, 1);
    expect(path.isAbsolute(tree!.fullPath)).toBe(true);
    expect(path.isAbsolute(tree!.children![0].fullPath)).toBe(true);
  });
});

// ============================================================================
// copyDirectory
// ============================================================================

describe('copyDirectory', () => {
  it('copies files and directories recursively', async () => {
    const src = path.join(tmpDir, 'src');
    const dest = path.join(tmpDir, 'dest');

    await createTree(src, {
      'file.txt': 'hello',
      sub: { 'nested.txt': 'world' },
    });

    await copyDirectory(src, dest);

    expect(fs.existsSync(path.join(dest, 'file.txt'))).toBe(true);
    expect(await fsp.readFile(path.join(dest, 'file.txt'), 'utf-8')).toBe('hello');
    expect(await fsp.readFile(path.join(dest, 'sub', 'nested.txt'), 'utf-8')).toBe('world');
  });

  it('overwrites existing files when overwrite=true (default)', async () => {
    const src = path.join(tmpDir, 'src');
    const dest = path.join(tmpDir, 'dest');

    await createTree(src, { 'file.txt': 'new' });
    await createTree(dest, { 'file.txt': 'old' });

    await copyDirectory(src, dest, true);

    expect(await fsp.readFile(path.join(dest, 'file.txt'), 'utf-8')).toBe('new');
  });

  it('skips existing files when overwrite=false', async () => {
    const src = path.join(tmpDir, 'src');
    const dest = path.join(tmpDir, 'dest');

    await createTree(src, { 'file.txt': 'new' });
    await createTree(dest, { 'file.txt': 'old' });

    await copyDirectory(src, dest, false);

    expect(await fsp.readFile(path.join(dest, 'file.txt'), 'utf-8')).toBe('old');
  });

  it('creates destination directory if it does not exist', async () => {
    const src = path.join(tmpDir, 'src');
    const dest = path.join(tmpDir, 'new', 'nested', 'dest');

    await createTree(src, { 'file.txt': 'hello' });

    await copyDirectory(src, dest);

    expect(fs.existsSync(path.join(dest, 'file.txt'))).toBe(true);
  });

  it('rejects self-copy', async () => {
    const dir = path.join(tmpDir, 'dir');
    await fsp.mkdir(dir);

    await expect(copyDirectory(dir, dir)).rejects.toThrow(/into itself/i);
  });

  it('rejects copying into subdirectory', async () => {
    const parent = path.join(tmpDir, 'parent');
    const child = path.join(parent, 'child');
    await fsp.mkdir(parent, { recursive: true });
    await fsp.mkdir(child, { recursive: true });

    await expect(copyDirectory(parent, child)).rejects.toThrow(/subdirectory/i);
  });

  it('rejects copying parent into child', async () => {
    const parent = path.join(tmpDir, 'parent');
    const child = path.join(parent, 'child');
    await fsp.mkdir(child, { recursive: true });

    await expect(copyDirectory(child, parent)).rejects.toThrow(/parent/i);
  });

  it('handles empty source directory', async () => {
    const src = path.join(tmpDir, 'empty');
    const dest = path.join(tmpDir, 'dest');
    await fsp.mkdir(src);

    await copyDirectory(src, dest);

    expect(fs.existsSync(dest)).toBe(true);
    expect((await fsp.readdir(dest)).length).toBe(0);
  });
});

// ============================================================================
// verifyDirectoryStructure
// ============================================================================

describe('verifyDirectoryStructure', () => {
  it('returns true for identical directory structures', async () => {
    const dir1 = path.join(tmpDir, 'dir1');
    const dir2 = path.join(tmpDir, 'dir2');

    await createTree(dir1, {
      'file.txt': 'content-a',
      sub: { 'nested.txt': 'content-b' },
    });
    await createTree(dir2, {
      'file.txt': 'different-content',
      sub: { 'nested.txt': 'different' },
    });

    expect(await verifyDirectoryStructure(dir1, dir2)).toBe(true);
  });

  it('returns false for different file counts', async () => {
    const dir1 = path.join(tmpDir, 'dir1');
    const dir2 = path.join(tmpDir, 'dir2');

    await createTree(dir1, { 'a.txt': '', 'b.txt': '' });
    await createTree(dir2, { 'a.txt': '' });

    expect(await verifyDirectoryStructure(dir1, dir2)).toBe(false);
  });

  it('returns false for different file names', async () => {
    const dir1 = path.join(tmpDir, 'dir1');
    const dir2 = path.join(tmpDir, 'dir2');

    await createTree(dir1, { 'alpha.txt': '' });
    await createTree(dir2, { 'beta.txt': '' });

    expect(await verifyDirectoryStructure(dir1, dir2)).toBe(false);
  });

  it('returns false for nested structure differences', async () => {
    const dir1 = path.join(tmpDir, 'dir1');
    const dir2 = path.join(tmpDir, 'dir2');

    await createTree(dir1, { sub: { 'a.txt': '' } });
    await createTree(dir2, { sub: { 'b.txt': '' } });

    expect(await verifyDirectoryStructure(dir1, dir2)).toBe(false);
  });

  it('returns false when either directory does not exist', async () => {
    const existing = path.join(tmpDir, 'exists');
    await fsp.mkdir(existing);

    expect(await verifyDirectoryStructure(existing, path.join(tmpDir, 'nope'))).toBe(false);
    expect(await verifyDirectoryStructure(path.join(tmpDir, 'nope'), existing)).toBe(false);
  });

  it('returns true for two empty directories', async () => {
    const dir1 = path.join(tmpDir, 'empty1');
    const dir2 = path.join(tmpDir, 'empty2');
    await fsp.mkdir(dir1);
    await fsp.mkdir(dir2);

    expect(await verifyDirectoryStructure(dir1, dir2)).toBe(true);
  });
});

// ============================================================================
// ensureDir
// ============================================================================

describe('ensureDir', () => {
  it('creates new directory recursively', () => {
    const dir = path.join(tmpDir, 'new', 'nested', 'dir');
    ensureDir(dir);
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.statSync(dir).isDirectory()).toBe(true);
  });

  it('is a no-op for existing directory', () => {
    const dir = path.join(tmpDir, 'existing');
    fs.mkdirSync(dir);

    ensureDir(dir);
    expect(fs.statSync(dir).isDirectory()).toBe(true);
  });

  it('removes blocking file and creates directory', () => {
    const p = path.join(tmpDir, 'blocker');
    fs.writeFileSync(p, 'I am a file');

    ensureDir(p);
    expect(fs.statSync(p).isDirectory()).toBe(true);
  });
});
