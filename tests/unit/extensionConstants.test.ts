import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: vi.fn(() => '/tmp') },
}));

vi.mock('@/common/platform', () => ({
  getPlatformServices: () => ({
    paths: { getDataDir: () => '/appdata' },
  }),
}));

vi.mock('@process/utils', () => ({
  getDataPath: () => '/home/user/.aionui-dev',
}));

// Must import after mocks
import {
  EXTENSION_MANIFEST_FILE,
  getAppDataExtensionsDir,
  getEnvExtensionsDirs,
  getExtensionScanSources,
  getHubResourcesDir,
  getInstallTargetDir,
  getUserExtensionsDir,
  HUB_REMOTE_URLS,
} from '../../src/process/extensions/constants';

describe('extension constants', () => {
  describe('static constants', () => {
    it('EXTENSION_MANIFEST_FILE should be aion-extension.json', () => {
      expect(EXTENSION_MANIFEST_FILE).toBe('aion-extension.json');
    });

    it('HUB_REMOTE_URLS should be a non-empty array of URLs', () => {
      expect(HUB_REMOTE_URLS.length).toBeGreaterThan(0);
      for (const url of HUB_REMOTE_URLS) {
        expect(url).toMatch(/^https:\/\//);
      }
    });
  });

  describe('getUserExtensionsDir', () => {
    it('should return data path + extensions', () => {
      expect(getUserExtensionsDir()).toBe(path.join('/home/user/.aionui-dev', 'extensions'));
    });
  });

  describe('getAppDataExtensionsDir', () => {
    it('should return appData path + extensions', () => {
      expect(getAppDataExtensionsDir()).toBe(path.join('/appdata', 'extensions'));
    });
  });

  describe('getEnvExtensionsDirs', () => {
    const originalEnv = process.env.AIONUI_EXTENSIONS_PATH;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.AIONUI_EXTENSIONS_PATH;
      } else {
        process.env.AIONUI_EXTENSIONS_PATH = originalEnv;
      }
    });

    it('should return empty array when env var is not set', () => {
      delete process.env.AIONUI_EXTENSIONS_PATH;
      expect(getEnvExtensionsDirs()).toEqual([]);
    });

    it('should split env var by path separator', () => {
      const sep = process.platform === 'win32' ? ';' : ':';
      process.env.AIONUI_EXTENSIONS_PATH = `/path/a${sep}/path/b`;
      expect(getEnvExtensionsDirs()).toEqual(['/path/a', '/path/b']);
    });

    it('should filter out empty segments', () => {
      const sep = process.platform === 'win32' ? ';' : ':';
      process.env.AIONUI_EXTENSIONS_PATH = `/path/a${sep}${sep}/path/b`;
      const dirs = getEnvExtensionsDirs();
      expect(dirs).toEqual(['/path/a', '/path/b']);
    });
  });

  describe('getHubResourcesDir', () => {
    it('should return resources/hub in dev mode', () => {
      const dir = getHubResourcesDir();
      expect(dir).toContain('hub');
      expect(dir).toContain('resources');
    });
  });

  describe('getExtensionScanSources', () => {
    const originalEnv = process.env.AIONUI_EXTENSIONS_PATH;
    const originalE2E = process.env.AIONUI_E2E_TEST;

    afterEach(() => {
      if (originalEnv === undefined) delete process.env.AIONUI_EXTENSIONS_PATH;
      else process.env.AIONUI_EXTENSIONS_PATH = originalEnv;
      if (originalE2E === undefined) delete process.env.AIONUI_E2E_TEST;
      else process.env.AIONUI_E2E_TEST = originalE2E;
    });

    it('should return user and appdata dirs by default', () => {
      delete process.env.AIONUI_EXTENSIONS_PATH;
      delete process.env.AIONUI_E2E_TEST;
      const sources = getExtensionScanSources();
      expect(sources.length).toBeGreaterThanOrEqual(1);
      expect(sources.find((s) => s.source === 'local')).toBeDefined();
    });

    it('should include env dirs with highest priority when set', () => {
      process.env.AIONUI_EXTENSIONS_PATH = '/custom/ext';
      delete process.env.AIONUI_E2E_TEST;
      const sources = getExtensionScanSources();
      expect(sources[0].source).toBe('env');
      expect(sources[0].dir).toContain('custom');
    });

    it('should only include env dirs in E2E mode', () => {
      process.env.AIONUI_EXTENSIONS_PATH = '/e2e/ext';
      process.env.AIONUI_E2E_TEST = '1';
      const sources = getExtensionScanSources();
      expect(sources.every((s) => s.source === 'env')).toBe(true);
    });

    it('should deduplicate directories', () => {
      delete process.env.AIONUI_EXTENSIONS_PATH;
      delete process.env.AIONUI_E2E_TEST;
      const sources = getExtensionScanSources();
      const dirs = sources.map((s) => s.dir);
      expect(new Set(dirs).size).toBe(dirs.length);
    });
  });

  describe('getInstallTargetDir', () => {
    it('should return the first scan source directory', () => {
      delete process.env.AIONUI_EXTENSIONS_PATH;
      delete process.env.AIONUI_E2E_TEST;
      const dir = getInstallTargetDir();
      const sources = getExtensionScanSources();
      expect(dir).toBe(sources[0].dir);
    });

    it('should return env dir when AIONUI_EXTENSIONS_PATH is set', () => {
      process.env.AIONUI_EXTENSIONS_PATH = '/my/ext';
      delete process.env.AIONUI_E2E_TEST;
      const dir = getInstallTargetDir();
      expect(dir).toContain('my');
    });
  });
});
