import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { toggleServerInvoke, messageError } = vi.hoisted(() => ({
  toggleServerInvoke: vi.fn(),
  messageError: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@arco-design/web-react', () => ({
  Message: { error: messageError, success: vi.fn() },
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  mcpService: { toggleServer: { invoke: toggleServerInvoke } },
}));

vi.mock('@/common/adapter/httpBridge', () => ({
  isBackendHttpError: () => false,
}));

import type { IMcpServer } from '@/common/config/storage';
import { useMcpServerCRUD } from '@/renderer/hooks/mcp/useMcpServerCRUD';

const server = (overrides: Partial<IMcpServer> & { id: string }): IMcpServer => ({
  name: overrides.id,
  enabled: false,
  transport: { type: 'stdio', command: 'test' },
  created_at: 1,
  updated_at: 1,
  original_json: '{}',
  ...overrides,
});

describe('useMcpServerCRUD handleToggleServerDefault', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists the flip via the toggle endpoint and updates local state (#3119)', async () => {
    const original = server({ id: 'memory', enabled: false });
    toggleServerInvoke.mockResolvedValue({ ...original, enabled: true, updated_at: 2 });
    const saveMcpServers = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => useMcpServerCRUD(saveMcpServers));
    let toggled: IMcpServer | undefined;
    await act(async () => {
      toggled = await result.current.handleToggleServerDefault(original);
    });

    expect(toggleServerInvoke).toHaveBeenCalledWith({ id: 'memory' });
    expect(toggled?.enabled).toBe(true);
    // Persistence round-trip: the updater swaps in the backend-persisted server.
    const updater = saveMcpServers.mock.calls[0][0] as (prev: IMcpServer[]) => IMcpServer[];
    const next = updater([original, server({ id: 'other' })]);
    expect(next.find((s) => s.id === 'memory')?.enabled).toBe(true);
    expect(next.find((s) => s.id === 'other')?.enabled).toBe(false);
  });

  it('surfaces backend failures without touching local state', async () => {
    toggleServerInvoke.mockRejectedValue(new Error('boom'));
    const saveMcpServers = vi.fn();

    const { result } = renderHook(() => useMcpServerCRUD(saveMcpServers));
    let toggled: IMcpServer | undefined;
    await act(async () => {
      toggled = await result.current.handleToggleServerDefault(server({ id: 'memory' }));
    });

    expect(toggled).toBeUndefined();
    expect(saveMcpServers).not.toHaveBeenCalled();
    expect(messageError).toHaveBeenCalledOnce();
  });
});
