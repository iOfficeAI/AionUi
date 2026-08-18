/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { loadParentReferenceTranscript } from '@/common/chat/loadParentReferenceTranscript';
import { isSideChildOf, resolveSideConversationMode, type SideConversationMode } from '@/common/chat/sideConversation';
import { resolveParentForkMsgId, resolveParentForkMsgIdFromMessages } from '@/common/chat/resolveParentForkMsgId';
import { getForkErrorMessage } from '@/renderer/hooks/chat/useForkConversation';
import { emitter, type ReplyQuote } from '@/renderer/utils/emitter';
import type { TMessage } from '@/common/chat/chatLib';
import type { TChatConversation } from '@/common/config/storage';
import { Message } from '@arco-design/web-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildSideSnapshotClone } from './buildSideSnapshotClone';

export type SideTab = {
  childId: string;
  /** How this child was created — real fork vs transcript snapshot. */
  mode: SideConversationMode;
  /** Best-effort UI state: whether this tab has produced a turn yet. */
  hasTurn: boolean;
};

type PendingComposerDelivery = {
  childId: string;
  /** Quick-prompt style text fill (goes into the input). */
  text?: string;
  /** Selected-text quote (rendered as a reply chip, never as input text). */
  quote?: ReplyQuote;
};

export type SidePanelState = 'none' | 'empty' | 'active' | 'collapsed' | 'promoted';

export type UseSideConversationOptions = {
  parent: TChatConversation;
  getParentMessages?: () => TMessage[];
};

function tabFromConversation(conversation: TChatConversation): SideTab {
  return {
    childId: conversation.id,
    mode: conversation.extra?.side_fork_mode === 'text_snapshot' ? 'snapshot' : 'fork',
    hasTurn: conversation.modified_at > conversation.created_at,
  };
}

function sortSideChildren(children: TChatConversation[]): TChatConversation[] {
  return children.toSorted((a, b) => a.created_at - b.created_at);
}

function derivePanelState(tabs: SideTab[], activeTabId: string | undefined, panelHidden: boolean): SidePanelState {
  if (tabs.length === 0) return 'none';
  if (panelHidden) return 'collapsed';
  const active = tabs.find((tab) => tab.childId === activeTabId) ?? tabs[tabs.length - 1];
  return active?.hasTurn ? 'active' : 'empty';
}

/**
 * Side conversation state machine. Two creation modes:
 *
 * - `fork` (capability-driven): `POST /api/conversations/:id/fork` at the
 *   parent's latest message, then side markers on the child's extra. The dock
 *   hides the forked-in history (see `sideForkBoundaryMsgId` in the
 *   conversation context), so the thread looks fresh while the backend session
 *   keeps full context.
 * - `snapshot` (fallback for fork-incapable ACP agents): clone the parent row
 *   (same agent identity, clean history) and deliver the parent transcript as
 *   one framed read-only reference message.
 *
 * Children are ordinary conversation rows marked `side_mode` + `ephemeral` —
 * hidden from history until promoted.
 */
export function useSideConversation({ parent, getParentMessages }: UseSideConversationOptions) {
  const { t } = useTranslation();
  const [tabs, setTabs] = useState<SideTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | undefined>(undefined);
  const [panelHidden, setPanelHidden] = useState(false);
  const [promotedIds, setPromotedIds] = useState<Set<string>>(() => new Set());
  const [pendingDelivery, setPendingDelivery] = useState<PendingComposerDelivery | null>(null);
  const ensuring = useRef<Promise<string> | null>(null);
  const hydrationVersionRef = useRef(0);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.childId === activeTabId) ?? tabs[tabs.length - 1],
    [activeTabId, tabs]
  );

  const childId = activeTab?.childId;
  const state = derivePanelState(tabs, activeTabId, panelHidden);
  const persistedActiveSideId = parent.extra?.active_side_id;
  const persistedPanelHidden = parent.extra?.side_panel_hidden === true;
  const mode = resolveSideConversationMode({ type: parent.type, fork_capability: parent.fork_capability });

  const syncParentSideState = useCallback(
    (activeId: string | null | undefined, hidden: boolean) => {
      if (!parent.id) return;
      void ipcBridge.conversation.update
        .invoke({
          id: parent.id,
          updates: {
            extra: {
              active_side_id: activeId ?? null,
              side_panel_hidden: hidden,
            },
          } as Partial<TChatConversation>,
          merge_extra: true,
        })
        .catch((error) => {
          console.warn('[useSideConversation] syncParentSideState failed:', error);
        });
    },
    [parent.id]
  );

  // Restore tabs for this parent from the conversation list. Side children are
  // ordinary conversation rows filtered by their extra markers — the backend
  // needs no dedicated side endpoint.
  useEffect(() => {
    if (!parent.id) {
      hydrationVersionRef.current += 1;
      setTabs([]);
      setActiveTabId(undefined);
      setPanelHidden(false);
      return;
    }

    const hydrationVersion = hydrationVersionRef.current;
    const parentId = parent.id;
    let cancelled = false;
    void ipcBridge.database.getUserConversations
      .invoke({ limit: 10000 })
      .then((result) => {
        if (cancelled || hydrationVersion !== hydrationVersionRef.current) return;
        const children = sortSideChildren((result?.items ?? []).filter((item) => isSideChildOf(item, parentId)));
        const restoredTabs = children.map(tabFromConversation);
        setTabs(restoredTabs);
        const activeId =
          persistedActiveSideId && restoredTabs.some((tab) => tab.childId === persistedActiveSideId)
            ? persistedActiveSideId
            : restoredTabs[restoredTabs.length - 1]?.childId;
        setActiveTabId(activeId);
        setPanelHidden(restoredTabs.length > 0 ? persistedPanelHidden : false);
      })
      .catch((error) => {
        console.warn('[useSideConversation] restore side tabs failed:', error);
      });

    return () => {
      cancelled = true;
    };
    // `parent` object identity changes on every detail refresh; only the id
    // and the persisted prefs drive this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parent.id, persistedActiveSideId, persistedPanelHidden]);

  const resolveForkedAtMsgId = useCallback(async (): Promise<string | undefined> => {
    const fromMemory = getParentMessages?.();
    if (fromMemory?.length) {
      return resolveParentForkMsgIdFromMessages(fromMemory);
    }
    return resolveParentForkMsgId(parent.id);
  }, [getParentMessages, parent.id]);

  const markSideChild = useCallback(
    async (childId: string, forkMode: 'agent_fork' | 'text_snapshot', forkedAtMsgId?: string) => {
      await ipcBridge.conversation.update.invoke({
        id: childId,
        updates: {
          extra: {
            side_mode: true,
            ephemeral: true,
            parent_conversation_id: parent.id,
            side_fork_mode: forkMode,
            ...(forkedAtMsgId ? { forked_at_msg_id: forkedAtMsgId } : {}),
          },
        } as Partial<TChatConversation>,
        merge_extra: true,
      });
    },
    [parent.id]
  );

  const createForkTab = useCallback(
    async (initial_prompt?: string): Promise<SideTab> => {
      const forked_at_msg_id = await resolveForkedAtMsgId();
      if (!forked_at_msg_id) {
        throw new Error('SIDE_PARENT_EMPTY');
      }
      const child = await ipcBridge.conversation.fork.invoke({
        conversation_id: parent.id,
        message_id: forked_at_msg_id,
      });
      if (!child?.id) {
        throw new Error('fork returned no conversation');
      }
      // Mark the fork as a docked side child. Until this lands the row is an
      // ordinary fork (visible in history); the sidebar reconciles on the
      // next listChanged event.
      await markSideChild(child.id, 'agent_fork', forked_at_msg_id);
      // Materialize the backend session so fork failures surface now instead
      // of on the first send.
      void ipcBridge.conversation.ensureRuntime.invoke({ conversation_id: child.id }).catch((): void => undefined);
      if (initial_prompt?.trim()) {
        await ipcBridge.conversation.sendMessage.invoke({
          conversation_id: child.id,
          input: initial_prompt.trim(),
        });
      }
      return { childId: child.id, mode: 'fork', hasTurn: Boolean(initial_prompt?.trim()) };
    },
    [markSideChild, parent.id, resolveForkedAtMsgId]
  );

  const createSnapshotTab = useCallback(
    async (initial_prompt?: string): Promise<SideTab> => {
      const child = await ipcBridge.conversation.createWithConversation.invoke({
        conversation: buildSideSnapshotClone(parent),
      });
      if (!child?.id) {
        throw new Error('snapshot clone returned no conversation');
      }
      await markSideChild(child.id, 'text_snapshot');
      // One framed reference message carries the parent transcript; combined
      // with the initial question when present so a snapshot thread starts
      // with a single turn.
      const transcript = await loadParentReferenceTranscript(parent.id);
      const prompt = initial_prompt?.trim();
      if (transcript && prompt) {
        const input = t('conversation.sideConversation.snapshotBootstrapWithQuestion', {
          transcript,
          question: prompt,
        });
        await ipcBridge.conversation.sendMessage.invoke({ conversation_id: child.id, input });
      } else if (transcript) {
        const input = t('conversation.sideConversation.snapshotBootstrap', { transcript });
        await ipcBridge.conversation.sendMessage.invoke({ conversation_id: child.id, input });
      } else if (prompt) {
        await ipcBridge.conversation.sendMessage.invoke({ conversation_id: child.id, input: prompt });
      }
      return { childId: child.id, mode: 'snapshot', hasTurn: Boolean(transcript || prompt) };
    },
    [markSideChild, parent.id, t]
  );

  const createTab = useCallback(
    async (initial_prompt?: string): Promise<string> => {
      if (!parent.id) {
        throw new Error('Side conversation requires a parent conversation');
      }
      if (ensuring.current) return ensuring.current;
      ensuring.current = (async () => {
        const tab = mode === 'snapshot' ? await createSnapshotTab(initial_prompt) : await createForkTab(initial_prompt);
        hydrationVersionRef.current += 1;
        setTabs((prev) => [...prev, tab]);
        setActiveTabId(tab.childId);
        setPanelHidden(false);
        syncParentSideState(tab.childId, false);
        return tab.childId;
      })();
      try {
        return await ensuring.current;
      } finally {
        ensuring.current = null;
      }
    },
    [createForkTab, createSnapshotTab, mode, parent.id, syncParentSideState]
  );

  const showError = useCallback(
    (error: unknown) => {
      console.error('[useSideConversation] side conversation failed:', error);
      if (error instanceof Error && error.message === 'SIDE_PARENT_EMPTY') {
        Message.error(t('conversation.sideConversation.parentEmpty'));
        return;
      }
      Message.error(getForkErrorMessage(error, t));
    },
    [t]
  );

  const open = useCallback(
    async (firstQuestion?: string) => {
      const trimmed = firstQuestion?.trim();
      try {
        if (trimmed) {
          await createTab(trimmed);
          return;
        }
        if (tabs.length > 0) {
          setPanelHidden(false);
          const targetId = activeTabId ?? tabs[0]?.childId;
          if (targetId) {
            setActiveTabId(targetId);
            syncParentSideState(targetId, false);
          }
          return;
        }
        await createTab();
      } catch (error) {
        showError(error);
      }
    },
    [activeTabId, createTab, showError, syncParentSideState, tabs]
  );

  const openNewTab = useCallback(
    async (firstQuestion?: string) => {
      try {
        await createTab(firstQuestion?.trim() || undefined);
      } catch (error) {
        showError(error);
      }
    },
    [createTab, showError]
  );

  const reopen = useCallback(() => {
    if (tabs.length === 0) return;
    const targetId = activeTabId ?? tabs[tabs.length - 1]?.childId;
    setPanelHidden(false);
    setActiveTabId(targetId);
    syncParentSideState(targetId, false);
  }, [activeTabId, syncParentSideState, tabs]);

  const collapse = useCallback(() => {
    if (tabs.length === 0) return;
    setPanelHidden(true);
    syncParentSideState(childId ?? activeTabId ?? tabs[tabs.length - 1]?.childId, true);
  }, [activeTabId, childId, syncParentSideState, tabs]);

  const selectTab = useCallback(
    (tabId: string) => {
      hydrationVersionRef.current += 1;
      setActiveTabId(tabId);
      setPanelHidden(false);
      syncParentSideState(tabId, false);
    },
    [syncParentSideState]
  );

  /** Promote the active tab: keep the thread as a normal conversation (visible
   * in history with its fork lineage) instead of an ephemeral side child. */
  const promote = useCallback(async () => {
    if (!childId) return;
    await ipcBridge.conversation.update.invoke({
      id: childId,
      updates: { extra: { ephemeral: false } } as Partial<TChatConversation>,
      merge_extra: true,
    });
    setPromotedIds((prev) => new Set(prev).add(childId));
  }, [childId]);

  const discardTab = useCallback(
    async (tabId: string) => {
      hydrationVersionRef.current += 1;
      const nextTabs = tabs.filter((tab) => tab.childId !== tabId);
      const nextActiveId = activeTabId === tabId ? nextTabs[nextTabs.length - 1]?.childId : activeTabId;
      setTabs(nextTabs);
      setActiveTabId(nextActiveId);
      setPanelHidden(nextTabs.length === 0);
      syncParentSideState(nextActiveId ?? null, nextTabs.length === 0);
      setPendingDelivery((pending) => (pending?.childId === tabId ? null : pending));
      try {
        await ipcBridge.conversation.remove.invoke({ id: tabId });
      } catch (error) {
        console.warn('[useSideConversation] discardTab failed:', error);
        Message.error(t('conversation.sideConversation.openFailed'));
      }
    },
    [activeTabId, syncParentSideState, t, tabs]
  );

  const discard = useCallback(async () => {
    if (!childId) return;
    await discardTab(childId);
  }, [childId, discardTab]);

  const focusOrCreateTab = useCallback(async (): Promise<string | undefined> => {
    if (childId) {
      setPanelHidden(false);
      syncParentSideState(childId, false);
      return childId;
    }
    if (tabs.length > 0) {
      const targetId = tabs[tabs.length - 1]?.childId;
      setActiveTabId(targetId);
      setPanelHidden(false);
      syncParentSideState(targetId, false);
      return targetId;
    }
    return createTab();
  }, [childId, createTab, syncParentSideState, tabs]);

  /** Open/focus the side panel and fill the active tab composer with prompt
   * text (quick prompts — goes into the input, does not send). */
  const fillComposer = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      try {
        const targetId = await focusOrCreateTab();
        if (!targetId) return;
        setPendingDelivery({ childId: targetId, text: trimmed });
      } catch (error) {
        showError(error);
      }
    },
    [focusOrCreateTab, showError]
  );

  /** Open/focus the side panel and attach selected message text to the active
   * tab composer as a reply-quote chip (does not send). */
  const quoteComposer = useCallback(
    async (quote: ReplyQuote) => {
      if (!quote.content.trim()) return;
      try {
        const targetId = await focusOrCreateTab();
        if (!targetId) return;
        setPendingDelivery({ childId: targetId, quote });
      } catch (error) {
        showError(error);
      }
    },
    [focusOrCreateTab, showError]
  );

  // Deliver a pending fill/quote to the active side tab's send box. The dock
  // mounts the child send box lazily, so retry until it acks (or give up
  // after ~4.8s).
  useEffect(() => {
    if (!pendingDelivery) return;
    if (childId !== pendingDelivery.childId || panelHidden) return;

    let cancelled = false;
    let attempts = 0;
    const emitDelivery = () => {
      if (cancelled) return;
      attempts += 1;
      if (pendingDelivery.quote) {
        emitter.emit('sendbox.reply.scoped', {
          conversation_id: pendingDelivery.childId,
          quote: pendingDelivery.quote,
        });
      } else if (pendingDelivery.text) {
        emitter.emit('sendbox.fill.scoped', {
          conversation_id: pendingDelivery.childId,
          text: pendingDelivery.text,
        });
      }
      if (attempts >= 40) {
        setPendingDelivery((current) => (current?.childId === pendingDelivery.childId ? null : current));
      }
    };
    const frame = window.requestAnimationFrame(() => {
      window.setTimeout(emitDelivery, 0);
    });
    const retry = window.setInterval(emitDelivery, 120);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.clearInterval(retry);
    };
  }, [childId, panelHidden, pendingDelivery]);

  useEffect(() => {
    const onFillHandled = ({ conversation_id, text }: { conversation_id: string; text: string }) => {
      setPendingDelivery((current) => (current?.childId === conversation_id && current.text === text ? null : current));
    };
    const onQuoteHandled = ({ conversation_id, content }: { conversation_id: string; content: string }) => {
      setPendingDelivery((current) =>
        current?.childId === conversation_id && current.quote?.content === content ? null : current
      );
    };
    emitter.on('sendbox.fill.scoped.handled', onFillHandled);
    emitter.on('sendbox.reply.scoped.handled', onQuoteHandled);
    return () => {
      emitter.off('sendbox.fill.scoped.handled', onFillHandled);
      emitter.off('sendbox.reply.scoped.handled', onQuoteHandled);
    };
  }, []);

  const panelState = useMemo(() => {
    if (tabs.length === 0) return 'none' as const;
    if (panelHidden) return 'collapsed' as const;
    if (childId && promotedIds.has(childId)) return 'promoted' as const;
    return state;
  }, [childId, panelHidden, promotedIds, state, tabs.length]);

  return {
    state: panelState,
    childId,
    tabs,
    activeTabId: childId,
    mode,
    open,
    openNewTab,
    reopen,
    collapse,
    selectTab,
    promote,
    discard,
    discardTab,
    fillComposer,
    quoteComposer,
  };
}
