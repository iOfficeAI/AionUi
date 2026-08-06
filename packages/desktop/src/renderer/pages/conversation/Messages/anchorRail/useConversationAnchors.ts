/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chat/chatLib';
import { loadAllConversationMessagesPaged } from '@/renderer/utils/chat/messagePagination';
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildMessageAnchors, type MessageAnchorItem } from './anchors';

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
  const [historyAnchors, setHistoryAnchors] = useState<MessageAnchorItem[]>([]);
  // Guards against a stale conversation's response landing after a switch.
  const requestedIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    requestedIdRef.current = conversationId;
    if (!conversationId) {
      setHistoryAnchors([]);
      return;
    }

    let cancelled = false;
    // Drop the previous conversation's ticks immediately, so the rail never shows
    // one conversation's anchors while another is open.
    setHistoryAnchors([]);

    // `compact` is enough: ticks only need the preview text, not whole message
    // bodies, and a long history would otherwise pull a lot of unused content.
    loadAllConversationMessagesPaged(conversationId, { contentMode: 'compact' })
      .then((messages) => {
        if (cancelled || requestedIdRef.current !== conversationId) return;
        setHistoryAnchors(buildMessageAnchors(messages));
      })
      .catch(() => {
        // Best-effort: the rail still works off the in-memory list, it just starts
        // at whatever the chat area has paged in.
        if (cancelled || requestedIdRef.current !== conversationId) return;
        setHistoryAnchors([]);
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const liveAnchors = useMemo(() => buildMessageAnchors(liveMessages), [liveMessages]);

  return useMemo(
    () => (liveAnchors.length >= historyAnchors.length ? liveAnchors : historyAnchors),
    [liveAnchors, historyAnchors]
  );
};
