/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TeamPreset } from '@/common/types/team/teamTypes';
import type {
  CreateTeamPresetInput as CreateTeamPresetInputBase,
  UpdateTeamPresetInput as UpdateTeamPresetInputBase,
} from '@/common/adapter/teamMapper';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import { uuid } from '@/common/utils/utils';
import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';

export type CreateTeamPresetInput = CreateTeamPresetInputBase;
export type UpdateTeamPresetInput = UpdateTeamPresetInputBase;

export type UseTeamPresetsResult = {
  presets: TeamPreset[];
  loading: boolean;
  error: unknown;
  createPreset: (input: CreateTeamPresetInput) => TeamPreset;
  updatePreset: (id: string, input: UpdateTeamPresetInput) => TeamPreset | null;
  removePreset: (id: string) => boolean;
};

function nowIso(): string {
  return new Date().toISOString();
}

function makeOptimisticPreset(input: CreateTeamPresetInput, userId: string): TeamPreset {
  const now = nowIso();
  return {
    ...input,
    user_id: userId,
    id: uuid(36),
    version: 1,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Backend-backed hook for reusable Team presets.
 *
 * Reads are fetched via SWR from `/api/team-presets`. Mutations return an
 * optimistic preset immediately so callers (e.g., the editor modal) can keep
 * their synchronous interface, while SWR's optimistic update refreshes the
 * list in the background.
 */
export function useTeamPresets(_userId?: string): UseTeamPresetsResult {
  const { user } = useAuth();
  const userId = user?.id ?? 'system_default_user';

  const {
    data: presets = [],
    isLoading,
    error: swrError,
    mutate,
  } = useSWR<TeamPreset[]>(`team-presets/${userId}`, () => ipcBridge.teamPreset.list.invoke({ user_id: userId }), {
    revalidateOnFocus: false,
  });

  const [mutationError, setMutationError] = useState<unknown>(null);
  const error = useMemo(() => mutationError ?? swrError, [mutationError, swrError]);

  const createPreset = useCallback(
    (input: CreateTeamPresetInput) => {
      const optimistic = makeOptimisticPreset(input, userId);

      void mutate(
        async (current = []) => {
          const saved = await ipcBridge.teamPreset.create.invoke(input);
          return [saved, ...current];
        },
        {
          optimisticData: [optimistic, ...presets],
          rollbackOnError: true,
          revalidate: false,
        }
      ).catch((err: unknown) => {
        setMutationError(err);
      });

      return optimistic;
    },
    [userId, presets, mutate]
  );

  const updatePreset = useCallback(
    (id: string, input: UpdateTeamPresetInput) => {
      const existing = presets.find((preset) => preset.id === id);
      if (!existing) return null;

      const optimistic: TeamPreset = {
        ...existing,
        ...input,
        id,
        version: existing.version + 1,
        updated_at: nowIso(),
      };
      const optimisticList = presets.map((preset) => (preset.id === id ? optimistic : preset));

      void mutate(
        async (current = []) => {
          const saved = await ipcBridge.teamPreset.update.invoke({ id, input });
          return current.map((preset) => (preset.id === id ? saved : preset));
        },
        {
          optimisticData: optimisticList,
          rollbackOnError: true,
          revalidate: false,
        }
      ).catch((err: unknown) => {
        setMutationError(err);
      });

      return optimistic;
    },
    [presets, mutate]
  );

  const removePreset = useCallback(
    (id: string) => {
      const exists = presets.some((preset) => preset.id === id);
      if (!exists) return false;

      const optimisticList = presets.filter((preset) => preset.id !== id);

      void mutate(
        async () => {
          await ipcBridge.teamPreset.delete.invoke({ id });
          return optimisticList;
        },
        {
          optimisticData: optimisticList,
          rollbackOnError: true,
          revalidate: false,
        }
      ).catch((err: unknown) => {
        setMutationError(err);
      });

      return true;
    },
    [presets, mutate]
  );

  return {
    presets,
    loading: isLoading,
    error,
    createPreset,
    updatePreset,
    removePreset,
  };
}
