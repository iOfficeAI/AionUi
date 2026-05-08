import {
  MIN_CHAT_PANEL_PX,
  MIN_PREVIEW_PANEL_PX,
  MIN_WORKSPACE_PANEL_PX,
  MIN_WORKSPACE_RATIO,
} from '@/renderer/pages/conversation/utils/layoutCalc';
import { useEffect } from 'react';

type UseLayoutConstraintsParams = {
  containerWidth: number;
  workspaceEnabled: boolean;
  isDesktop: boolean;
  isPreviewOpen: boolean;
  rightSiderCollapsed: boolean;
  setRightSiderCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  workspaceSplitRatio: number;
  setWorkspaceSplitRatio: (ratio: number) => void;
  chatSplitRatio: number;
  setChatSplitRatio: (ratio: number) => void;
  dynamicChatMinRatio: number;
  dynamicChatMaxRatio: number;
};

/**
 * Constrains workspace and chat-preview split ratios so that all panels
 * remain above their minimum pixel widths; auto-collapses workspace when
 * the container is too narrow to fit chat + preview + workspace.
 */
export function useLayoutConstraints({
  containerWidth,
  workspaceEnabled,
  isDesktop,
  isPreviewOpen,
  rightSiderCollapsed,
  setRightSiderCollapsed,
  workspaceSplitRatio,
  setWorkspaceSplitRatio,
  chatSplitRatio,
  setChatSplitRatio,
  dynamicChatMinRatio,
  dynamicChatMaxRatio,
}: UseLayoutConstraintsParams): void {
  // Constrain workspace split ratio when preview is open
  useEffect(() => {
    if (!workspaceEnabled || !isPreviewOpen || !isDesktop || rightSiderCollapsed) {
      return;
    }
    const safeContainerWidth = Math.max(containerWidth || 0, 1);
    const minChatPreviewRatioByPx = ((MIN_CHAT_PANEL_PX + MIN_PREVIEW_PANEL_PX) / safeContainerWidth) * 100;
    const maxWorkspaceByPx = 100 - minChatPreviewRatioByPx;
    const maxWorkspace = Math.max(MIN_WORKSPACE_RATIO, Math.min(40, maxWorkspaceByPx));
    if (workspaceSplitRatio > maxWorkspace) {
      setWorkspaceSplitRatio(maxWorkspace);
    }
    // Auto-collapse workspace when container is too narrow for all three panels
    if (safeContainerWidth < MIN_CHAT_PANEL_PX + MIN_PREVIEW_PANEL_PX + MIN_WORKSPACE_PANEL_PX) {
      setRightSiderCollapsed(true);
    }
    // Intentionally not adding workspaceSplitRatio to deps to avoid extra effect triggers during drag
  }, [
    containerWidth,
    isDesktop,
    isPreviewOpen,
    rightSiderCollapsed,
    setWorkspaceSplitRatio,
    workspaceEnabled,
    workspaceSplitRatio,
  ]);

  // Clamp chat split ratio within dynamic bounds
  useEffect(() => {
    if (!workspaceEnabled || !isPreviewOpen || !isDesktop) {
      return;
    }
    const clampedChat = Math.max(dynamicChatMinRatio, Math.min(dynamicChatMaxRatio, chatSplitRatio));
    if (clampedChat !== chatSplitRatio) {
      setChatSplitRatio(clampedChat);
    }
  }, [
    chatSplitRatio,
    dynamicChatMaxRatio,
    dynamicChatMinRatio,
    isDesktop,
    isPreviewOpen,
    setChatSplitRatio,
    workspaceEnabled,
  ]);
}
