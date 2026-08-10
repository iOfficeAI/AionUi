import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TeamPreset } from '@/common/types/team/teamTypes';
import { useTeamPresets } from '@/renderer/pages/team/TeamPresets/hooks/useTeamPresets';

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

const { eventChannel, listInvoke, createInvoke, updateInvoke, deleteInvoke } = vi.hoisted(() => ({
  eventChannel: { on: vi.fn(() => () => {}) },
  listInvoke: vi.fn(),
  createInvoke: vi.fn(),
  updateInvoke: vi.fn(),
  deleteInvoke: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      listChanged: eventChannel,
      created: eventChannel,
      removed: eventChannel,
      renamed: eventChannel,
    },
    teamPreset: {
      list: { invoke: listInvoke },
      create: { invoke: createInvoke },
      update: { invoke: updateInvoke },
      delete: { invoke: deleteInvoke },
    },
  },
}));

function swrWrapper({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>;
}

function preset(overrides?: Partial<TeamPreset>): TeamPreset {
  return {
    id: 'preset-1',
    user_id: 'user-1',
    name: 'Code Review',
    category: 'Engineering',
    description: 'A review panel',
    expertise_tags: ['review'],
    example_prompts: ['Audit this'],
    leader: {
      assistant_backend: 'acp',
      assistant_id: 'lead-1',
      assistant_name: 'Lead',
      role: 'leader',
      order: 0,
    },
    members: [
      {
        assistant_backend: 'acp',
        assistant_id: 'lead-1',
        assistant_name: 'Lead',
        role: 'leader',
        order: 0,
      },
      {
        assistant_backend: 'acp',
        assistant_id: 'worker-1',
        assistant_name: 'Worker',
        role: 'teammate',
        order: 1,
      },
    ],
    version: 1,
    created_at: new Date(1700000000000).toISOString(),
    updated_at: new Date(1700000000000).toISOString(),
    ...overrides,
  };
}

const createInput = {
  user_id: '',
  name: 'New Preset',
  category: 'Writing',
  description: 'desc',
  expertise_tags: ['tag'],
  example_prompts: ['prompt'],
  leader: preset().leader,
  members: preset().members,
};

describe('useTeamPresets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listInvoke.mockResolvedValue([preset()]);
    createInvoke.mockResolvedValue(preset({ id: 'preset-created' }));
    updateInvoke.mockResolvedValue(preset({ name: 'Updated' }));
    deleteInvoke.mockResolvedValue(undefined);
  });

  it('loads presets for the current user', async () => {
    const { result } = renderHook(() => useTeamPresets(), { wrapper: swrWrapper });

    await waitFor(() => expect(result.current.presets).toHaveLength(1));
    expect(result.current.presets[0].id).toBe('preset-1');
    expect(listInvoke).toHaveBeenCalledWith({ user_id: 'user-1' });
  });

  it('createPreset returns an optimistic preset and calls the backend', async () => {
    const { result } = renderHook(() => useTeamPresets(), { wrapper: swrWrapper });
    await waitFor(() => expect(result.current.presets).toHaveLength(1));

    let created: TeamPreset | undefined;
    await act(async () => {
      created = result.current.createPreset(createInput);
    });

    expect(created).toBeDefined();
    expect(created!.name).toBe('New Preset');
    expect(created!.user_id).toBe('user-1');
    expect(created!.id).toBeTruthy();
    expect(createInvoke).toHaveBeenCalledWith(createInput);
  });

  it('updatePreset returns an optimistic merged preset and calls the backend', async () => {
    const { result } = renderHook(() => useTeamPresets(), { wrapper: swrWrapper });
    await waitFor(() => expect(result.current.presets).toHaveLength(1));

    let updated: TeamPreset | null = null;
    await act(async () => {
      updated = result.current.updatePreset('preset-1', { name: 'Updated Name' });
    });

    expect(updated).toBeDefined();
    expect(updated!.name).toBe('Updated Name');
    expect(updated!.version).toBe(2);
    expect(updateInvoke).toHaveBeenCalledWith({ id: 'preset-1', input: { name: 'Updated Name' } });
  });

  it('updatePreset returns null for an unknown id', async () => {
    const { result } = renderHook(() => useTeamPresets(), { wrapper: swrWrapper });
    await waitFor(() => expect(result.current.presets).toHaveLength(1));

    await act(async () => {
      expect(result.current.updatePreset('missing', { name: 'X' })).toBeNull();
    });
    expect(updateInvoke).not.toHaveBeenCalled();
  });

  it('removePreset returns true and calls the backend', async () => {
    const { result } = renderHook(() => useTeamPresets(), { wrapper: swrWrapper });
    await waitFor(() => expect(result.current.presets).toHaveLength(1));

    let removed = false;
    await act(async () => {
      removed = result.current.removePreset('preset-1');
    });

    expect(removed).toBe(true);
    expect(deleteInvoke).toHaveBeenCalledWith({ id: 'preset-1' });
  });

  it('removePreset returns false for an unknown id', async () => {
    const { result } = renderHook(() => useTeamPresets(), { wrapper: swrWrapper });
    await waitFor(() => expect(result.current.presets).toHaveLength(1));

    await act(async () => {
      expect(result.current.removePreset('missing')).toBe(false);
    });
    expect(deleteInvoke).not.toHaveBeenCalled();
  });

  it('surfaces backend errors', async () => {
    listInvoke.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useTeamPresets(), { wrapper: swrWrapper });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.error).toBeInstanceOf(Error);
  });
});
