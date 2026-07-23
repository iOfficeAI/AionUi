import { useEffect } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { useVisibleConversationIds } from '@/renderer/pages/conversation/GroupedHistory/hooks/useVisibleConversationIds';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { isPrimaryApplicationShortcut } from '@/renderer/utils/ui/keyboardShortcuts';
import { dispatchWorkspaceToggleEvent } from '@/renderer/utils/workspace/workspaceEvents';

type UseConversationShortcutsParams = {
  navigate: NavigateFunction;
  toggleSider: () => void;
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

const isConversationTabShortcut = (event: KeyboardEvent): boolean => {
  return event.ctrlKey && !event.metaKey && !event.altKey && event.key === 'Tab';
};

const isNewConversationShortcut = (event: KeyboardEvent): boolean => {
  return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 't';
};

export const useConversationShortcuts = ({ navigate, toggleSider }: UseConversationShortcutsParams): void => {
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

      if (isPrimaryApplicationShortcut(event, { key: 'b', targetGuard: 'embedded-editor' })) {
        event.preventDefault();
        toggleSider();
        return;
      }

      if (isPrimaryApplicationShortcut(event, { key: 'l', targetGuard: 'embedded-editor' })) {
        const handled = dispatchWorkspaceToggleEvent();
        if (handled) {
          event.preventDefault();
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [location.pathname, navigate, toggleSider, visibleConversationIds]);
};
