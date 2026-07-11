import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import type { ConversationProjectSummary } from '@/common/adapter/ipcBridge';
import { getWorkspaceDisplayName } from '@/renderer/utils/workspace/workspace';
import { addEventListener } from '@/renderer/utils/emitter';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const PROJECT_PAGE_SIZE = 5;

type ProjectPageState = {
  items: TChatConversation[];
  hasMore: boolean;
  loading: boolean;
  loaded: boolean;
  error: boolean;
};

export type ConversationProject = ConversationProjectSummary & {
  displayName: string;
  conversations: TChatConversation[];
  hasMore: boolean;
  loading: boolean;
  loaded: boolean;
  error: boolean;
};

const EMPTY_PAGE: ProjectPageState = {
  items: [],
  hasMore: false,
  loading: false,
  loaded: false,
  error: false,
};

export const mergeProjectConversationPage = (
  currentItems: TChatConversation[],
  nextItems: TChatConversation[],
  reset: boolean
): TChatConversation[] => {
  if (reset) return nextItems;
  return [...new Map([...currentItems, ...nextItems].map((conversation) => [conversation.id, conversation])).values()];
};

const filterVisibleConversations = (items: TChatConversation[]): TChatConversation[] =>
  items.filter((conversation) => {
    const extra = conversation.extra as { is_health_check?: boolean; team_id?: string; teamId?: string } | undefined;
    return extra?.is_health_check !== true && !extra?.team_id && !extra?.teamId;
  });

export const useProjectConversations = () => {
  const { t } = useTranslation();
  const [summaries, setSummaries] = useState<ConversationProjectSummary[]>([]);
  const [pages, setPages] = useState<Record<string, ProjectPageState>>({});
  const pagesRef = useRef(pages);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  const loadProjects = useCallback(async () => {
    try {
      const result = await ipcBridge.database.getConversationProjects.invoke();
      setSummaries(Array.isArray(result) ? result : []);
    } catch (error) {
      console.error('[WorkspaceGroupedHistory] Failed to load projects:', error);
      setSummaries([]);
    }
  }, []);

  const loadPage = useCallback(async (workspace: string, reset: boolean) => {
    const current = pagesRef.current[workspace] ?? EMPTY_PAGE;
    if (current.loading) return;

    setPages((previous) => ({
      ...previous,
      [workspace]: { ...(previous[workspace] ?? EMPTY_PAGE), loading: true, error: false },
    }));

    try {
      const cursor = reset ? undefined : current.items.at(-1)?.id;
      const result = await ipcBridge.database.getUserConversations.invoke({
        workspace,
        limit: PROJECT_PAGE_SIZE,
        cursor,
        pinned: false,
      });
      const items = filterVisibleConversations(result?.items ?? []);
      setPages((previous) => ({
        ...previous,
        [workspace]: {
          items: mergeProjectConversationPage(previous[workspace]?.items ?? [], items, reset),
          hasMore: result?.has_more ?? false,
          loading: false,
          loaded: true,
          error: false,
        },
      }));
    } catch (error) {
      console.error('[WorkspaceGroupedHistory] Failed to load project conversations:', error);
      setPages((previous) => ({
        ...previous,
        [workspace]: {
          ...(previous[workspace] ?? EMPTY_PAGE),
          loading: false,
          loaded: true,
          error: true,
        },
      }));
    }
  }, []);

  const ensureLoaded = useCallback(
    (workspace: string) => {
      const current = pagesRef.current[workspace];
      if (!current?.loaded && !current?.loading) {
        void loadPage(workspace, true);
      }
    },
    [loadPage]
  );

  const loadMore = useCallback(
    (workspace: string) => {
      void loadPage(workspace, false);
    },
    [loadPage]
  );

  const collapseToLatest = useCallback(
    (workspace: string) => {
      void loadPage(workspace, true);
    },
    [loadPage]
  );

  const refresh = useCallback(async () => {
    await loadProjects();
    const loadedProjects = Object.entries(pagesRef.current).filter(([, page]) => page.loaded);
    await Promise.all(
      loadedProjects.map(async ([workspace, page]) => {
        const targetCount = Math.max(PROJECT_PAGE_SIZE, page.items.length);
        const result = await ipcBridge.database.getUserConversations.invoke({
          workspace,
          limit: targetCount,
          pinned: false,
        });
        setPages((previous) => ({
          ...previous,
          [workspace]: {
            items: filterVisibleConversations(result?.items ?? []),
            hasMore: result?.has_more ?? false,
            loading: false,
            loaded: true,
            error: false,
          },
        }));
      })
    );
  }, [loadProjects]);

  useEffect(() => {
    void loadProjects();
    return addEventListener('chat.history.refresh', () => {
      void refresh();
    });
  }, [loadProjects, refresh]);

  useEffect(() => {
    return ipcBridge.conversation.listChanged.on(() => {
      void refresh();
    });
  }, [refresh]);

  const projects = useMemo<ConversationProject[]>(
    () =>
      summaries.map((summary) => {
        const page = pages[summary.workspace] ?? EMPTY_PAGE;
        return {
          ...summary,
          displayName: getWorkspaceDisplayName(summary.workspace, false, t),
          conversations: page.items,
          hasMore: page.hasMore,
          loading: page.loading,
          loaded: page.loaded,
          error: page.error,
        };
      }),
    [pages, summaries, t]
  );

  return {
    projects,
    ensureLoaded,
    loadMore,
    collapseToLatest,
    refresh,
  };
};
