import {
  MAX_WORKSPACE_PANEL_PX,
  MIN_CHAT_PANEL_PX,
  MIN_PREVIEW_PANEL_PX,
  MIN_WORKSPACE_PANEL_PX,
} from '@/renderer/pages/conversation/utils/layoutCalc';
import { useEffect } from 'react';

type UseLayoutConstraintsParams = {
  containerWidth: number;
  workspaceEnabled: boolean;
  isDesktop: boolean;
  isPreviewOpen: boolean;
  rightSiderCollapsed: boolean;
  setRightSiderCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  workspaceWidthPx: number;
  setWorkspaceWidthPx: (px: number) => void;
  chatSplitRatio: number;
  setChatSplitRatio: (ratio: number) => void;
  dynamicChatMinRatio: number;
  dynamicChatMaxRatio: number;
};

/**
 * Constrains the user-preferred workspace width and chat-preview ratio so
 * that all panels remain above their minimum pixel widths; auto-collapses
 * workspace when the container is too narrow to fit chat + preview + workspace.
 */
export function useLayoutConstraints({
  containerWidth,
  workspaceEnabled,
  isDesktop,
  isPreviewOpen,
  rightSiderCollapsed,
  setRightSiderCollapsed,
  workspaceWidthPx,
  setWorkspaceWidthPx,
  chatSplitRatio,
  setChatSplitRatio,
  dynamicChatMinRatio,
  dynamicChatMaxRatio,
}: UseLayoutConstraintsParams): void {
  // Constrain workspace width when preview is open
  useEffect(() => {
    if (!workspaceEnabled || !isPreviewOpen || !isDesktop || rightSiderCollapsed) {
      return;
    }
    const safeContainerWidth = Math.max(containerWidth || 0, 1);
    const maxWorkspaceByContainer = Math.max(
      MIN_WORKSPACE_PANEL_PX,
      safeContainerWidth - MIN_CHAT_PANEL_PX - MIN_PREVIEW_PANEL_PX
    );
    const maxWorkspace = Math.min(MAX_WORKSPACE_PANEL_PX, maxWorkspaceByContainer);
    if (workspaceWidthPx > maxWorkspace) {
      setWorkspaceWidthPx(maxWorkspace);
    }
    // Auto-collapse workspace when container is too narrow for all three panels
    if (safeContainerWidth < MIN_CHAT_PANEL_PX + MIN_PREVIEW_PANEL_PX + MIN_WORKSPACE_PANEL_PX) {
      setRightSiderCollapsed(true);
    }
  }, [
    containerWidth,
    isDesktop,
    isPreviewOpen,
    rightSiderCollapsed,
    setRightSiderCollapsed,
    setWorkspaceWidthPx,
    workspaceEnabled,
    workspaceWidthPx,
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
