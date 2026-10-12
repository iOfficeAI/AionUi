import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcMain, type WebContents, webContents } from 'electron';
import { getBrowserWebContents, registerBrowserService } from '@process/services/browserService';

vi.mock('electron', () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    ipcMain: {
      _handlers: handlers,
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler);
      }),
    },
    webContents: {
      getAllWebContents: vi.fn(),
    },
  };
});

describe('browserService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should find browser webview webContents', () => {
    const mockWc1 = {
      getType: () => 'window',
      isDestroyed: () => false,
    } as unknown as WebContents;
    const mockWc2 = {
      getType: () => 'webview',
      isDestroyed: () => false,
    } as unknown as WebContents;
    vi.mocked(webContents.getAllWebContents).mockReturnValue([mockWc1, mockWc2]);

    const result = getBrowserWebContents();
    expect(result).toBe(mockWc2);
  });

  it('should handle browser:navigate with valid url', async () => {
    registerBrowserService();
    const mockLoadURL = vi.fn().mockResolvedValue(undefined);
    const mockGetURL = vi.fn().mockReturnValue('https://example.com');
    const mockWc = {
      getType: () => 'webview',
      getURL: mockGetURL,
      isDestroyed: () => false,
      loadURL: mockLoadURL,
    } as unknown as WebContents;
    vi.mocked(webContents.getAllWebContents).mockReturnValue([mockWc]);

    const handlers = (ipcMain as unknown as { _handlers: Map<string, (...args: unknown[]) => unknown> })._handlers;
    const navigateHandler = handlers.get('browser:navigate');
    expect(navigateHandler).toBeDefined();

    const res = await navigateHandler?.({}, 'example.com');
    expect(mockLoadURL).toHaveBeenCalledWith('https://example.com');
    expect(res).toEqual({ success: true, url: 'https://example.com' });
  });

  it('should handle browser:click with selector', async () => {
    registerBrowserService();
    const mockExecuteJavaScript = vi.fn().mockResolvedValue({ success: true });
    const mockWc = {
      executeJavaScript: mockExecuteJavaScript,
      getType: () => 'webview',
      isDestroyed: () => false,
    } as unknown as WebContents;
    vi.mocked(webContents.getAllWebContents).mockReturnValue([mockWc]);

    const handlers = (ipcMain as unknown as { _handlers: Map<string, (...args: unknown[]) => unknown> })._handlers;
    const clickHandler = handlers.get('browser:click');
    expect(clickHandler).toBeDefined();

    const res = await clickHandler?.({}, '#submit-btn');
    expect(mockExecuteJavaScript).toHaveBeenCalled();
    expect(res).toEqual({ success: true });
  });

  it('should handle browser:type with selector and text', async () => {
    registerBrowserService();
    const mockExecuteJavaScript = vi.fn().mockResolvedValue({ success: true });
    const mockWc = {
      executeJavaScript: mockExecuteJavaScript,
      getType: () => 'webview',
      isDestroyed: () => false,
    } as unknown as WebContents;
    vi.mocked(webContents.getAllWebContents).mockReturnValue([mockWc]);

    const handlers = (ipcMain as unknown as { _handlers: Map<string, (...args: unknown[]) => unknown> })._handlers;
    const typeHandler = handlers.get('browser:type');
    expect(typeHandler).toBeDefined();

    const res = await typeHandler?.({}, '#search-input', 'hello world');
    expect(mockExecuteJavaScript).toHaveBeenCalled();
    expect(res).toEqual({ success: true });
  });

  it('should handle browser:scroll with coordinates', async () => {
    registerBrowserService();
    const mockExecuteJavaScript = vi.fn().mockResolvedValue({ scrollX: 0, scrollY: 100, success: true });
    const mockWc = {
      executeJavaScript: mockExecuteJavaScript,
      getType: () => 'webview',
      isDestroyed: () => false,
    } as unknown as WebContents;
    vi.mocked(webContents.getAllWebContents).mockReturnValue([mockWc]);

    const handlers = (ipcMain as unknown as { _handlers: Map<string, (...args: unknown[]) => unknown> })._handlers;
    const scrollHandler = handlers.get('browser:scroll');
    expect(scrollHandler).toBeDefined();

    const res = await scrollHandler?.({}, 0, 100);
    expect(mockExecuteJavaScript).toHaveBeenCalled();
    expect(res).toEqual({ scrollX: 0, scrollY: 100, success: true });
  });

  it('should handle browser:screenshot', async () => {
    registerBrowserService();
    const mockCapturePage = vi.fn().mockResolvedValue({
      toDataURL: () => 'data:image/png;base64,mockImageData',
    });
    const mockWc = {
      capturePage: mockCapturePage,
      getType: () => 'webview',
      isDestroyed: () => false,
    } as unknown as WebContents;
    vi.mocked(webContents.getAllWebContents).mockReturnValue([mockWc]);

    const handlers = (ipcMain as unknown as { _handlers: Map<string, (...args: unknown[]) => unknown> })._handlers;
    const screenshotHandler = handlers.get('browser:screenshot');
    expect(screenshotHandler).toBeDefined();

    const res = await screenshotHandler?.({});
    expect(mockCapturePage).toHaveBeenCalled();
    expect(res).toEqual({
      data: 'data:image/png;base64,mockImageData',
      success: true,
    });
  });

  it('should return error if webview is not found', async () => {
    registerBrowserService();
    vi.mocked(webContents.getAllWebContents).mockReturnValue([]);

    const handlers = (ipcMain as unknown as { _handlers: Map<string, (...args: unknown[]) => unknown> })._handlers;
    const navigateHandler = handlers.get('browser:navigate');
    const res = await navigateHandler?.({}, 'https://example.com');
    expect(res).toEqual({
      error: 'Browser webview not found',
      success: false,
    });
  });
});
