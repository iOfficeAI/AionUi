import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mcpService } from '@/common/adapter/ipcBridge';
import type { IMcpServer } from '@/common/config/storage';
import { useMcpServerCRUD } from '@/renderer/hooks/mcp/useMcpServerCRUD';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Message: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    set: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  mcpService: {
    createServer: { invoke: vi.fn() },
    batchImportServers: { invoke: vi.fn() },
    updateServer: { invoke: vi.fn() },
    deleteServer: { invoke: vi.fn() },
    toggleServer: { invoke: vi.fn() },
  },
}));

const server: IMcpServer = {
  id: 'mcp-1',
  name: 'chrome-devtools',
  description: '',
  enabled: false,
  transport: {
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'chrome-devtools-mcp@latest'],
  },
  status: 'disconnected',
  created_at: 0,
  updated_at: 0,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useMcpServerCRUD toggle pending state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps a server pending while its toggle request is in flight', async () => {
    const toggle = deferred<IMcpServer>();
    vi.mocked(mcpService.toggleServer.invoke).mockReturnValue(toggle.promise);
    const reloadMcpServers = vi.fn().mockResolvedValue([server]);
    const checkSingleServerInstallStatus = vi.fn().mockResolvedValue(undefined);
    const setAgentInstallStatus = vi.fn();

    const { result } = renderHook(() =>
      useMcpServerCRUD([server], reloadMcpServers, checkSingleServerInstallStatus, setAgentInstallStatus)
    );

    let togglePromise!: Promise<void>;
    act(() => {
      togglePromise = result.current.handleToggleMcpServer(server.id, true);
    });

    await waitFor(() => {
      expect(result.current.togglingServerIds.has(server.id)).toBe(true);
    });

    await act(async () => {
      toggle.resolve({ ...server, enabled: true });
      await togglePromise;
    });

    expect(result.current.togglingServerIds.has(server.id)).toBe(false);
  });
});
