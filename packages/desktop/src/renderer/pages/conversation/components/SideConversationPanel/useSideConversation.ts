/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { emitter } from '@/renderer/utils/emitter';
import { resolveParentForkMsgId, resolveParentForkMsgIdFromMessages } from '@/common/chat/resolveParentForkMsgId';
import type { SideState } from '@/common/chat/sideConversationState';
import type { TMessage } from '@/common/chat/chatLib';
import type { TChatConversation } from '@/common/config/storage';
import { Message } from '@arco-design/web-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type SideForkMode = 'agent_fork' | 'text_snapshot';

export type SideTab = {
  childId: string;
  forkMode?: SideForkMode;
  /** Per-tab UI state after first user turn */
  hasTurn: boolean;
};

type PendingComposerFill = {
  childId: string;
  text: string;
};

type ParentSideUiExtra = {
  active_side_id?: string;
  side_conversation_id?: string;
  side_panel_hidden?: boolean;
};

export type UseSideConversationOptions = {
  parent: TChatConversation;
  /** Legacy single child from parent.extra — migrated into tabs on mount */
  initialChildId?: string;
  getParentMessages?: () => TMessage[];
};

export type CreateSideResult = {
  conversation_id: string;
  fork_mode?: SideForkMode;
  created?: boolean;
};

function parseForkMode(value: unknown): SideForkMode | undefined {
  if (value === 'agent_fork' || value === 'text_snapshot') {
    return value;
  }
  return undefined;
}

function tabFromConversation(conversation: TChatConversation): SideTab {
  return {
    childId: conversation.id,
    forkMode: parseForkMode(conversation.extra?.fork_mode) ?? 'text_snapshot',
    hasTurn: conversation.modified_at > conversation.created_at,
  };
}

function sortSideChildren(children: TChatConversation[]): TChatConversation[] {
  return children.toSorted((a, b) => a.created_at - b.created_at);
}

function derivePanelState(tabs: SideTab[], activeTabId: string | undefined, panelHidden: boolean): SideState {
  if (tabs.length === 0) return 'none';
  if (panelHidden) return 'collapsed';
  const active = tabs.find((tab) => tab.childId === activeTabId) ?? tabs[tabs.length - 1];
  return active?.hasTurn ? 'active' : 'empty';
}

export function useSideConversation({ parent, initialChildId, getParentMessages }: UseSideConversationOptions) {
  const { t } = useTranslation();
  const [tabs, setTabs] = useState<SideTab[]>(() =>
    initialChildId ? [{ childId: initialChildId, hasTurn: false }] : []
  );
  const [activeTabId, setActiveTabId] = useState<string | undefined>(initialChildId);
  const [panelHidden, setPanelHidden] = useState(Boolean(initialChildId));
  const [promotedIds, setPromotedIds] = useState<Set<string>>(() => new Set());
  const [pendingComposerFill, setPendingComposerFill] = useState<PendingComposerFill | null>(null);
  const ensuring = useRef<Promise<string> | null>(null);
  const hydrationVersionRef = useRef(0);
  const hydratedParentIdRef = useRef<string | undefined>(undefined);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.childId === activeTabId) ?? tabs[tabs.length - 1],
    [activeTabId, tabs]
  );

  const childId = activeTab?.childId;
  const state = derivePanelState(tabs, activeTabId, panelHidden);
  const parentSideExtra = parent.extra as ParentSideUiExtra | undefined;
  const persistedActiveSideId = parentSideExtra?.active_side_id ?? parentSideExtra?.side_conversation_id;
  const persistedPanelHidden = parentSideExtra?.side_panel_hidden === true;

  const syncParentSideState = useCallback(
    (activeId: string | null | undefined, hidden: boolean) => {
      if (!parent.id) return;
      void ipcBridge.conversation.update
        .invoke({
          id: parent.id,
          updates: {
            extra: {
              active_side_id: activeId ?? null,
              side_conversation_id: activeId ?? null,
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

  useEffect(() => {
    if (!parent.id) {
      hydrationVersionRef.current += 1;
      hydratedParentIdRef.current = undefined;
      setTabs([]);
      setActiveTabId(undefined);
      setPanelHidden(false);
      return;
    }

    const parentChanged = hydratedParentIdRef.current !== parent.id;
    hydratedParentIdRef.current = parent.id;
    hydrationVersionRef.current += 1;
    const hydrationVersion = hydrationVersionRef.current;
    const legacyTabs: SideTab[] = initialChildId ? [{ childId: initialChildId, hasTurn: false }] : [];
    const fallbackActiveId = persistedActiveSideId ?? initialChildId;
    if (parentChanged) {
      setTabs(legacyTabs);
      setActiveTabId(fallbackActiveId);
      setPanelHidden(legacyTabs.length > 0 ? persistedPanelHidden : false);
    } else if (legacyTabs.length > 0) {
      setTabs((prev) => (prev.length > 0 ? prev : legacyTabs));
      setActiveTabId((prev) => prev ?? fallbackActiveId);
    }

    let cancelled = false;
    void ipcBridge.conversation.listSide
      .invoke({ parent_id: parent.id })
      .then((children) => {
        if (cancelled || hydrationVersion !== hydrationVersionRef.current) return;
        const restoredTabs = sortSideChildren(children).map(tabFromConversation);
        if (restoredTabs.length === 0 && !parentChanged) return;
        const finalTabs = restoredTabs.length > 0 ? restoredTabs : legacyTabs;
        const activeId =
          fallbackActiveId && finalTabs.some((tab) => tab.childId === fallbackActiveId)
            ? fallbackActiveId
            : finalTabs[finalTabs.length - 1]?.childId;
        setTabs(finalTabs);
        setActiveTabId(activeId);
        setPanelHidden(finalTabs.length > 0 ? persistedPanelHidden : false);
      })
      .catch((error) => {
        console.warn('[useSideConversation] restore side tabs failed:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [initialChildId, parent.id, persistedActiveSideId, persistedPanelHidden]);

  useEffect(() => {
    if (!initialChildId) return;
    let cancelled = false;
    void ipcBridge.conversation.get
      .invoke({ id: initialChildId })
      .then((conv) => {
        if (cancelled || !conv?.extra) return;
        const forkMode = parseForkMode((conv.extra as { fork_mode?: string }).fork_mode);
        if (!forkMode) return;
        setTabs((prev) => prev.map((tab) => (tab.childId === initialChildId ? { ...tab, forkMode } : tab)));
      })
      .catch(() => {
        /* keep default until createSide returns fork_mode */
      });
    return () => {
      cancelled = true;
    };
  }, [initialChildId]);

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
        const result = (await ipcBridge.conversation.createSide.invoke({
          parent,
          initial_prompt,
          forked_at_msg_id,
        })) as CreateSideResult;
        const forkMode = parseForkMode(result.fork_mode) ?? 'text_snapshot';
        const id = result.conversation_id;
        hydrationVersionRef.current += 1;
        setTabs((prev) => [...prev, { childId: id, forkMode, hasTurn: Boolean(initial_prompt?.trim()) }]);
        setActiveTabId(id);
        setPanelHidden(false);
        syncParentSideState(id, false);
        return id;
      })();
      try {
        return await ensuring.current;
      } finally {
        ensuring.current = null;
      }
    },
    [parent, resolveForkedAtMsgId, syncParentSideState]
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
        console.error('[useSideConversation] open failed:', error);
        Message.error(error instanceof Error ? error.message : t('conversation.sideConversation.openFailed'));
      }
    },
    [activeTabId, createTab, syncParentSideState, t, tabs]
  );

  const openNewTab = useCallback(
    async (firstQuestion?: string) => {
      const trimmed = firstQuestion?.trim();
      try {
        await createTab(trimmed || undefined);
      } catch (error) {
        console.error('[useSideConversation] openNewTab failed:', error);
        Message.error(error instanceof Error ? error.message : t('conversation.sideConversation.openFailed'));
      }
    },
    [createTab, t]
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

  const markTurn = useCallback(() => {
    if (!childId) return;
    setTabs((prev) => prev.map((tab) => (tab.childId === childId ? { ...tab, hasTurn: true } : tab)));
  }, [childId]);

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
        Message.error(error instanceof Error ? error.message : t('conversation.sideConversation.openFailed'));
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
        console.error('[useSideConversation] fillComposer failed:', error);
        Message.error(error instanceof Error ? error.message : t('conversation.sideConversation.openFailed'));
      }
    },
    [childId, createTab, syncParentSideState, t, tabs]
  );

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
    markTurn,
    promote,
    discard,
    discardTab,
    fillComposer,
  };
}
