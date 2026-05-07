import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as zlib from 'zlib';

// Hoist mock state so it can be referenced inside vi.mock factories
const { fsMock } = vi.hoisted(() => ({
  fsMock: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  },
}));

// Mock electron modules
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'logs') return '/mock/logs';
      return '/mock/userData';
    }),
  },
  BrowserWindow: {
    fromWebContents: vi.fn(),
  },
}));

vi.mock('fs', () => ({
  existsSync: fsMock.existsSync,
  readFileSync: fsMock.readFileSync,
}));

describe('feedbackBridge', () => {
  let handler: () => Promise<{ filename: string; data: number[] } | null>;
  let screenshotHandler: (event: {
    sender: unknown;
  }) => Promise<{ filename: string; data: number[]; type: string } | null>;

  beforeEach(async () => {
    vi.resetModules();
    const { ipcMain, BrowserWindow } = await import('electron');
    fsMock.existsSync.mockReset();
    fsMock.readFileSync.mockReset();
    vi.mocked(BrowserWindow.fromWebContents).mockReset();
    await import('@process/bridge/feedbackBridge');
    // Extract the registered handler
    const handleCall = vi.mocked(ipcMain.handle).mock.calls.find(([channel]) => channel === 'feedback:collect-logs');
    expect(handleCall).toBeDefined();
    handler = handleCall![1] as typeof handler;
    const captureHandleCall = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(([channel]) => channel === 'feedback:capture-current-page');
    expect(captureHandleCall).toBeDefined();
    screenshotHandler = captureHandleCall![1] as typeof screenshotHandler;
  });

  it('should register feedback:collect-logs IPC handler', async () => {
    const { ipcMain } = await import('electron');
    expect(vi.mocked(ipcMain.handle)).toHaveBeenCalledWith('feedback:collect-logs', expect.any(Function));
  });

  it('should register feedback:capture-current-page IPC handler', async () => {
    const { ipcMain } = await import('electron');
    expect(vi.mocked(ipcMain.handle)).toHaveBeenCalledWith('feedback:capture-current-page', expect.any(Function));
  });

  it('should return null when no log files exist', async () => {
    fsMock.existsSync.mockReturnValue(false);
    const result = await handler();
    expect(result).toBeNull();
  });

  it('should return gzipped log data when files exist', async () => {
    const logContent = 'test log line\n';
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue(logContent);

    const result = await handler();
    expect(result).not.toBeNull();
    expect(result!.filename).toBe('logs.gz');
    expect(result!.data.length).toBeGreaterThan(0);

    // Verify the data is valid gzip
    const buffer = Buffer.from(result!.data);
    const decompressed = zlib.gunzipSync(buffer).toString();
    expect(decompressed).toContain('test log line');
  });

  it('should capture the current page as a png attachment', async () => {
    const { BrowserWindow } = await import('electron');

    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue({
      webContents: {
        capturePage: vi.fn().mockResolvedValue({
          toPNG: () => Buffer.from([1, 2, 3]),
        }),
      },
    } as never);

    const result = await screenshotHandler({ sender: {} });

    expect(result).not.toBeNull();
    expect(result?.type).toBe('image/png');
    expect(result?.filename).toMatch(/^page-screenshot-.*\.png$/);
    expect(result?.data).toEqual([1, 2, 3]);
  });

  it('should prefer debugger screenshot when available', async () => {
    const { BrowserWindow } = await import('electron');
    const attach = vi.fn();
    const detach = vi.fn();
    const sendCommand = vi.fn(async (command: string) => {
      if (command === 'Page.captureScreenshot') {
        return { data: Buffer.from([4, 5, 6]).toString('base64') };
      }

      return {};
    });

    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue({
      webContents: {
        debugger: {
          isAttached: vi.fn().mockReturnValue(false),
          attach,
          detach,
          sendCommand,
        },
        capturePage: vi.fn(),
      },
    } as never);

    const result = await screenshotHandler({ sender: {} });

    expect(result).not.toBeNull();
    expect(result?.data).toEqual([4, 5, 6]);
    expect(attach).toHaveBeenCalledWith('1.3');
    expect(sendCommand).toHaveBeenCalledWith('Page.enable');
    expect(sendCommand).toHaveBeenCalledWith('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
    });
    expect(detach).toHaveBeenCalled();
  });
});
