/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('deepLink module', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    vi.doMock('electron', () => ({}));
    vi.doMock('@/common', () => ({
      ipcBridge: {
        deepLink: {
          received: { emit: vi.fn() },
        },
      },
    }));
  });

  afterEach(() => {
    vi.doUnmock('electron');
    vi.doUnmock('@/common');
  });

  describe('parseDeepLinkUrl', () => {
    it('should parse simple deep link URL', async () => {
      const { parseDeepLinkUrl } = await import('@process/utils/deepLink');
      const result = parseDeepLinkUrl('aionui://add-provider?baseUrl=http://localhost&apiKey=sk-123');

      expect(result).toEqual({
        action: 'add-provider',
        params: { baseUrl: 'http://localhost', apiKey: 'sk-123' },
      });
    });

    it('should parse deep link with path segments', async () => {
      const { parseDeepLinkUrl } = await import('@process/utils/deepLink');
      const result = parseDeepLinkUrl('aionui://provider/add?v=1');

      expect(result).toEqual({
        action: 'provider/add',
        params: { v: '1' },
      });
    });

    it('should decode base64 data param and merge into params', async () => {
      const { parseDeepLinkUrl } = await import('@process/utils/deepLink');
      const data = Buffer.from(JSON.stringify({ baseUrl: 'http://test', apiKey: 'key123' })).toString('base64');
      const result = parseDeepLinkUrl(`aionui://provider/add?v=1&data=${data}`);

      expect(result).not.toBeNull();
      expect(result!.params.baseUrl).toBe('http://test');
      expect(result!.params.apiKey).toBe('key123');
      expect(result!.params.data).toBeUndefined();
    });

    it('should handle invalid base64 data gracefully', async () => {
      const { parseDeepLinkUrl } = await import('@process/utils/deepLink');
      const result = parseDeepLinkUrl('aionui://add?data=not-valid-base64!!!');

      expect(result).not.toBeNull();
      expect(result!.params.data).toBeUndefined();
    });

    it('should return null for non-aionui protocol', async () => {
      const { parseDeepLinkUrl } = await import('@process/utils/deepLink');
      expect(parseDeepLinkUrl('https://example.com')).toBeNull();
    });

    it('should return null for invalid URL', async () => {
      const { parseDeepLinkUrl } = await import('@process/utils/deepLink');
      expect(parseDeepLinkUrl('not a url at all')).toBeNull();
    });
  });

  describe('handleDeepLinkUrl', () => {
    it('should queue URL when no window is set', async () => {
      const { handleDeepLinkUrl, getPendingDeepLinkUrl } = await import('@process/utils/deepLink');

      handleDeepLinkUrl('aionui://test-action?key=val');

      expect(getPendingDeepLinkUrl()).toBe('aionui://test-action?key=val');
    });

    it('should emit via ipcBridge when window is available', async () => {
      const { ipcBridge } = await import('@/common');
      const { handleDeepLinkUrl, setDeepLinkMainWindow } = await import('@process/utils/deepLink');

      const mockWindow = { isDestroyed: () => false } as any;
      setDeepLinkMainWindow(mockWindow);

      handleDeepLinkUrl('aionui://test-action?key=val');

      expect(ipcBridge.deepLink.received.emit).toHaveBeenCalledWith({
        action: 'test-action',
        params: { key: 'val' },
      });
    });

    it('should not emit for invalid URLs', async () => {
      const { ipcBridge } = await import('@/common');
      const { handleDeepLinkUrl, setDeepLinkMainWindow } = await import('@process/utils/deepLink');

      setDeepLinkMainWindow({ isDestroyed: () => false } as any);
      handleDeepLinkUrl('https://not-deep-link.com');

      expect(ipcBridge.deepLink.received.emit).not.toHaveBeenCalled();
    });
  });

  describe('pending URL state', () => {
    it('should clear pending URL', async () => {
      const { handleDeepLinkUrl, getPendingDeepLinkUrl, clearPendingDeepLinkUrl } =
        await import('@process/utils/deepLink');

      handleDeepLinkUrl('aionui://test');
      expect(getPendingDeepLinkUrl()).toBe('aionui://test');

      clearPendingDeepLinkUrl();
      expect(getPendingDeepLinkUrl()).toBeNull();
    });
  });
});
