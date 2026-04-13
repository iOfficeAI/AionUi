import path from 'node:path';
import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();

vi.mock('@/common/platform', () => ({
  getPlatformServices: () => ({
    network: {
      fetch: (...args: unknown[]) => mockFetch(...args),
    },
  }),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
    renameSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(() => '{}'),
  };
});

vi.mock('child_process', () => ({ exec: vi.fn() }));
vi.mock('util', () => ({ promisify: () => vi.fn(async () => ({ stdout: '', stderr: '' })) }));

vi.mock('@process/utils', () => ({ getDataPath: () => '/data' }));

vi.mock('@process/extensions/constants', () => ({
  EXTENSION_MANIFEST_FILE: 'aion-extension.json',
  HUB_REMOTE_URLS: ['https://mirror1.com', 'https://mirror2.com'],
  getHubResourcesDir: vi.fn(() => '/resources/hub'),
  getInstallTargetDir: vi.fn(() => '/ext-install-dir'),
}));

vi.mock('../../src/process/extensions/ExtensionRegistry', () => ({
  ExtensionRegistry: { hotReload: vi.fn(async () => {}) },
}));

const mocks = vi.hoisted(() => ({
  getExtensionResult: undefined as unknown,
  setTransientCalls: [] as unknown[][],
  detectedAgents: [] as Array<{
    backend: string;
    name: string;
    isExtension?: boolean;
    customAgentId?: string;
  }>,
}));

vi.mock('../../src/process/extensions/hub/HubIndexManager', () => ({
  hubIndexManager: { getExtension: () => mocks.getExtensionResult },
}));

const mockMarkForReinstall = vi.fn();
vi.mock('@process/extensions/lifecycle/statePersistence', () => ({
  markExtensionForReinstall: (...args: unknown[]) => mockMarkForReinstall(...args),
}));

vi.mock('../../src/process/extensions/hub/HubStateManager', () => ({
  hubStateManager: {
    setTransientState: (...args: unknown[]) => {
      mocks.setTransientCalls.push(args);
    },
  },
}));

vi.mock('@process/agent/acp/AcpDetector', () => ({
  acpDetector: {
    refreshExtensionAgents: vi.fn(async () => {}),
    refreshAll: vi.fn(async () => {}),
    getDetectedAgents: () => mocks.detectedAgents,
  },
}));

import * as fs from 'fs';
import { exec } from 'child_process';
import { hubInstaller } from '../../src/process/extensions/hub/HubInstaller';

const mockedExistsSync = vi.mocked(fs.existsSync);
const mockedReadFileSync = vi.mocked(fs.readFileSync);
const mockedExec = vi.mocked(exec);

function makeSri(content: string | Buffer): string {
  const fileBuffer = typeof content === 'string' ? Buffer.from(content) : content;
  return `sha512-${crypto.createHash('sha512').update(fileBuffer).digest('base64')}`;
}

function makeExtInfo(name: string, bundled = false) {
  return {
    name,
    displayName: name,
    description: 'test',
    author: 'test',
    dist: { tarball: `extensions/${name}.zip`, integrity: makeSri(`${name}-archive`), unpackedSize: 100 },
    engines: { aionui: '>=1.0.0' },
    hubs: ['acpAdapters'],
    bundled,
  };
}

describe('HubInstaller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(false);
    mockedReadFileSync.mockImplementation(() => Buffer.from('default-archive'));
    mockFetch.mockRejectedValue(new Error('no network'));
    mocks.getExtensionResult = undefined;
    mocks.setTransientCalls = [];
    mocks.detectedAgents = [];
  });

  describe('install', () => {
    it('should throw when extension is not in hub index', async () => {
      mocks.getExtensionResult = undefined;

      await expect(hubInstaller.install('nonexistent')).rejects.toThrow('not found in Hub Index');
      expect(mocks.setTransientCalls[0]).toEqual(['nonexistent', 'installing']);
      expect(mocks.setTransientCalls[1]?.[1]).toBe('install_failed');
    });

    it('should use bundled zip when available', async () => {
      mocks.getExtensionResult = makeExtInfo('bundled-ext', true);
      mockedReadFileSync.mockReturnValue(Buffer.from('bundled-ext-archive'));
      mockedExistsSync.mockImplementation((p) => {
        const s = String(p);
        if (s.includes('bundled-ext.zip') && s.includes('resources')) return true;
        if (s.includes('aion-extension.json')) return true;
        return false;
      });

      await hubInstaller.install('bundled-ext');

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mocks.setTransientCalls.at(-1)).toEqual(['bundled-ext', 'installed']);
    });

    it('should download from remote when not bundled', async () => {
      mocks.getExtensionResult = makeExtInfo('remote-ext', false);
      mockedReadFileSync.mockReturnValue(Buffer.from('remote-ext-archive'));
      mockedExistsSync.mockImplementation((p) => String(p).includes('aion-extension.json'));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(10),
      });

      await hubInstaller.install('remote-ext');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mocks.setTransientCalls.at(-1)).toEqual(['remote-ext', 'installed']);
    });

    it('should fall back to second mirror when first fails', async () => {
      mocks.getExtensionResult = makeExtInfo('mirror-ext', false);
      mockedReadFileSync.mockReturnValue(Buffer.from('mirror-ext-archive'));
      mockedExistsSync.mockImplementation((p) => String(p).includes('aion-extension.json'));

      mockFetch.mockRejectedValueOnce(new Error('mirror1 down')).mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(10),
      });

      await hubInstaller.install('mirror-ext');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mocks.setTransientCalls.at(-1)).toEqual(['mirror-ext', 'installed']);
    });

    it('should fail when all mirrors are down', async () => {
      mocks.getExtensionResult = makeExtInfo('fail-ext', false);

      await expect(hubInstaller.install('fail-ext')).rejects.toThrow('Failed to download');
      expect(mocks.setTransientCalls.at(-1)?.[1]).toBe('install_failed');
    });

    it('should fail when manifest is missing after extraction', async () => {
      mocks.getExtensionResult = makeExtInfo('bad-pkg', false);
      mockedReadFileSync.mockReturnValue(Buffer.from('bad-pkg-archive'));
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(10),
      });
      mockedExistsSync.mockReturnValue(false);

      await expect(hubInstaller.install('bad-pkg')).rejects.toThrow('aion-extension.json missing');
    });

    it('should fail when integrity hash mismatches before extraction', async () => {
      mocks.getExtensionResult = {
        ...makeExtInfo('mismatch-ext', true),
        dist: {
          ...makeExtInfo('mismatch-ext', true).dist,
          integrity: makeSri('expected-content'),
        },
      };
      mockedReadFileSync.mockReturnValue(Buffer.from('actual-content'));
      mockedExistsSync.mockImplementation((p) => {
        const s = String(p);
        if (s.includes('mismatch-ext.zip') && s.includes('resources')) return true;
        return false;
      });

      await expect(hubInstaller.install('mismatch-ext')).rejects.toThrow('Integrity verification failed');
      expect(mockedExec).not.toHaveBeenCalled();
      expect(mocks.setTransientCalls.at(-1)?.[1]).toBe('install_failed');
    });

    it('should fail cleanly when integrity is missing', async () => {
      const extInfo = makeExtInfo('missing-integrity-ext', true);
      mocks.getExtensionResult = {
        ...extInfo,
        dist: {
          ...extInfo.dist,
          integrity: undefined,
        },
      };
      mockedReadFileSync.mockReturnValue(Buffer.from('missing-integrity-ext-archive'));
      mockedExistsSync.mockImplementation(
        (p) => String(p).includes('missing-integrity-ext.zip') && String(p).includes('resources')
      );

      await expect(hubInstaller.install('missing-integrity-ext')).rejects.toThrow(
        'Integrity metadata missing or empty'
      );
      expect(mockedExec).not.toHaveBeenCalled();
      expect(mocks.setTransientCalls.at(-1)?.[1]).toBe('install_failed');
    });

    it('should fail cleanly when integrity is whitespace only', async () => {
      const extInfo = makeExtInfo('blank-integrity-ext', true);
      mocks.getExtensionResult = {
        ...extInfo,
        dist: {
          ...extInfo.dist,
          integrity: '   ',
        },
      };
      mockedReadFileSync.mockReturnValue(Buffer.from('blank-integrity-ext-archive'));
      mockedExistsSync.mockImplementation(
        (p) => String(p).includes('blank-integrity-ext.zip') && String(p).includes('resources')
      );

      await expect(hubInstaller.install('blank-integrity-ext')).rejects.toThrow('Integrity metadata missing or empty');
      expect(mockedExec).not.toHaveBeenCalled();
    });

    it('should fail cleanly when integrity algorithm is unsupported', async () => {
      const extInfo = makeExtInfo('unsupported-integrity-ext', true);
      mocks.getExtensionResult = {
        ...extInfo,
        dist: {
          ...extInfo.dist,
          integrity: 'sha256-abc123==',
        },
      };
      mockedReadFileSync.mockReturnValue(Buffer.from('unsupported-integrity-ext-archive'));
      mockedExistsSync.mockImplementation(
        (p) => String(p).includes('unsupported-integrity-ext.zip') && String(p).includes('resources')
      );

      await expect(hubInstaller.install('unsupported-integrity-ext')).rejects.toThrow(
        'Unsupported integrity algorithm'
      );
      expect(mockedExec).not.toHaveBeenCalled();
    });

    it('should fail cleanly when integrity base64 is invalid', async () => {
      const extInfo = makeExtInfo('invalid-base64-ext', true);
      mocks.getExtensionResult = {
        ...extInfo,
        dist: {
          ...extInfo.dist,
          integrity: ' sha512-abc ',
        },
      };
      mockedReadFileSync.mockReturnValue(Buffer.from('invalid-base64-ext-archive'));
      mockedExistsSync.mockImplementation(
        (p) => String(p).includes('invalid-base64-ext.zip') && String(p).includes('resources')
      );

      await expect(hubInstaller.install('invalid-base64-ext')).rejects.toThrow(
        'Integrity metadata contains invalid base64'
      );
      expect(mockedExec).not.toHaveBeenCalled();
    });
  });

  describe('retryInstall', () => {
    it('should call full install when target dir does not exist', async () => {
      mocks.getExtensionResult = makeExtInfo('retry-ext', true);
      mockedReadFileSync.mockReturnValue(Buffer.from('retry-ext-archive'));
      mockedExistsSync.mockImplementation((p) => {
        const s = String(p);
        if (s.includes('retry-ext.zip') && s.includes('resources')) return true;
        if (s.includes('aion-extension.json')) return true;
        return false;
      });

      await hubInstaller.retryInstall('retry-ext');
      expect(mocks.setTransientCalls.at(-1)).toEqual(['retry-ext', 'installed']);
    });

    it('should fail when manifest is missing in existing directory', async () => {
      mockedExistsSync.mockImplementation((p) => {
        return String(p) === path.join('/ext-install-dir', 'broken-ext');
      });

      await expect(hubInstaller.retryInstall('broken-ext')).rejects.toThrow('manifest missing');
    });
  });

  describe('markExtensionForReinstall', () => {
    it('should call markExtensionForReinstall before hotReload during install', async () => {
      mocks.getExtensionResult = makeExtInfo('reinstall-ext', true);
      mockedReadFileSync.mockReturnValue(Buffer.from('reinstall-ext-archive'));
      mockedExistsSync.mockImplementation((p) => {
        const s = String(p);
        if (s.includes('reinstall-ext.zip') && s.includes('resources')) return true;
        if (s.includes('aion-extension.json')) return true;
        return false;
      });

      await hubInstaller.install('reinstall-ext');

      expect(mockMarkForReinstall).toHaveBeenCalledWith('reinstall-ext');
      expect(mocks.setTransientCalls.at(-1)).toEqual(['reinstall-ext', 'installed']);
    });

    it('should call markExtensionForReinstall before hotReload during retryInstall', async () => {
      mocks.getExtensionResult = makeExtInfo('retry-mark-ext', true);
      mockedExistsSync.mockImplementation((p) => {
        const s = String(p);
        if (s === path.join('/ext-install-dir', 'retry-mark-ext')) return true;
        if (s.includes('aion-extension.json')) return true;
        return false;
      });

      await hubInstaller.retryInstall('retry-mark-ext');

      expect(mockMarkForReinstall).toHaveBeenCalledWith('retry-mark-ext');
    });
  });

  describe('post-install verification', () => {
    it('should fail when contributed acpAdapters are not detected after install', async () => {
      mocks.getExtensionResult = {
        ...makeExtInfo('acp-ext', true),
        contributes: { acpAdapters: ['myagent'] },
      };
      mockedReadFileSync.mockReturnValue(Buffer.from('acp-ext-archive'));
      mocks.detectedAgents = []; // CLI not detected
      mockedExistsSync.mockImplementation((p) => {
        const s = String(p);
        if (s.includes('acp-ext.zip') && s.includes('resources')) return true;
        if (s.includes('aion-extension.json')) return true;
        return false;
      });

      await expect(hubInstaller.install('acp-ext')).rejects.toThrow('ACP adapters not detected');
      expect(mocks.setTransientCalls.at(-1)?.[1]).toBe('install_failed');
    });

    it('should succeed when contributed acpAdapters are detected after install', async () => {
      mocks.getExtensionResult = {
        ...makeExtInfo('acp-ok-ext', true),
        contributes: { acpAdapters: ['claude'] },
      };
      mockedReadFileSync.mockReturnValue(Buffer.from('acp-ok-ext-archive'));
      mocks.detectedAgents = [{ backend: 'claude', name: 'Claude Code' }];
      mockedExistsSync.mockImplementation((p) => {
        const s = String(p);
        if (s.includes('acp-ok-ext.zip') && s.includes('resources')) return true;
        if (s.includes('aion-extension.json')) return true;
        return false;
      });

      await hubInstaller.install('acp-ok-ext');
      expect(mocks.setTransientCalls.at(-1)).toEqual(['acp-ok-ext', 'installed']);
    });

    it('should pass verification when extension has no contributes', async () => {
      mocks.getExtensionResult = makeExtInfo('no-contrib-ext', true);
      mockedReadFileSync.mockReturnValue(Buffer.from('no-contrib-ext-archive'));
      mocks.detectedAgents = [];
      mockedExistsSync.mockImplementation((p) => {
        const s = String(p);
        if (s.includes('no-contrib-ext.zip') && s.includes('resources')) return true;
        if (s.includes('aion-extension.json')) return true;
        return false;
      });

      await hubInstaller.install('no-contrib-ext');
      expect(mocks.setTransientCalls.at(-1)).toEqual(['no-contrib-ext', 'installed']);
    });

    it('should fail when only some contributed acpAdapters are detected', async () => {
      mocks.getExtensionResult = {
        ...makeExtInfo('partial-ext', true),
        contributes: { acpAdapters: ['claude', 'missing-agent'] },
      };
      mockedReadFileSync.mockReturnValue(Buffer.from('partial-ext-archive'));
      mocks.detectedAgents = [{ backend: 'claude', name: 'Claude Code' }];
      mockedExistsSync.mockImplementation((p) => {
        const s = String(p);
        if (s.includes('partial-ext.zip') && s.includes('resources')) return true;
        if (s.includes('aion-extension.json')) return true;
        return false;
      });

      await expect(hubInstaller.install('partial-ext')).rejects.toThrow('ACP adapters not detected');
    });
    it('should succeed when custom adapter ID is detected via extension agent customAgentId', async () => {
      mocks.getExtensionResult = {
        ...makeExtInfo('custom-acp-ext', true),
        contributes: { acpAdapters: ['my-custom-agent'] },
      };
      mockedReadFileSync.mockReturnValue(Buffer.from('custom-acp-ext-archive'));
      // Extension agent with backend 'custom' but adapter ID in customAgentId
      mocks.detectedAgents = [
        {
          backend: 'custom',
          name: 'My Custom',
          isExtension: true,
          customAgentId: 'ext:custom-acp-ext:my-custom-agent',
        },
      ];
      mockedExistsSync.mockImplementation((p) => {
        const s = String(p);
        if (s.includes('custom-acp-ext.zip') && s.includes('resources')) return true;
        if (s.includes('aion-extension.json')) return true;
        return false;
      });

      await hubInstaller.install('custom-acp-ext');
      expect(mocks.setTransientCalls.at(-1)).toEqual(['custom-acp-ext', 'installed']);
    });
  });
});
