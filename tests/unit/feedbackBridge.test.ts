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
}));

vi.mock('fs', () => ({
  existsSync: fsMock.existsSync,
  readFileSync: fsMock.readFileSync,
}));

describe('feedbackBridge', () => {
  let handler: () => Promise<{ filename: string; data: number[] } | null>;

  beforeEach(async () => {
    vi.resetModules();
    const { ipcMain } = await import('electron');
    await import('@process/bridge/feedbackBridge');
    // Extract the registered handler
    const handleCall = vi.mocked(ipcMain.handle).mock.calls.find(([channel]) => channel === 'feedback:collect-logs');
    expect(handleCall).toBeDefined();
    handler = handleCall![1] as typeof handler;
  });

  it('should register feedback:collect-logs IPC handler', async () => {
    const { ipcMain } = await import('electron');
    expect(vi.mocked(ipcMain.handle)).toHaveBeenCalledWith('feedback:collect-logs', expect.any(Function));
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
});
