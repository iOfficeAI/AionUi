import { useEffect } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { useVisibleConversationIds } from '@/renderer/pages/conversation/GroupedHistory/hooks/useVisibleConversationIds';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { dispatchWorkspaceToggleEvent } from '@/renderer/utils/workspace/workspaceEvents';

type UseConversationShortcutsParams = {
  navigate: NavigateFunction;
  siderCollapsed?: boolean;
  setSiderCollapsed?: (collapsed: boolean) => void;
};

const getCycledConversationId = (
  visibleConversationIds: string[],
  activeConversationId: string | null,
  direction: 1 | -1
): string | null => {
  if (visibleConversationIds.length < 2 || !activeConversationId) {
    return null;
  }

  const activeIndex = visibleConversationIds.findIndex((conversation_id) => conversation_id === activeConversationId);
  if (activeIndex === -1) {
    return null;
  }

  const nextIndex = (activeIndex + direction + visibleConversationIds.length) % visibleConversationIds.length;
  return visibleConversationIds[nextIndex] ?? null;
};

const isMod = (event: KeyboardEvent): boolean => event.metaKey || event.ctrlKey;

const isConversationTabShortcut = (event: KeyboardEvent): boolean => {
  return event.ctrlKey && !event.metaKey && !event.altKey && event.key === 'Tab';
};

const isNewConversationShortcut = (event: KeyboardEvent): boolean => {
  return isMod(event) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 't';
};

/** Cmd/Ctrl+B — toggle left conversation sidebar */
const isToggleSidebarShortcut = (event: KeyboardEvent): boolean => {
  return isMod(event) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'b';
};

/** Cmd/Ctrl+L — toggle right workspace panel */
const isToggleWorkspaceShortcut = (event: KeyboardEvent): boolean => {
  return isMod(event) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'l';
};

/** Cmd/Ctrl+, — open Settings */
const isOpenSettingsShortcut = (event: KeyboardEvent): boolean => {
  return isMod(event) && !event.altKey && !event.shiftKey && event.key === ',';
};

export const useConversationShortcuts = ({
  navigate,
  siderCollapsed,
  setSiderCollapsed,
}: UseConversationShortcutsParams): void => {
  const location = useLocation();
  const visibleConversationIds = useVisibleConversationIds();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) {
        return;
      }

      if (!isElectronDesktop()) {
        return;
      }

      if (isConversationTabShortcut(event)) {
        event.preventDefault();
        const currentConversationId = location.pathname.match(/^\/conversation\/([^/]+)/)?.[1] ?? null;
        const targetConversationId = getCycledConversationId(
          visibleConversationIds,
          currentConversationId,
          event.shiftKey ? -1 : 1
        );

        if (targetConversationId) {
          void navigate(`/conversation/${targetConversationId}`);
        }
        return;
      }

      if (isNewConversationShortcut(event)) {
        event.preventDefault();
        void navigate('/guid');
        return;
      }

      if (isToggleSidebarShortcut(event) && setSiderCollapsed) {
        event.preventDefault();
        setSiderCollapsed(!(siderCollapsed ?? false));
        return;
      }

      if (isToggleWorkspaceShortcut(event)) {
        event.preventDefault();
        dispatchWorkspaceToggleEvent();
        return;
      }

      if (isOpenSettingsShortcut(event)) {
        event.preventDefault();
        void navigate('/settings/system');
      }
    };

    // Capture phase so UI shortcuts win over focused inputs (matches Cmd/Ctrl+F pattern).
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [location.pathname, navigate, setSiderCollapsed, siderCollapsed, visibleConversationIds]);
};
