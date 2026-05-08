import { useEffect } from 'react';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview/context';

type UsePreviewAutoCollapseParams = {
  isPreviewOpen: boolean;
  isDesktop: boolean;
  workspaceEnabled: boolean;
  rightSiderCollapsed: boolean;
  setRightSiderCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  siderCollapsed: boolean | undefined;
  setSiderCollapsed: ((value: boolean) => void) | undefined;
};

/**
 * Auto-collapses sidebar and workspace when preview opens,
 * restoring their previous state when preview closes.
 *
 * The transition memory lives on `PreviewProvider` (app-root) instead of in
 * this hook so that switching teams — which remounts `ChatLayout` via
 * `key={team.id}` — does not reset the "previous open" flag and trigger a
 * spurious force-collapse cycle.
 */
export function usePreviewAutoCollapse({
  isPreviewOpen,
  isDesktop,
  workspaceEnabled,
  rightSiderCollapsed,
  setRightSiderCollapsed,
  siderCollapsed,
  setSiderCollapsed,
}: UsePreviewAutoCollapseParams): void {
  const { autoCollapseMemoryRef } = usePreviewContext();

  useEffect(() => {
    const memory = autoCollapseMemoryRef.current;

    if (!workspaceEnabled || !isDesktop) {
      memory.previousPreviewOpen = false;
      return;
    }

    if (isPreviewOpen && !memory.previousPreviewOpen) {
      if (memory.previousWorkspaceCollapsed === null) {
        memory.previousWorkspaceCollapsed = rightSiderCollapsed;
      }
      if (memory.previousSiderCollapsed === null && typeof siderCollapsed !== 'undefined') {
        memory.previousSiderCollapsed = siderCollapsed;
      }
      setRightSiderCollapsed(true);
      setSiderCollapsed?.(true);
    } else if (!isPreviewOpen && memory.previousPreviewOpen) {
      if (memory.previousWorkspaceCollapsed !== null) {
        setRightSiderCollapsed(memory.previousWorkspaceCollapsed);
        memory.previousWorkspaceCollapsed = null;
      }
      if (memory.previousSiderCollapsed !== null && setSiderCollapsed) {
        setSiderCollapsed(memory.previousSiderCollapsed);
        memory.previousSiderCollapsed = null;
      }
    }

    memory.previousPreviewOpen = isPreviewOpen;
  }, [
    isPreviewOpen,
    isDesktop,
    siderCollapsed,
    setSiderCollapsed,
    rightSiderCollapsed,
    workspaceEnabled,
    setRightSiderCollapsed,
    autoCollapseMemoryRef,
  ]);
}
