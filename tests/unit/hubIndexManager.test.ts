import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: vi.fn(() => '/tmp') },
  net: { fetch: (...args: unknown[]) => mockFetch(...args) },
}));

const mockExistsSync = vi.fn(() => false);
const mockReadFileSync = vi.fn(() => '{}');
vi.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
}));

vi.mock('../../src/process/extensions/constants', () => ({
  EXTENSION_MANIFEST_FILE: 'aion-extension.json',
  HUB_REMOTE_URLS: ['https://example.com/hub/'],
  HUB_INDEX_FILE: 'index.json',
  HUB_SUPPORTED_SCHEMA_VERSION: 1,
  getHubResourcesDir: vi.fn(() => '/resources/hub'),
}));

import { hubIndexManager } from '../../src/process/extensions/hub/HubIndexManager';
import type { IHubExtension } from '@/common/types/hub';

function makeExt(overrides: Partial<IHubExtension> & { name: string }): IHubExtension {
  return {
    displayName: overrides.name,
    description: 'test',
    author: 'test',
    dist: { tarball: `${overrides.name}.zip`, integrity: 'sha512-abc', unpackedSize: 100 },
    engines: { aionui: '>=1.0.0' },
    hubs: ['acpAdapters'],
    ...overrides,
  };
}

describe('HubIndexManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockFetch.mockRejectedValue(new Error('no network'));
    // Reset singleton state so each test starts fresh
    (hubIndexManager as any)['mergedIndex'] = {};
    (hubIndexManager as any)['localLoaded'] = false;
    (hubIndexManager as any)['remoteLoaded'] = false;
  });

  describe('loadIndexes', () => {
    it('should load local index when available', async () => {
      const localIndex = {
        schemaVersion: 1,
        generatedAt: '2025-01-01',
        extensions: {
          'ext-a': makeExt({ name: 'ext-a' }),
        },
      };

      mockExistsSync.mockImplementation((p: string) => p.includes('index.json'));
      mockReadFileSync.mockReturnValue(JSON.stringify(localIndex));

      await hubIndexManager.loadIndexes();
      expect(hubIndexManager.getExtension('ext-a')).toBeDefined();
    });

    it('should merge remote index as supplement (local wins on conflict)', async () => {
      const localExt = makeExt({ name: 'shared', description: 'local version' });
      const remoteExt = makeExt({ name: 'shared', description: 'remote version' });
      const remoteOnly = makeExt({ name: 'remote-only' });

      const localIndex = { schemaVersion: 1, generatedAt: '', extensions: { shared: localExt } };
      const remoteIndex = {
        schemaVersion: 1,
        generatedAt: '',
        extensions: { shared: remoteExt, 'remote-only': remoteOnly },
      };

      mockExistsSync.mockImplementation((p: string) => p.includes('index.json'));
      mockReadFileSync.mockReturnValue(JSON.stringify(localIndex));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => remoteIndex,
      });

      await hubIndexManager.loadIndexes();

      // Local wins on conflict
      expect(hubIndexManager.getExtension('shared')?.description).toBe('local version');
      // Remote supplement is added
      expect(hubIndexManager.getExtension('remote-only')).toBeDefined();
    });

    it('should fall back to local only when remote fails', async () => {
      const localIndex = {
        schemaVersion: 1,
        generatedAt: '',
        extensions: { 'local-ext': makeExt({ name: 'local-ext' }) },
      };

      mockExistsSync.mockImplementation((p: string) => p.includes('index.json'));
      mockReadFileSync.mockReturnValue(JSON.stringify(localIndex));
      mockFetch.mockRejectedValue(new Error('timeout'));

      await hubIndexManager.loadIndexes();
      expect(hubIndexManager.getExtension('local-ext')).toBeDefined();
    });

    it('should resolve bundled flag based on zip existence', async () => {
      const ext = makeExt({
        name: 'bundled-ext',
        dist: { tarball: 'bundled-ext.zip', integrity: '', unpackedSize: 0 },
      });
      const localIndex = { schemaVersion: 1, generatedAt: '', extensions: { 'bundled-ext': ext } };

      mockExistsSync.mockImplementation((p: string) => {
        if (p.includes('index.json')) return true;
        if (p.includes('bundled-ext.zip')) return true;
        return false;
      });
      mockReadFileSync.mockReturnValue(JSON.stringify(localIndex));

      await hubIndexManager.loadIndexes();
      expect(hubIndexManager.getExtension('bundled-ext')?.bundled).toBe(true);
    });
  });
});
