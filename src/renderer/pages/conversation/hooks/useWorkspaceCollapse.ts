import { STORAGE_KEYS } from '@/common/config/storageKeys';
import { blurActiveElement } from '@/renderer/utils/ui/focus';
import {
  WORKSPACE_HAS_FILES_EVENT,
  WORKSPACE_TOGGLE_EVENT,
  dispatchWorkspaceStateEvent,
  type WorkspaceHasFilesDetail,
} from '@/renderer/utils/workspace/workspaceEvents';
import { detectMobileViewportOrTouch } from '@/renderer/pages/conversation/utils/detectPlatform';
import { useEffect, useRef, useState } from 'react';

type UseWorkspaceCollapseParams = {
  workspaceEnabled: boolean;
  isMobile: boolean;
  conversationId?: string;
};

type UseWorkspaceCollapseReturn = {
  rightSiderCollapsed: boolean;
  setRightSiderCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
};

/**
 * Manages workspace panel collapse/expand state including localStorage persistence,
 * toggle events, file-based auto-expand, and mobile-specific behavior.
 */
export function useWorkspaceCollapse({
  workspaceEnabled,
  isMobile,
  conversationId,
}: UseWorkspaceCollapseParams): UseWorkspaceCollapseReturn {
  // Workspace panel collapse state - globally persisted
  const [rightSiderCollapsed, setRightSiderCollapsed] = useState(() => {
    if (detectMobileViewportOrTouch()) {
      return true;
    }
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.WORKSPACE_PANEL_COLLAPSE);
      if (stored !== null) {
        return stored === 'true';
      }
    } catch {
      // ignore errors
    }
    return true; // default collapsed
  });

  // Current active conversation ID (for recording user manual operation preference)
  const currentConversationIdRef = useRef<string | undefined>(undefined);

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
        // Record user manual operation preference
        const convId = currentConversationIdRef.current;
        if (convId) {
          try {
            localStorage.setItem(`workspace-preference-${convId}`, newState ? 'collapsed' : 'expanded');
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
  }, [workspaceEnabled]);

  // Auto expand/collapse workspace panel based on files state (user preference takes priority)
  useEffect(() => {
    if (typeof window === 'undefined' || !workspaceEnabled) {
      return undefined;
    }
    const handleHasFiles = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceHasFilesDetail>).detail;
      const convId = detail.conversationId;

      // Update current conversation ID
      currentConversationIdRef.current = convId;

      // Mobile: always keep workspace collapsed to avoid covering main chat area
      if (isMobile) {
        if (!rightCollapsedRef.current) {
          setRightSiderCollapsed(true);
        }
        return;
      }

      // Check if user has manual preference
      let userPreference: 'expanded' | 'collapsed' | null = null;
      if (convId) {
        try {
          const stored = localStorage.getItem(`workspace-preference-${convId}`);
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
        // No user preference: expand if has files, collapse if not
        if (detail.hasFiles && rightSiderCollapsed) {
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
  }, [isMobile, workspaceEnabled, rightSiderCollapsed]);

  // Broadcast workspace state event
  useEffect(() => {
    if (!workspaceEnabled) {
      dispatchWorkspaceStateEvent(true);
      return;
    }
    dispatchWorkspaceStateEvent(rightSiderCollapsed);
  }, [rightSiderCollapsed, workspaceEnabled]);

  // Persist workspace panel collapse state
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.WORKSPACE_PANEL_COLLAPSE, String(rightSiderCollapsed));
    } catch {
      // ignore errors
    }
  }, [rightSiderCollapsed]);

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
  }, [conversationId, isMobile, workspaceEnabled]);

  // Mobile: blur active element on conversation switch to prevent soft keyboard
  useEffect(() => {
    if (!isMobile) {
      return;
    }
    const rafId = requestAnimationFrame(() => {
      blurActiveElement();
    });
    return () => cancelAnimationFrame(rafId);
  }, [conversationId, isMobile]);

  return { rightSiderCollapsed, setRightSiderCollapsed };
}
