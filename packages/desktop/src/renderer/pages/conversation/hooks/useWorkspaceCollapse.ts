import { blurActiveElement } from '@/renderer/utils/ui/focus';
import {
  WORKSPACE_HAS_APPROVALS_EVENT,
  WORKSPACE_HAS_FILES_EVENT,
  WORKSPACE_HAS_TODOS_EVENT,
  WORKSPACE_TOGGLE_EVENT,
  dispatchWorkspaceStateEvent,
  type WorkspaceHasApprovalsDetail,
  type WorkspaceHasFilesDetail,
  type WorkspaceHasTodosDetail,
} from '@/renderer/utils/workspace/workspaceEvents';
import { useEffect, useRef, useState } from 'react';

type UseWorkspaceCollapseParams = {
  workspaceEnabled: boolean;
  isMobile: boolean;
  /**
   * Identifier whose change forces a mobile collapse (typically the active
   * conversation id; in team mode, the active agent's conversation id).
   */
  conversation_id?: string;
  /**
   * Stable key used to persist the user's manual toggle preference. Single-chat
   * uses `conversation_id`; team mode passes `team_id` so the preference
   * survives agent-tab switches and follows the team as a whole.
   */
  preferenceKey?: string;
  /**
   * True when the current workspace is an auto-created temporary one (no folder
   * picked by the user). Auto-expand on hasFiles is suppressed in that case so
   * that "send 你好 without picking a folder" leaves the panel collapsed.
   */
  isTemporaryWorkspace?: boolean;
};

type UseWorkspaceCollapseReturn = {
  rightSiderCollapsed: boolean;
  setRightSiderCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
};

/**
 * Manages workspace panel collapse/expand state.
 *
 * Default: collapsed. Auto-expand fires when WORKSPACE_HAS_FILES_EVENT arrives
 * and either:
 *   - the workspace is user-picked (folder chosen at creation), or
 *   - files appear mid-session in a temporary workspace (e.g. agent writes a
 *     file while the user is here).
 *
 * Manual toggle is persisted under `workspace-preference-${preferenceKey}` and
 * overrides auto-expand. The caller decides what `preferenceKey` is — single
 * chats use `conversation_id`, teams use `team_id`.
 *
 * Known limitation: leaving and re-entering a temporary workspace remounts the
 * workspace tree, so files added while away report as initial load. They will
 * not trigger auto-expand on return — the user must open the panel manually
 * that one time.
 */
export function useWorkspaceCollapse({
  workspaceEnabled,
  isMobile,
  conversation_id,
  preferenceKey,
  isTemporaryWorkspace,
}: UseWorkspaceCollapseParams): UseWorkspaceCollapseReturn {
  // Workspace panel always starts collapsed; preference and hasFiles events
  // drive expand. See WORKSPACE_HAS_FILES_EVENT handler below.
  const [rightSiderCollapsed, setRightSiderCollapsed] = useState(true);

  // Mirror ref for collapse state
  const rightCollapsedRef = useRef(rightSiderCollapsed);

  // Keep ref in sync
  useEffect(() => {
    rightCollapsedRef.current = rightSiderCollapsed;
  }, [rightSiderCollapsed]);

  // Listen for workspace toggle events
  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const handleWorkspaceToggle = () => {
      if (!workspaceEnabled) {
        return;
      }
      setRightSiderCollapsed((prev) => {
        const newState = !prev;
        if (preferenceKey) {
          try {
            localStorage.setItem(`workspace-preference-${preferenceKey}`, newState ? 'collapsed' : 'expanded');
          } catch {
            // ignore errors
          }
        }
        return newState;
      });
    };
    window.addEventListener(WORKSPACE_TOGGLE_EVENT, handleWorkspaceToggle);
    return () => {
      window.removeEventListener(WORKSPACE_TOGGLE_EVENT, handleWorkspaceToggle);
    };
  }, [workspaceEnabled, preferenceKey]);

  // Auto expand/collapse workspace panel based on files state (user preference takes priority)
  useEffect(() => {
    if (typeof window === 'undefined' || !workspaceEnabled) {
      return undefined;
    }
    const handleHasFiles = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceHasFilesDetail>).detail;

      // Mobile: always keep workspace collapsed to avoid covering main chat area
      if (isMobile) {
        if (!rightCollapsedRef.current) {
          setRightSiderCollapsed(true);
        }
        return;
      }

      // Check if user has manual preference
      let userPreference: 'expanded' | 'collapsed' | null = null;
      if (preferenceKey) {
        try {
          const stored = localStorage.getItem(`workspace-preference-${preferenceKey}`);
          if (stored === 'expanded' || stored === 'collapsed') {
            userPreference = stored;
          }
        } catch {
          // ignore errors
        }
      }

      // If user has preference, use it; otherwise decide by file state
      if (userPreference) {
        const shouldCollapse = userPreference === 'collapsed';
        if (shouldCollapse !== rightSiderCollapsed) {
          setRightSiderCollapsed(shouldCollapse);
        }
      } else {
        // No user preference: decide by workspace kind + when the files appeared.
        // - User-picked workspace: expand on any hasFiles (initial seed is the
        //   user's own files, worth showing).
        // - Temporary workspace: ignore the initial seed (backend may inject
        //   rules/skills the user never asked for) and only expand when files
        //   show up mid-session.
        const isUserPicked = !isTemporaryWorkspace;
        const isMidSession = !detail.isInitial;
        const allowAutoExpand = isUserPicked || isMidSession;
        if (allowAutoExpand && detail.hasFiles && rightSiderCollapsed) {
          setRightSiderCollapsed(false);
        } else if (!detail.hasFiles && !rightSiderCollapsed) {
          setRightSiderCollapsed(true);
        }
      }
    };
    window.addEventListener(WORKSPACE_HAS_FILES_EVENT, handleHasFiles);
    return () => {
      window.removeEventListener(WORKSPACE_HAS_FILES_EVENT, handleHasFiles);
    };
  }, [isMobile, workspaceEnabled, rightSiderCollapsed, isTemporaryWorkspace, preferenceKey]);

  useEffect(() => {
    if (typeof window === 'undefined' || !workspaceEnabled) {
      return undefined;
    }
    const handleHasTodos = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceHasTodosDetail>).detail;

      if (isMobile) {
        return;
      }

      let userPreference: 'expanded' | 'collapsed' | null = null;
      if (preferenceKey) {
        try {
          const stored = localStorage.getItem(`workspace-preference-${preferenceKey}`);
          if (stored === 'expanded' || stored === 'collapsed') {
            userPreference = stored;
          }
        } catch {
          // ignore errors
        }
      }

      if (!userPreference && detail.hasTodos && rightSiderCollapsed) {
        setRightSiderCollapsed(false);
      }
    };
    window.addEventListener(WORKSPACE_HAS_TODOS_EVENT, handleHasTodos);
    return () => {
      window.removeEventListener(WORKSPACE_HAS_TODOS_EVENT, handleHasTodos);
    };
  }, [isMobile, workspaceEnabled, rightSiderCollapsed, preferenceKey]);

  // Auto-expand the pane when a pending approval appears, so the Approvals tab
  // surfaces without the user hunting for it. Mirrors the Todos behaviour and
  // respects an explicit user collapse preference.
  useEffect(() => {
    if (typeof window === 'undefined' || !workspaceEnabled) {
      return undefined;
    }
    const handleHasApprovals = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceHasApprovalsDetail>).detail;
      if (isMobile) {
        return;
      }
      let userPreference: 'expanded' | 'collapsed' | null = null;
      if (preferenceKey) {
        try {
          const stored = localStorage.getItem(`workspace-preference-${preferenceKey}`);
          if (stored === 'expanded' || stored === 'collapsed') {
            userPreference = stored;
          }
        } catch {
          // ignore errors
        }
      }
      if (!userPreference && detail.hasApprovals && rightSiderCollapsed) {
        setRightSiderCollapsed(false);
      }
    };
    window.addEventListener(WORKSPACE_HAS_APPROVALS_EVENT, handleHasApprovals);
    return () => {
      window.removeEventListener(WORKSPACE_HAS_APPROVALS_EVENT, handleHasApprovals);
    };
  }, [isMobile, workspaceEnabled, rightSiderCollapsed, preferenceKey]);

  // Broadcast workspace state event
  useEffect(() => {
    if (!workspaceEnabled) {
      dispatchWorkspaceStateEvent(true);
      return;
    }
    dispatchWorkspaceStateEvent(rightSiderCollapsed);
  }, [rightSiderCollapsed, workspaceEnabled]);

  // Force collapse when workspace is disabled
  useEffect(() => {
    if (!workspaceEnabled) {
      setRightSiderCollapsed(true);
    }
  }, [workspaceEnabled]);

  // Mobile: force collapse when entering mobile mode
  useEffect(() => {
    if (!workspaceEnabled || !isMobile || rightCollapsedRef.current) {
      return;
    }
    setRightSiderCollapsed(true);
  }, [isMobile, workspaceEnabled]);

  // Mobile: force collapse workspace on conversation switch to prevent overlay
  useEffect(() => {
    if (!workspaceEnabled || !isMobile) {
      return;
    }
    setRightSiderCollapsed(true);
  }, [conversation_id, isMobile, workspaceEnabled]);

  // Mobile: blur active element on conversation switch to prevent soft keyboard
  useEffect(() => {
    if (!isMobile) {
      return;
    }
    const rafId = requestAnimationFrame(() => {
      blurActiveElement();
    });
    return () => cancelAnimationFrame(rafId);
  }, [conversation_id, isMobile]);

  return { rightSiderCollapsed, setRightSiderCollapsed };
}
