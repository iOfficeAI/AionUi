/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { sessionMention, type SessionMentionTarget } from '@/common/adapter/ipcBridge';
import { useCallback, useEffect, useRef, useState } from 'react';

export type { SessionMentionTarget };

const DEBOUNCE_MS = 180;
const PAGE_SIZE = 20;

export type UseSessionMentionSearchParams = {
  query: string;
  conversationId: string;
  projectId?: string;
  enabled: boolean;
};

export function useSessionMentionSearch(params: UseSessionMentionSearchParams) {
  const { query, conversationId, projectId, enabled } = params;
  const [items, setItems] = useState<SessionMentionTarget[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  // Guards against a slow earlier request overwriting a newer result.
  const requestSeqRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      setNextCursor(undefined);
      setLoading(false);
      return;
    }
    const seq = ++requestSeqRef.current;
    setLoading(true);
    const timer = setTimeout(() => {
      sessionMention.list
        .invoke({
          current_conversation_id: conversationId,
          q: query || undefined,
          project_id: projectId,
          limit: PAGE_SIZE,
        })
        .then((data) => {
          if (seq !== requestSeqRef.current) return;
          setItems(data?.items ?? []);
          setNextCursor(data?.next_cursor);
        })
        .catch(() => {
          if (seq !== requestSeqRef.current) return;
          // A picker that cannot load degrades to empty; the user can still type.
          setItems([]);
          setNextCursor(undefined);
        })
        .finally(() => {
          if (seq === requestSeqRef.current) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [conversationId, enabled, projectId, query]);

  const loadMore = useCallback(() => {
    if (!enabled || !nextCursor || loading) return;
    // Shares the sequence guard with the first-page effect: a query change
    // bumps the sequence, and appending a page fetched for the OLD query would
    // splice unrelated conversations onto the new results.
    const seq = requestSeqRef.current;
    setLoading(true);
    sessionMention.list
      .invoke({
        current_conversation_id: conversationId,
        q: query || undefined,
        project_id: projectId,
        limit: PAGE_SIZE,
        cursor: nextCursor,
      })
      .then((data) => {
        if (seq !== requestSeqRef.current) return;
        setItems((previous) => [...previous, ...(data?.items ?? [])]);
        setNextCursor(data?.next_cursor);
      })
      .catch(() => {
        // Keep the page already shown; the user can retry by typing.
      })
      .finally(() => {
        if (seq === requestSeqRef.current) setLoading(false);
      });
  }, [conversationId, enabled, loading, nextCursor, projectId, query]);

  return { items, loading, loadMore, hasMore: Boolean(nextCursor) };
}
