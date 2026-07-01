import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/electron/preload', () => ({}));

const invoke = vi.fn();
const send = vi.fn();
const on = vi.fn();
const off = vi.fn();
const sendSync = vi.fn((channel: string) => {
  if (channel === 'get-backend-port') return 25808;
  if (channel === 'get-initial-language') return null;
  if (channel === 'get-backend-startup-failed') return false;
  if (channel === 'get-backend-startup-failure') return null;
  return null;
});
const exposeInMainWorld = vi.fn();

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld,
  },
  ipcRenderer: {
    invoke,
    off,
    on,
    send,
    sendSync,
  },
  webUtils: {
    getPathForFile: vi.fn(),
  },
}));

describe('recover corrupted database preload bridge', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    invoke.mockResolvedValue(undefined);
  });

  it('exposes a recovery method that invokes the main-process IPC channel', async () => {
    await import('@/preload/main');

    const electronApiCall = exposeInMainWorld.mock.calls.find(([key]) => key === 'electronAPI');
    const electronApi = electronApiCall?.[1] as { recoverCorruptedDatabase?: () => Promise<void> } | undefined;

    await electronApi?.recoverCorruptedDatabase?.();

    expect(invoke).toHaveBeenCalledWith('backend:recover-corrupted-database');
  });
});
