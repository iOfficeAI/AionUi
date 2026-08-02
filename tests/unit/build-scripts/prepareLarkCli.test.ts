import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const {
  getLarkCliAssetName,
  normalizeVersion,
  parseChecksum,
  verifyBundledLarkCliResources,
  verifyFileChecksum,
} = require('../../../packages/shared-scripts/src/prepare-lark-cli.js');

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'prepare-lark-cli-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

describe('prepare Lark CLI build resources', () => {
  it('maps supported desktop targets to official release asset names', () => {
    expect(getLarkCliAssetName('win32', 'x64', 'v1.0.71')).toBe('lark-cli-1.0.71-windows-amd64.zip');
    expect(getLarkCliAssetName('darwin', 'arm64', '1.0.71')).toBe('lark-cli-1.0.71-darwin-arm64.tar.gz');
  });

  it('rejects invalid versions and unsupported targets', () => {
    expect(() => normalizeVersion('../latest')).toThrow('Invalid Lark CLI version');
    expect(() => getLarkCliAssetName('win32', 'ia32', '1.0.71')).toThrow('Unsupported Lark CLI target');
  });

  it('selects the exact checksum entry for an asset', () => {
    const expected = 'a'.repeat(64);
    expect(parseChecksum(`${'b'.repeat(64)}  other.zip\n${expected}  target.zip\n`, 'target.zip')).toBe(expected);
  });

  it('rejects a downloaded archive whose checksum does not match', () => {
    const directory = createTemporaryDirectory();
    const archivePath = path.join(directory, 'archive.zip');
    writeFileSync(archivePath, 'tampered');
    expect(() => verifyFileChecksum(archivePath, '0'.repeat(64))).toThrow('checksum mismatch');
  });

  it('accepts a downloaded archive whose checksum matches', () => {
    const directory = createTemporaryDirectory();
    const archivePath = path.join(directory, 'archive.zip');
    writeFileSync(archivePath, 'official');
    const checksum = createHash('sha256').update('official').digest('hex');
    expect(() => verifyFileChecksum(archivePath, checksum)).not.toThrow();
  });

  it('reports missing packaged resources precisely', () => {
    const resourcesDir = createTemporaryDirectory();
    const bundleDir = path.join(resourcesDir, 'bundled-lark-cli', 'win32-x64');
    mkdirSync(bundleDir, { recursive: true });
    writeFileSync(path.join(bundleDir, 'lark-cli.exe'), 'binary');
    const result = verifyBundledLarkCliResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });
    expect(result.missing.map((filePath: string) => path.basename(filePath))).toEqual(['LICENSE.txt', 'manifest.json']);
  });

  it('rejects a packaged binary that does not match its manifest', () => {
    const resourcesDir = createTemporaryDirectory();
    const bundleDir = path.join(resourcesDir, 'bundled-lark-cli', 'win32-x64');
    mkdirSync(bundleDir, { recursive: true });
    writeFileSync(path.join(bundleDir, 'lark-cli.exe'), 'tampered');
    writeFileSync(path.join(bundleDir, 'LICENSE.txt'), 'license');
    writeFileSync(
      path.join(bundleDir, 'manifest.json'),
      JSON.stringify({
        platform: 'win32',
        arch: 'x64',
        binarySha256: createHash('sha256').update('official').digest('hex'),
      })
    );

    const result = verifyBundledLarkCliResources({
      resourcesDir,
      electronPlatformName: 'win32',
      targetArch: 'x64',
    });

    expect(result.errors).toEqual([expect.stringContaining('binary checksum mismatch')]);
  });
});
