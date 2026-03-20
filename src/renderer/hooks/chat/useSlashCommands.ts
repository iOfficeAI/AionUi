import { isSlashCommandListEnabled } from '@/common/chat/slash/availability';
import type { SlashCommandItem } from '@/common/chat/slash/types';
import { ipcBridge } from '@/common';
import { useEffect, useRef, useState } from 'react';

interface CacheEntry {
  commands: SlashCommandItem[];
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 50;

const slashCommandCache = new Map<string, CacheEntry>();

function getCachedCommands(conversationId: string): SlashCommandItem[] | null {
  const entry = slashCommandCache.get(conversationId);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    slashCommandCache.delete(conversationId);
    return null;
  }
  return entry.commands;
}

function setCachedCommands(conversationId: string, commands: SlashCommandItem[]): void {
  // LRU eviction if cache is full
  if (slashCommandCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = slashCommandCache.keys().next().value;
    if (oldestKey) {
      slashCommandCache.delete(oldestKey);
    }
  }
  slashCommandCache.set(conversationId, { commands, timestamp: Date.now() });
}

interface UseSlashCommandsOptions {
  conversationType?: string;
  codexStatus?: string | null;
  /** When provided, changes to this value trigger a re-fetch. Used by ACP to
   *  re-fetch commands after the agent becomes active. */
  agentStatus?: string | null;
}

export function useSlashCommands(conversationId: string, options: UseSlashCommandsOptions = {}) {
  const { conversationType, codexStatus, agentStatus } = options;
  const canUseCachedCommands = isSlashCommandListEnabled({ conversationType, codexStatus });
  const requestIdRef = useRef(0);
  const [commands, setCommands] = useState<SlashCommandItem[]>(() => {
    if (!canUseCachedCommands) {
      return [];
    }
    return getCachedCommands(conversationId) || [];
  });

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    let isCancelled = false;

    if (!conversationId) {
      setCommands([]);
      return;
    }

    if (!canUseCachedCommands) {
      setCommands([]);
      return;
    }

    const cached = getCachedCommands(conversationId);
    if (canUseCachedCommands && cached) {
      setCommands(cached);
    }

    void ipcBridge.conversation.getSlashCommands
      .invoke({ conversation_id: conversationId })
      .then((response) => {
        if (isCancelled || requestId !== requestIdRef.current) {
          return;
        }
        if (!response.success || !response.data?.commands) {
          setCommands([]);
          return;
        }
        setCachedCommands(conversationId, response.data.commands);
        setCommands(response.data.commands);
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
  }, [conversationId, canUseCachedCommands, codexStatus, conversationType, agentStatus]);

  return commands;
}
