/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isSideChildOf } from '@/common/chat/sideConversation';
import { resolveParentForkMsgId, resolveParentForkMsgIdFromMessages } from '@/common/chat/resolveParentForkMsgId';
import { getForkErrorMessage } from '@/renderer/hooks/chat/useForkConversation';
import { emitter } from '@/renderer/utils/emitter';
import type { TMessage } from '@/common/chat/chatLib';
import type { TChatConversation } from '@/common/config/storage';
import { Message } from '@arco-design/web-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type SideTab = {
  childId: string;
  /** Best-effort UI state: whether this tab has produced a turn yet. */
  hasTurn: boolean;
};

type PendingComposerFill = {
  childId: string;
  text: string;
};

export type SidePanelState = 'none' | 'empty' | 'active' | 'collapsed' | 'promoted';

export type UseSideConversationOptions = {
  parent: TChatConversation;
  getParentMessages?: () => TMessage[];
};

function tabFromConversation(conversation: TChatConversation): SideTab {
  return {
    childId: conversation.id,
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
 * Side conversation state machine: each tab is a real fork created through the
 * native fork API (`POST /api/conversations/:id/fork`) and marked as a side
 * child on its `extra` (`side_mode` + `ephemeral` + `parent_conversation_id`)
 * so the history list hides it until the user promotes it. Because creation
 * rides the backend's own fork path, eligibility is capability-driven: every
 * backend that reports `fork_capability` (claude, codex, Aion CLI, …) gets
 * real forked side threads — no per-backend renderer allowlist.
 */
export function useSideConversation({ parent, getParentMessages }: UseSideConversationOptions) {
  const { t } = useTranslation();
  const [tabs, setTabs] = useState<SideTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | undefined>(undefined);
  const [panelHidden, setPanelHidden] = useState(false);
  const [promotedIds, setPromotedIds] = useState<Set<string>>(() => new Set());
  const [pendingComposerFill, setPendingComposerFill] = useState<PendingComposerFill | null>(null);
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
  // ordinary forked conversation rows filtered by their extra markers — the
  // backend needs no dedicated side endpoint.
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

  const createTab = useCallback(
    async (initial_prompt?: string): Promise<string> => {
      if (!parent.id) {
        throw new Error('Side conversation requires a parent conversation');
      }
      if (ensuring.current) return ensuring.current;
      ensuring.current = (async () => {
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
        await ipcBridge.conversation.update.invoke({
          id: child.id,
          updates: {
            extra: {
              side_mode: true,
              ephemeral: true,
              parent_conversation_id: parent.id,
              forked_at_msg_id,
            },
          } as Partial<TChatConversation>,
          merge_extra: true,
        });
        void ipcBridge.conversation.ensureRuntime.invoke({ conversation_id: child.id }).catch((): void => undefined);
        if (initial_prompt?.trim()) {
          await ipcBridge.conversation.sendMessage.invoke({
            conversation_id: child.id,
            input: initial_prompt.trim(),
          });
        }
        hydrationVersionRef.current += 1;
        setTabs((prev) => [...prev, { childId: child.id, hasTurn: Boolean(initial_prompt?.trim()) }]);
        setActiveTabId(child.id);
        setPanelHidden(false);
        syncParentSideState(child.id, false);
        return child.id;
      })();
      try {
        return await ensuring.current;
      } finally {
        ensuring.current = null;
      }
    },
    [parent.id, resolveForkedAtMsgId, syncParentSideState]
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
      setPendingComposerFill((pending) => (pending?.childId === tabId ? null : pending));
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

  /** Open/focus side panel and fill the active tab composer (does not send). */
  const fillComposer = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      try {
        let targetId = childId;
        if (!targetId) {
          if (tabs.length > 0) {
            targetId = tabs[tabs.length - 1]?.childId;
            setActiveTabId(targetId);
            setPanelHidden(false);
            syncParentSideState(targetId, false);
          } else {
            targetId = await createTab();
          }
        } else {
          setPanelHidden(false);
          syncParentSideState(targetId, false);
        }
        if (!targetId) return;
        setPendingComposerFill({ childId: targetId, text: trimmed });
      } catch (error) {
        showError(error);
      }
    },
    [childId, createTab, showError, syncParentSideState, tabs]
  );

  // Deliver a pending composer fill to the active side tab's send box. The
  // dock mounts the child send box lazily, so retry until the box acks via
  // `sendbox.fill.scoped.handled` (or give up after ~4.8s).
  useEffect(() => {
    if (!pendingComposerFill) return;
    if (childId !== pendingComposerFill.childId || panelHidden) return;

    let cancelled = false;
    let attempts = 0;
    const emitFill = () => {
      if (cancelled) return;
      attempts += 1;
      emitter.emit('sendbox.fill.scoped', {
        conversation_id: pendingComposerFill.childId,
        text: pendingComposerFill.text,
      });
      if (attempts >= 40) {
        setPendingComposerFill((current) =>
          current?.childId === pendingComposerFill.childId && current.text === pendingComposerFill.text ? null : current
        );
      }
    };
    const frame = window.requestAnimationFrame(() => {
      window.setTimeout(emitFill, 0);
    });
    const retry = window.setInterval(emitFill, 120);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.clearInterval(retry);
    };
  }, [childId, panelHidden, pendingComposerFill]);

  useEffect(() => {
    const onHandled = ({ conversation_id, text }: { conversation_id: string; text: string }) => {
      setPendingComposerFill((current) =>
        current?.childId === conversation_id && current.text === text ? null : current
      );
    };
    emitter.on('sendbox.fill.scoped.handled', onHandled);
    return () => {
      emitter.off('sendbox.fill.scoped.handled', onHandled);
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
    open,
    openNewTab,
    reopen,
    collapse,
    selectTab,
    promote,
    discard,
    discardTab,
    fillComposer,
  };
}
