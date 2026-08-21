/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chat/chatLib';
import { loadAllConversationMessagesPaged } from '@/renderer/utils/chat/messagePagination';
import { addEventListener } from '@/renderer/utils/emitter';
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildMessageAnchors, type MessageAnchorItem } from './anchors';

type CachedAnchorList = {
  anchors: MessageAnchorItem[];
  cachedAt: number;
};

const ANCHOR_CACHE_MAX_ENTRIES = 20;
const ANCHOR_CACHE_FRESH_MS = 30_000;
const anchorCache = new Map<string, CachedAnchorList>();
const anchorRequests = new Map<string, Promise<MessageAnchorItem[]>>();
let anchorCacheEpoch = 0;

const readCachedAnchors = (conversationId: string): CachedAnchorList | undefined => {
  const cached = anchorCache.get(conversationId);
  if (!cached) return undefined;
  anchorCache.delete(conversationId);
  anchorCache.set(conversationId, cached);
  return cached;
};

const writeCachedAnchors = (conversationId: string, anchors: MessageAnchorItem[]): void => {
  anchorCache.delete(conversationId);
  anchorCache.set(conversationId, { anchors, cachedAt: Date.now() });
  while (anchorCache.size > ANCHOR_CACHE_MAX_ENTRIES) {
    const oldestKey = anchorCache.keys().next().value;
    if (typeof oldestKey !== 'string') break;
    anchorCache.delete(oldestKey);
  }
};

const loadConversationAnchors = (conversationId: string): Promise<MessageAnchorItem[]> => {
  const activeRequest = anchorRequests.get(conversationId);
  if (activeRequest) return activeRequest;
  const request = loadAllConversationMessagesPaged(conversationId, { contentMode: 'compact' })
    .then((messages) => {
      const anchors = buildMessageAnchors(messages);
      if (anchorRequests.get(conversationId) !== request) return [];
      writeCachedAnchors(conversationId, anchors);
      return anchors;
    })
    .finally(() => {
      if (anchorRequests.get(conversationId) === request) anchorRequests.delete(conversationId);
    });
  anchorRequests.set(conversationId, request);
  return request;
};

export const clearConversationAnchorCache = (): void => {
  anchorCacheEpoch++;
  anchorCache.clear();
  anchorRequests.clear();
};

const deleteConversationAnchorCache = (conversationId: string): void => {
  anchorCache.delete(conversationId);
  anchorRequests.delete(conversationId);
};

/**
 * Anchors for a conversation's *whole* history, not just the pages currently held
 * in memory.
 *
 * The chat area loads messages lazily, so reopening an old conversation starts
 * with only the newest page. Deriving ticks from that alone made the rail claim a
 * long conversation was short: earlier turns simply had no anchor until the user
 * scrolled up far enough to page them in — which defeats the point of a jump
 * target. So the rail reads the full turn list once, the same way the search
 * panel and conversation export do.
 *
 * The fetched list seeds the rail; the in-memory list then takes over whenever it
 * covers more turns, which is what keeps new messages appearing live without
 * re-reading history on every send.
 */
export const useConversationAnchors = (
  conversationId: string | undefined,
  liveMessages: TMessage[]
): MessageAnchorItem[] => {
  const [historyAnchors, setHistoryAnchors] = useState<MessageAnchorItem[]>(() =>
    conversationId ? (readCachedAnchors(conversationId)?.anchors ?? []) : []
  );
  const cacheEpochRef = useRef(anchorCacheEpoch);
  const cacheConversationRef = useRef(conversationId);
  if (cacheConversationRef.current !== conversationId) {
    cacheConversationRef.current = conversationId;
    cacheEpochRef.current = anchorCacheEpoch;
  }
  // Guards against a stale conversation's response landing after a switch.
  const requestedIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const removeAuthListener = addEventListener('auth.cacheCleared', clearConversationAnchorCache);
    const removeDeletionListener = addEventListener('conversation.deleted', (deletedConversationId) => {
      deleteConversationAnchorCache(deletedConversationId);
      if (deletedConversationId === conversationId) cacheEpochRef.current = -1;
    });
    return () => {
      removeAuthListener();
      removeDeletionListener();
    };
  }, [conversationId]);

  useEffect(() => {
    requestedIdRef.current = conversationId;
    if (!conversationId) {
      setHistoryAnchors([]);
      return;
    }

    const cached = readCachedAnchors(conversationId);
    if (cached) {
      setHistoryAnchors(cached.anchors);
    }
    if (cached && Date.now() - cached.cachedAt <= ANCHOR_CACHE_FRESH_MS) {
      return;
    }

    let cancelled = false;
    // Drop the previous conversation's ticks immediately, so the rail never shows
    // one conversation's anchors while another is open.
    if (!cached) setHistoryAnchors([]);

    // `compact` is enough: ticks only need the preview text, not whole message
    // bodies, and a long history would otherwise pull a lot of unused content.
    loadConversationAnchors(conversationId)
      .then((anchors) => {
        if (cancelled || requestedIdRef.current !== conversationId) return;
        setHistoryAnchors(anchors);
      })
      .catch(() => {
        // Best-effort: the rail still works off the in-memory list, it just starts
        // at whatever the chat area has paged in.
        if (cancelled || requestedIdRef.current !== conversationId) return;
        if (!cached) setHistoryAnchors([]);
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const liveAnchors = useMemo(() => buildMessageAnchors(liveMessages), [liveMessages]);

  const resolvedAnchors = useMemo(() => {
    if (liveAnchors.length >= historyAnchors.length) {
      return liveAnchors;
    }

    const liveById = new Map(liveAnchors.map((anchor) => [anchor.messageId, anchor]));
    const merged = historyAnchors.map((anchor) => {
      const live = liveById.get(anchor.messageId);
      if (!live) return anchor;
      liveById.delete(anchor.messageId);
      return { ...anchor, ...live, index: anchor.index };
    });
    for (const anchor of liveAnchors) {
      if (liveById.has(anchor.messageId)) merged.push(anchor);
    }
    const normalized: MessageAnchorItem[] = [];
    for (let index = 0; index < merged.length; index++) {
      const anchor = merged[index];
      normalized.push(anchor.index === index + 1 ? anchor : { ...anchor, index: index + 1 });
    }
    return normalized;
  }, [historyAnchors, liveAnchors]);

  useEffect(() => {
    if (conversationId && resolvedAnchors.length > 0 && cacheEpochRef.current === anchorCacheEpoch) {
      writeCachedAnchors(conversationId, resolvedAnchors);
    }
  }, [conversationId, resolvedAnchors]);

  return resolvedAnchors;
};
