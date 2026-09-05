/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import { Message } from '@arco-design/web-react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

import type { SplitGroup, SplitGroupPatch } from '../utils/splitGroupHelpers';
import { planAddSplitGroupMember, planCreateSplitGroup, planRemoveSplitGroupMember } from '../utils/splitGroupHelpers';
import { refreshConversationList } from './useConversationListSync';

export const splitGroupRoute = (group_id: string): string => `/split/${group_id}`;

/**
 * Persist a planned set of tag patches through the conversation update call
 * (merge-patched into `extra`, next to pin state and sort order), then reload
 * the sidebar list so the pill exists before anyone navigates to it. A backend
 * refusal is an error, never a silent partial group.
 */
const applySplitGroupPatches = async (patches: SplitGroupPatch[]): Promise<void> => {
  if (patches.length === 0) return;
  const results = await Promise.all(
    patches.map((patch) =>
      ipcBridge.conversation.update.invoke({
        id: patch.conversation_id,
        updates: {
          extra: { split_group: patch.split_group } as Partial<TChatConversation['extra']>,
        } as Partial<TChatConversation>,
        merge_extra: true,
      })
    )
  );
  const rejected = patches.filter((_, index) => !results[index]).map((patch) => patch.conversation_id);
  if (rejected.length > 0) {
    throw new Error(`split_group update rejected for ${rejected.join(', ')}`);
  }
  await refreshConversationList();
};

type OpenOption = {
  /** Navigate to the group's columns once the change has landed. */
  open?: boolean;
};

/**
 * The three things a user can do to a split group, each persisted on the
 * member conversations and reported loudly when the backend refuses.
 */
export const useSplitGroupMutations = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const run = useCallback(
    async (label: string, mutation: () => Promise<void>): Promise<boolean> => {
      try {
        await mutation();
        return true;
      } catch (error) {
        console.error(`[SplitGroup] ${label} failed:`, error);
        Message.error(t('conversation.splitGroup.updateFailed'));
        return false;
      }
    },
    [t]
  );

  const createGroup = useCallback(
    async (target_id: string, dragged_id: string, { open = false }: OpenOption = {}): Promise<void> => {
      const patches = planCreateSplitGroup(target_id, dragged_id);
      const group_id = patches[0].split_group?.id ?? '';
      const ok = await run('create', () => applySplitGroupPatches(patches));
      if (ok && open) void navigate(splitGroupRoute(group_id), { state: { focus: dragged_id } });
    },
    [navigate, run]
  );

  const addMember = useCallback(
    async (group: SplitGroup, conversation_id: string, { open = false }: OpenOption = {}): Promise<void> => {
      const ok = await run('add member', () => applySplitGroupPatches(planAddSplitGroupMember(group, conversation_id)));
      if (ok && open) void navigate(splitGroupRoute(group.id), { state: { focus: conversation_id } });
    },
    [navigate, run]
  );

  const removeMember = useCallback(
    async (group: SplitGroup, conversation_id: string): Promise<void> => {
      const removal = planRemoveSplitGroupMember(group, conversation_id);
      const ok = await run('remove member', () => applySplitGroupPatches(removal.patches));
      // A group that dissolved while its columns were open leaves the survivor
      // on screen as a plain conversation, where the user was already looking.
      if (ok && removal.dissolved && location.pathname === splitGroupRoute(group.id)) {
        void navigate(`/conversation/${removal.remaining[0]}`, { replace: true });
      }
    },
    [location.pathname, navigate, run]
  );

  return { createGroup, addMember, removeMember };
};
