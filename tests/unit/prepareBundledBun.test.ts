import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import prepareBundledBun = require('../../scripts/prepareBundledBun.js');

function getRequiredRuntimeFileName(): string {
  return process.platform === 'win32' ? 'bun.exe' : 'bun';
}

describe('prepareBundledBun', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const runtimeKey = `${process.platform}-${process.arch}`;
  const targetDir = path.join(projectRoot, 'resources', 'bundled-bun', runtimeKey);

  const originalCacheDir = process.env.AIONUI_BUN_CACHE_DIR;
  const originalVersion = process.env.AIONUI_BUN_VERSION;

  let tempRoot: string | null = null;
  let targetBackupDir: string | null = null;
  let targetExisted = false;

  afterEach(() => {
    process.env.AIONUI_BUN_CACHE_DIR = originalCacheDir;
    process.env.AIONUI_BUN_VERSION = originalVersion;

    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }

    if (targetExisted && targetBackupDir && fs.existsSync(targetBackupDir)) {
      fs.mkdirSync(path.dirname(targetDir), { recursive: true });
      fs.cpSync(targetBackupDir, targetDir, { recursive: true });
    }

    if (targetBackupDir && fs.existsSync(targetBackupDir)) {
      fs.rmSync(targetBackupDir, { recursive: true, force: true });
    }

    if (tempRoot && fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }

    tempRoot = null;
    targetBackupDir = null;
    targetExisted = false;
  });

  it('copies bundled bun from cache when cache metadata is valid', () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-bun-test-'));

    targetExisted = fs.existsSync(targetDir);
    if (targetExisted) {
      targetBackupDir = path.join(tempRoot, 'target-backup');
      fs.cpSync(targetDir, targetBackupDir, { recursive: true });
    }

    const cacheRoot = path.join(tempRoot, 'cache-root');
    const version = 'test-cache-version';
    const cacheRuntimeDir = path.join(cacheRoot, version, runtimeKey);
    fs.mkdirSync(cacheRuntimeDir, { recursive: true });

    const runtimeFileName = getRequiredRuntimeFileName();
    const runtimeFilePath = path.join(cacheRuntimeDir, runtimeFileName);
    fs.writeFileSync(runtimeFilePath, 'fake-bun-binary', 'utf8');

    const cacheMeta = {
      platform: process.platform,
      arch: process.arch,
      version,
      sourceType: 'download',
      source: {
        url: 'https://example.com/bun.zip',
        asset: 'bun-test.zip',
      },
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(cacheRuntimeDir, 'runtime-meta.json'), JSON.stringify(cacheMeta, null, 2), 'utf8');

    process.env.AIONUI_BUN_CACHE_DIR = cacheRoot;
    process.env.AIONUI_BUN_VERSION = version;

    const result = prepareBundledBun();

    expect(result.prepared).toBe(true);
    expect(result.sourceType).toBe('cache');

    const targetRuntimePath = path.join(targetDir, runtimeFileName);
    const manifestPath = path.join(targetDir, 'manifest.json');

    expect(fs.existsSync(targetRuntimePath)).toBe(true);
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      sourceType: string;
      skipped?: boolean;
      files: string[];
      cacheDir: string;
      cacheMeta?: { sourceType: string };
    };

    expect(manifest.sourceType).toBe('cache');
    expect(manifest.skipped).not.toBe(true);
    expect(manifest.files).toContain(runtimeFileName);
    expect(manifest.cacheDir).toBe(cacheRuntimeDir);
    expect(manifest.cacheMeta?.sourceType).toBe('download');
  });
});
