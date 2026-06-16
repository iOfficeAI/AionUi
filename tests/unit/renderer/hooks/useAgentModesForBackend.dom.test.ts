/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const { useAgentsMock } = vi.hoisted(() => ({
  useAgentsMock: vi.fn(),
}));

vi.mock('@/renderer/hooks/agent/useAgents', () => ({
  useAgents: useAgentsMock,
}));

import { useAgentModesForBackend } from '@/renderer/hooks/agent/useAgentModesForBackend';

describe('useAgentModesForBackend', () => {
  it('uses static backend modes without reading /api/agents data', () => {
    useAgentsMock.mockReturnValue({
      agents: [
        {
          id: 'agent-1',
          name: 'Codex',
          agent_type: 'acp',
          agent_source: 'builtin',
          enabled: true,
          available: true,
          backend: 'codex',
          handshake: {
            available_modes: {
              current_mode_id: 'read-only',
              available_modes: [
                { id: 'read-only', name: 'Read Only' },
                { id: 'auto', name: 'Auto' },
                { id: 'full-access', name: 'Full Access' },
              ],
            },
          },
        },
      ],
      isLoading: false,
      error: null,
      revalidate: vi.fn(),
      refreshCustomAgents: vi.fn(),
    });

    const { result } = renderHook(() => useAgentModesForBackend('codex'));

    expect(result.current).toEqual([
      { value: 'read-only', label: 'Read Only' },
      { value: 'auto', label: 'Default' },
      { value: 'full-access', label: 'Full Access' },
    ]);
    expect(useAgentsMock).not.toHaveBeenCalled();
  });

  it('falls back to static modes when handshake data is unavailable', () => {
    useAgentsMock.mockReturnValue({
      agents: [],
      isLoading: false,
      error: null,
      revalidate: vi.fn(),
      refreshCustomAgents: vi.fn(),
    });

    const { result } = renderHook(() => useAgentModesForBackend('codex'));

    expect(result.current.map((mode) => mode.value)).toEqual(['read-only', 'auto', 'full-access']);
    expect(useAgentsMock).not.toHaveBeenCalled();
  });
});
