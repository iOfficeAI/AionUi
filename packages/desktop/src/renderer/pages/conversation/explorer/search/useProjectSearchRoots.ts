/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Resolve the current project's bound folders as search roots (`DirRef[]`, each
 * a pe root with `relative_path = ''`). Rides the same SWR key the Explorer
 * column uses (`explorer-project/<id>`), so it dedups the fetch — no extra
 * round-trip. Empty when there is no current project (no-project conversation):
 * that emptiness is the gate the `@`-mention path reads to decide fs/search vs
 * the legacy workspace-list fallback (see search.md; SendBox mention wiring).
 */

import { useMemo } from 'react';
import useSWR from 'swr';

import { ipcBridge } from '@/common';

import type { DirRef } from '../explorerModel';
import { toRootRefs } from '../projectRoots';
import { useCurrentProject } from '../currentProjectStore';
import type { PeNameMap } from './searchModel';

export type ProjectSearchRoots = {
  /** Search roots: one pe root per bound folder (relative_path=''). */
  roots: DirRef[];
  /** pe_id → folder name, for the `PE · REL` secondary label (multi-folder). */
  peNames: PeNameMap;
};

export const useProjectSearchRoots = (): ProjectSearchRoots => {
  const projectId = useCurrentProject();
  const { data } = useSWR(projectId ? `explorer-project/${projectId}` : null, () =>
    ipcBridge.project.get.invoke({ project_id: projectId as string })
  );

  return useMemo<ProjectSearchRoots>(() => {
    if (!data) return { roots: [], peNames: {} };
    const refs = toRootRefs(data);
    return {
      roots: refs.map((root) => ({ pe_id: root.pe_id, relative_path: '' })),
      peNames: Object.fromEntries(refs.map((root) => [root.pe_id, root.title])),
    };
  }, [data]);
};
