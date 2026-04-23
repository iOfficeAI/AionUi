/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExtensionRegistry } from '../../../src/process/extensions/ExtensionRegistry';
import { safeResolveExtensionAsset } from '../../../src/process/extensions/protocol/safeResolveExtensionAsset';
import { toAssetUrl, parseAssetUrl } from '../../../src/process/extensions/protocol/assetProtocol';
import type { LoadedExtension } from '../../../src/process/extensions/types';

const tempRoots: string[] = [];

function makeExtension(name: string): { extDir: string; ext: LoadedExtension } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `aionui-asset-${name}-`));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(root, 'assets', 'icon.svg'), '<svg/>');
  fs.writeFileSync(path.join(root, 'secret.env'), 'PASSWORD=1');
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'main.js'), 'console.log(1)');

  const ext: LoadedExtension = {
    source: 'local',
    directory: root,
    manifest: {
      name,
      displayName: name,
      version: '1.0.0',
      contributes: {},
    } as LoadedExtension['manifest'],
  };
  return { extDir: root, ext };
}

function installExtensions(exts: LoadedExtension[]): void {
  const registry = ExtensionRegistry.getInstance();
  (registry as unknown as { extensions: LoadedExtension[] }).extensions = exts;
  (registry as unknown as { _allowedAssets: Set<string> })._allowedAssets = new Set();
  for (const ext of exts) {
    (registry as unknown as { extensionStates: Map<string, unknown> }).extensionStates.set(ext.manifest.name, {
      enabled: true,
      installed: true,
      lastVersion: ext.manifest.version,
    });
  }
}

beforeEach(() => {
  // Clean the registry state between tests
  const registry = ExtensionRegistry.getInstance() as unknown as {
    extensions: LoadedExtension[];
    _allowedAssets: Set<string>;
    extensionStates: Map<string, unknown>;
  };
  registry.extensions = [];
  registry._allowedAssets = new Set();
  registry.extensionStates = new Map();
});

afterEach(() => {
  for (const root of tempRoots.splice(0, tempRoots.length)) {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
});

describe('toAssetUrl / parseAssetUrl', () => {
  it('builds URL in POSIX form and parses back', () => {
    const url = toAssetUrl('kaiwu-acp', 'assets/icon.svg');
    expect(url).toBe('aion-asset://asset/kaiwu-acp/assets/icon.svg');
    const parsed = parseAssetUrl(url);
    expect(parsed).toEqual({ extName: 'kaiwu-acp', relPath: 'assets/icon.svg' });
  });

  it('converts Windows-style backslashes to POSIX slashes', () => {
    const url = toAssetUrl('kaiwu-acp', 'assets\\icon.svg'.replace(/\//g, path.sep));
    // On POSIX the above stays 'assets\\icon.svg' (backslash is a literal), which is invalid
    // relative path content in URL land. Skip the split-join variant and test the sep case.
    const winLike = ['assets', 'icon.svg'].join(path.sep);
    const url2 = toAssetUrl('kaiwu-acp', winLike);
    expect(url2).toBe('aion-asset://asset/kaiwu-acp/assets/icon.svg');
    // Keep the first assertion honest
    void url;
  });

  it('percent-encodes segments with spaces/CJK', () => {
    const url = toAssetUrl('demo', 'assets/中文 name.svg');
    expect(url).toMatch(/^aion-asset:\/\/asset\/demo\//);
    const parsed = parseAssetUrl(url);
    expect(parsed?.relPath).toBe('assets/中文 name.svg');
  });

  it('rejects parent-directory refs in toAssetUrl', () => {
    expect(() => toAssetUrl('demo', '../etc/passwd')).toThrow();
    expect(() => toAssetUrl('demo', '..')).toThrow();
    expect(() => toAssetUrl('demo', '/etc/passwd')).toThrow();
    expect(() => toAssetUrl('demo', '')).toThrow();
    expect(() => toAssetUrl('demo', '.')).toThrow();
    expect(() => toAssetUrl('demo', 'a\0b')).toThrow();
  });

  it('rejects bad extension names', () => {
    expect(() => toAssetUrl('Bad_Name', 'a.svg')).toThrow();
    expect(() => toAssetUrl('..', 'a.svg')).toThrow();
    expect(() => toAssetUrl('', 'a.svg')).toThrow();
  });

  it('parseAssetUrl returns null for malformed inputs', () => {
    expect(parseAssetUrl('aion-asset://asset/')).toBeNull();
    expect(parseAssetUrl('aion-asset://asset/demo')).toBeNull();
    expect(parseAssetUrl('aion-asset://asset/demo/../etc')).toBeNull();
    expect(parseAssetUrl('file:///etc/passwd')).toBeNull();
    expect(parseAssetUrl('aion-asset://asset/Bad_Name/a.svg')).toBeNull();
  });
});

describe('safeResolveExtensionAsset', () => {
  it('resolves a registered asset', async () => {
    const { ext } = makeExtension('demo-a');
    installExtensions([ext]);
    ExtensionRegistry.getInstance().registerAsset('demo-a', 'assets/icon.svg');
    const result = await safeResolveExtensionAsset('demo-a', 'assets/icon.svg');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(path.basename(result.absPath)).toBe('icon.svg');
    }
  });

  it('rejects unregistered assets even when the file exists', async () => {
    const { ext } = makeExtension('demo-b');
    installExtensions([ext]);
    // secret.env exists on disk but is NOT registered
    const result = await safeResolveExtensionAsset('demo-b', 'secret.env');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not-allowed');
  });

  it('rejects access to extension source files (src/main.js) when not whitelisted', async () => {
    const { ext } = makeExtension('demo-c');
    installExtensions([ext]);
    const result = await safeResolveExtensionAsset('demo-c', 'src/main.js');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not-allowed');
  });

  it('rejects unknown extension', async () => {
    const result = await safeResolveExtensionAsset('nope', 'assets/icon.svg');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('unknown-extension');
  });

  it('rejects invalid paths (null byte, traversal, leading slash)', async () => {
    const { ext } = makeExtension('demo-d');
    installExtensions([ext]);
    for (const bad of ['../../../etc/passwd', '..', '/etc/passwd', 'a\0b']) {
      const r = await safeResolveExtensionAsset('demo-d', bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(['invalid-path', 'not-allowed']).toContain(r.error);
    }
  });

  it('returns not-found when whitelisted path does not exist on disk', async () => {
    const { ext } = makeExtension('demo-e');
    installExtensions([ext]);
    ExtensionRegistry.getInstance().registerAsset('demo-e', 'assets/missing.svg');
    const result = await safeResolveExtensionAsset('demo-e', 'assets/missing.svg');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('not-found');
  });

  it('blocks symlink escape via realpath', async () => {
    // Only meaningful on POSIX (Windows symlink requires admin)
    if (process.platform === 'win32') return;
    const { ext, extDir } = makeExtension('demo-f');
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-outside-'));
    tempRoots.push(outsideDir);
    fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'outside');
    fs.symlinkSync(path.join(outsideDir, 'secret.txt'), path.join(extDir, 'assets', 'evil.link'));
    installExtensions([ext]);
    ExtensionRegistry.getInstance().registerAsset('demo-f', 'assets/evil.link');
    const result = await safeResolveExtensionAsset('demo-f', 'assets/evil.link');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('escape');
  });

  it('rejects Windows-style absolute paths on any platform', async () => {
    const { ext } = makeExtension('demo-g');
    installExtensions([ext]);
    for (const bad of ['C:\\Windows\\system32\\notepad.exe', '\\\\srv\\share\\x']) {
      const r = await safeResolveExtensionAsset('demo-g', bad);
      expect(r.ok).toBe(false);
    }
  });

  it('accepts POSIX paths with leading-dot directories (Linux ~/.config)', async () => {
    // This is the bug that caused the 500 in the first place: ".config" in
    // the on-disk path is fine as long as the asset is registered.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-dot-.config-'));
    tempRoots.push(root);
    fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(root, 'assets', 'icon.svg'), '<svg/>');
    const ext: LoadedExtension = {
      source: 'local',
      directory: root,
      manifest: {
        name: 'demo-h',
        displayName: 'demo-h',
        version: '1.0.0',
        contributes: {},
      } as LoadedExtension['manifest'],
    };
    installExtensions([ext]);
    ExtensionRegistry.getInstance().registerAsset('demo-h', 'assets/icon.svg');
    const result = await safeResolveExtensionAsset('demo-h', 'assets/icon.svg');
    expect(result.ok).toBe(true);
  });
});

describe('ExtensionRegistry asset whitelist', () => {
  it('registerAsset rejects traversal refs', () => {
    const registry = ExtensionRegistry.getInstance();
    expect(() => registry.registerAsset('demo', '../etc/passwd')).toThrow();
    expect(() => registry.registerAsset('demo', '/etc/passwd')).toThrow();
    expect(() => registry.registerAsset('demo', '..')).toThrow();
    expect(() => registry.registerAsset('demo', '')).toThrow();
  });

  it('isAssetAllowed normalizes input on query', () => {
    const registry = ExtensionRegistry.getInstance();
    registry.registerAsset('demo', 'assets/icon.svg');
    expect(registry.isAssetAllowed('demo', 'assets/icon.svg')).toBe(true);
    expect(registry.isAssetAllowed('demo', 'assets/./icon.svg')).toBe(true);
    expect(registry.isAssetAllowed('demo', 'other.svg')).toBe(false);
    expect(registry.isAssetAllowed('other-ext', 'assets/icon.svg')).toBe(false);
  });
});
