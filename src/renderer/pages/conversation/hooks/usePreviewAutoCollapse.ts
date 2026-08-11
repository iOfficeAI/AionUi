import { useEffect, useRef } from 'react';

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
  const previousWorkspaceCollapsedRef = useRef<boolean | null>(null);
  const previousSiderCollapsedRef = useRef<boolean | null>(null);
  const previousPreviewOpenRef = useRef(false);

  useEffect(() => {
    if (!workspaceEnabled || !isDesktop) {
      previousPreviewOpenRef.current = false;
      return;
    }

    if (isPreviewOpen && !previousPreviewOpenRef.current) {
      if (previousWorkspaceCollapsedRef.current === null) {
        previousWorkspaceCollapsedRef.current = rightSiderCollapsed;
      }
      if (previousSiderCollapsedRef.current === null && typeof siderCollapsed !== 'undefined') {
        previousSiderCollapsedRef.current = siderCollapsed;
      }
      setRightSiderCollapsed(true);
      setSiderCollapsed?.(true);
    } else if (!isPreviewOpen && previousPreviewOpenRef.current) {
      if (previousWorkspaceCollapsedRef.current !== null) {
        setRightSiderCollapsed(previousWorkspaceCollapsedRef.current);
        previousWorkspaceCollapsedRef.current = null;
      }
      if (previousSiderCollapsedRef.current !== null && setSiderCollapsed) {
        setSiderCollapsed(previousSiderCollapsedRef.current);
        previousSiderCollapsedRef.current = null;
      }
    }

    previousPreviewOpenRef.current = isPreviewOpen;
  }, [
    isPreviewOpen,
    isDesktop,
    siderCollapsed,
    setSiderCollapsed,
    rightSiderCollapsed,
    workspaceEnabled,
    setRightSiderCollapsed,
  ]);
}
