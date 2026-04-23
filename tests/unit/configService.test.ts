import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
vi.stubGlobal('window', { __backendPort: 13400 });

function mockFetchResponse(data: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve({ success: true, data }),
  });
}

function mockFetchVoid() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    headers: { get: () => null },
  });
}

const { configService } = await import('@/common/config/configService');

describe('ConfigService', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    configService.reset();
  });

  describe('initialize', () => {
    it('should batch-load all config from backend', async () => {
      mockFetchResponse({ theme: 'dark', language: 'zh-CN' });
      await configService.initialize();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/settings/client'),
        expect.objectContaining({ method: 'GET' }),
      );
      expect(configService.get('theme')).toBe('dark');
      expect(configService.get('language')).toBe('zh-CN');
    });

    it('should handle empty response', async () => {
      mockFetchResponse({});
      await configService.initialize();
      expect(configService.get('theme')).toBeUndefined();
    });

    it('should handle null response', async () => {
      mockFetchResponse(null);
      await configService.initialize();
      expect(configService.isInitialized()).toBe(true);
    });
  });

  describe('get', () => {
    it('should return undefined for missing keys', async () => {
      mockFetchResponse({});
      await configService.initialize();
      expect(configService.get('theme')).toBeUndefined();
    });

    it('should return correct value for existing keys', async () => {
      mockFetchResponse({ 'ui.zoomFactor': 1.5 });
      await configService.initialize();
      expect(configService.get('ui.zoomFactor')).toBe(1.5);
    });
  });

  describe('set', () => {
    it('should update cache and send PUT to backend', async () => {
      mockFetchResponse({});
      await configService.initialize();
      mockFetchVoid();
      await configService.set('theme', 'dark');
      expect(configService.get('theme')).toBe('dark');
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('/api/settings/client'),
        expect.objectContaining({ method: 'PUT' }),
      );
    });

    it('should update cache immediately before HTTP completes', async () => {
      mockFetchResponse({});
      await configService.initialize();
      let resolveHttp: () => void;
      mockFetch.mockReturnValueOnce(
        new Promise<{ ok: boolean; headers: { get: () => null } }>((r) => {
          resolveHttp = () => r({ ok: true, headers: { get: () => null } });
        }),
      );
      const setPromise = configService.set('language', 'en-US');
      expect(configService.get('language')).toBe('en-US');
      resolveHttp!();
      await setPromise;
    });
  });

  describe('remove', () => {
    it('should remove from cache and send null to backend', async () => {
      mockFetchResponse({ theme: 'dark' });
      await configService.initialize();
      mockFetchVoid();
      await configService.remove('theme');
      expect(configService.get('theme')).toBeUndefined();
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      expect(JSON.parse(lastCall[1].body as string)).toEqual({ theme: null });
    });
  });

  describe('setBatch', () => {
    it('should update multiple keys and send single PUT', async () => {
      mockFetchResponse({});
      await configService.initialize();
      mockFetchVoid();
      await configService.setBatch({ theme: 'dark', language: 'zh-CN' });
      expect(configService.get('theme')).toBe('dark');
      expect(configService.get('language')).toBe('zh-CN');
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      expect(JSON.parse(lastCall[1].body as string)).toEqual({ theme: 'dark', language: 'zh-CN' });
    });
  });

  describe('subscribe', () => {
    it('should notify subscribers on set', async () => {
      mockFetchResponse({});
      await configService.initialize();
      const callback = vi.fn();
      configService.subscribe('theme', callback);
      mockFetchVoid();
      await configService.set('theme', 'dark');
      expect(callback).toHaveBeenCalledWith('dark');
    });

    it('should return unsubscribe function', async () => {
      mockFetchResponse({});
      await configService.initialize();
      const callback = vi.fn();
      const unsubscribe = configService.subscribe('theme', callback);
      unsubscribe();
      mockFetchVoid();
      await configService.set('theme', 'dark');
      expect(callback).not.toHaveBeenCalled();
    });

    it('should notify subscribers on remove', async () => {
      mockFetchResponse({ theme: 'dark' });
      await configService.initialize();
      const callback = vi.fn();
      configService.subscribe('theme', callback);
      mockFetchVoid();
      await configService.remove('theme');
      expect(callback).toHaveBeenCalledWith(undefined);
    });

    it('should notify subscribers on setBatch', async () => {
      mockFetchResponse({});
      await configService.initialize();
      const themeCallback = vi.fn();
      const langCallback = vi.fn();
      configService.subscribe('theme', themeCallback);
      configService.subscribe('language', langCallback);
      mockFetchVoid();
      await configService.setBatch({ theme: 'dark', language: 'zh-CN' });
      expect(themeCallback).toHaveBeenCalledWith('dark');
      expect(langCallback).toHaveBeenCalledWith('zh-CN');
    });
  });

  describe('error handling', () => {
    it('should throw on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });
      await expect(configService.initialize()).rejects.toThrow('ConfigService GET');
    });
  });
});
