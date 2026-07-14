import { mapAcpCommandsToSlashCommands } from '@/common/chat/slash/acpMapping';
import { isSlashCommandListEnabled } from '@/common/chat/slash/availability';
import type { SlashCommandItem } from '@/common/chat/slash/types';
import { ipcBridge } from '@/common';
import { ensureConversationRuntime } from '@/renderer/pages/conversation/utils/ensureConversationRuntime';
import { useEffect, useRef, useState } from 'react';

interface CacheEntry {
  commands: SlashCommandItem[];
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 50;

const slashCommandCache = new Map<string, CacheEntry>();

function getCachedCommands(conversation_id: string): SlashCommandItem[] | null {
  const entry = slashCommandCache.get(conversation_id);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    slashCommandCache.delete(conversation_id);
    return null;
  }
  return entry.commands;
}

function setCachedCommands(conversation_id: string, commands: SlashCommandItem[]): void {
  // LRU eviction if cache is full
  if (slashCommandCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = slashCommandCache.keys().next().value;
    if (oldestKey) {
      slashCommandCache.delete(oldestKey);
    }
  }
  slashCommandCache.set(conversation_id, { commands, timestamp: Date.now() });
}

interface UseSlashCommandsOptions {
  conversation_type?: string;
  codexStatus?: string | null;
  /** When provided, changes to this value trigger a re-fetch. Used by ACP to
   *  re-fetch commands after the agent becomes active. */
  agentStatus?: string | null;
  /** Optional runtime preparation hook for team-owned conversations. */
  prepareRuntime?: () => Promise<void>;
}

export function useSlashCommands(conversation_id: string, options: UseSlashCommandsOptions = {}) {
  const { conversation_type, codexStatus, agentStatus, prepareRuntime } = options;
  const canUseCachedCommands = isSlashCommandListEnabled({ conversation_type, codexStatus });
  const requestIdRef = useRef(0);
  const [commands, setCommands] = useState<SlashCommandItem[]>(() => {
    if (!canUseCachedCommands) {
      return [];
    }
    return getCachedCommands(conversation_id) || [];
  });

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    let isCancelled = false;

    if (!conversation_id) {
      setCommands([]);
      return;
    }

    if (!canUseCachedCommands) {
      setCommands([]);
      return;
    }

    // Skip fetch until agent is ready (agentStatus becomes non-null)
    if (agentStatus === null || agentStatus === undefined) {
      return;
    }

    const cached = getCachedCommands(conversation_id);
    if (cached) {
      setCommands(cached);
    }

    const runtimeReady = prepareRuntime ? prepareRuntime() : ensureConversationRuntime(conversation_id);

    void runtimeReady
      .then(() => ipcBridge.conversation.getSlashCommands.invoke({ conversation_id: conversation_id }))
      .then((result) => {
        if (isCancelled || requestId !== requestIdRef.current) {
          return;
        }
        if (!result || !Array.isArray(result) || result.length === 0) {
          setCommands([]);
          return;
        }
        const mapped: SlashCommandItem[] = mapAcpCommandsToSlashCommands(result);
        setCachedCommands(conversation_id, mapped);
        setCommands(mapped);
      })
      .catch((error) => {
        if (isCancelled || requestId !== requestIdRef.current) {
          return;
        }
        console.error('[useSlashCommands] Failed to load slash commands:', error);
        setCommands([]);
      });

    return () => {
      isCancelled = true;
    };
  }, [conversation_id, canUseCachedCommands, codexStatus, conversation_type, agentStatus, prepareRuntime]);

  return commands;
}
