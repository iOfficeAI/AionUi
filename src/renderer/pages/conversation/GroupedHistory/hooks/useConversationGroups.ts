/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import { emitter } from '@/renderer/utils/emitter';
import { useCallback, useSyncExternalStore } from 'react';

export type GroupDef = {
  id: string;
  name: string;
};

const STORAGE_KEY = 'conversation.groups';

let cachedGroups: GroupDef[] | null = null;
const listeners = new Set<() => void>();

const loadGroups = (): GroupDef[] => {
  if (cachedGroups !== null) return cachedGroups;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        cachedGroups = parsed.filter(
          (g: unknown): g is GroupDef =>
            typeof g === 'object' &&
            g !== null &&
            typeof (g as GroupDef).id === 'string' &&
            typeof (g as GroupDef).name === 'string'
        );
        return cachedGroups;
      }
    }
  } catch {
    // ignore
  }
  cachedGroups = [];
  return cachedGroups;
};

const saveGroups = (groups: GroupDef[]): void => {
  cachedGroups = groups;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
  } catch {
    // ignore
  }
  listeners.forEach((fn) => fn());
};

const subscribe = (callback: () => void) => {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
};

/** Hook for managing custom conversation groups. */
export const useConversationGroups = () => {
  const groups = useSyncExternalStore(subscribe, loadGroups, loadGroups);

  const createGroup = useCallback(
    (name: string): GroupDef | null => {
      const trimmed = name.trim();
      if (!trimmed || groups.some((g) => g.name === trimmed)) return null;
      const newGroup: GroupDef = { id: crypto.randomUUID(), name: trimmed };
      saveGroups([...groups, newGroup]);
      return newGroup;
    },
    [groups]
  );

  const renameGroup = useCallback(
    async (groupId: string, newName: string, conversations: TChatConversation[]): Promise<boolean> => {
      const trimmed = newName.trim();
      if (!trimmed || groups.some((g) => g.name === trimmed && g.id !== groupId)) return false;

      const group = groups.find((g) => g.id === groupId);
      if (!group) return false;

      const oldName = group.name;
      const updatedGroups = groups.map((g) => (g.id === groupId ? { ...g, name: trimmed } : g));
      saveGroups(updatedGroups);

      // Update all conversations that had the old group name
      const affected = conversations.filter((c) => {
        const extra = c.extra as { groupName?: string } | undefined;
        return extra?.groupName === oldName;
      });

      try {
        await Promise.all(
          affected.map((c) =>
            ipcBridge.conversation.update.invoke({
              id: c.id,
              updates: {
                extra: { groupName: trimmed } as Partial<TChatConversation['extra']>,
              } as Partial<TChatConversation>,
              mergeExtra: true,
            })
          )
        );
        if (affected.length > 0) {
          emitter.emit('chat.history.refresh');
        }
      } catch (error) {
        console.error('[useConversationGroups] renameGroup failed:', error);
      }

      return true;
    },
    [groups]
  );

  const deleteGroup = useCallback(
    async (groupId: string, conversations: TChatConversation[]): Promise<void> => {
      const group = groups.find((g) => g.id === groupId);
      if (!group) return;

      const updatedGroups = groups.filter((g) => g.id !== groupId);
      saveGroups(updatedGroups);

      // Remove groupName from all conversations in this group
      const affected = conversations.filter((c) => {
        const extra = c.extra as { groupName?: string } | undefined;
        return extra?.groupName === group.name;
      });

      try {
        await Promise.all(
          affected.map((c) =>
            ipcBridge.conversation.update.invoke({
              id: c.id,
              updates: {
                extra: { groupName: undefined } as Partial<TChatConversation['extra']>,
              } as Partial<TChatConversation>,
              mergeExtra: true,
            })
          )
        );
        if (affected.length > 0) {
          emitter.emit('chat.history.refresh');
        }
      } catch (error) {
        console.error('[useConversationGroups] deleteGroup failed:', error);
      }
    },
    [groups]
  );

  const moveToGroup = useCallback(async (conversation: TChatConversation, groupName: string | null): Promise<void> => {
    try {
      await ipcBridge.conversation.update.invoke({
        id: conversation.id,
        updates: {
          extra: { groupName: groupName ?? undefined } as Partial<TChatConversation['extra']>,
        } as Partial<TChatConversation>,
        mergeExtra: true,
      });
      emitter.emit('chat.history.refresh');
    } catch (error) {
      console.error('[useConversationGroups] moveToGroup failed:', error);
    }
  }, []);

  return { groups, createGroup, renameGroup, deleteGroup, moveToGroup };
};
