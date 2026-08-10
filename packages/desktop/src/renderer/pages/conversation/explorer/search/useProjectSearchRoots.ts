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
  // Derive the project id from the SWR key, NOT the `projectId` closure. This
  // hook rides the SAME `explorer-project/<id>` key as the Explorer column, so
  // SWR dedups both consumers into one fetch. If that fetch is issued by a stale
  // closure (a rapid project switch left this render behind), a closure-captured
  // id would fetch the WRONG project yet store the result under the CURRENT key —
  // poisoning the shared entry so the Explorer paints another project's tree.
  // Deriving from the key makes a fetch's result always match the entry it fills.
  const { data } = useSWR(projectId ? `explorer-project/${projectId}` : null, (key: string) => {
    const id = key.slice('explorer-project/'.length);
    return ipcBridge.project.get.invoke({ project_id: id });
  });

  return useMemo<ProjectSearchRoots>(() => {
    if (!data) return { roots: [], peNames: {} };
    const refs = toRootRefs(data);
    return {
      roots: refs.map((root) => ({ pe_id: root.pe_id, relative_path: '' })),
      peNames: Object.fromEntries(refs.map((root) => [root.pe_id, root.title])),
    };
  }, [data]);
};
