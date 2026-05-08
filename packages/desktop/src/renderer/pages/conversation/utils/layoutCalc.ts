// Layout constants for the chat layout panel sizing
export const MIN_CHAT_RATIO = 25;
export const MIN_WORKSPACE_RATIO = 12;
export const MIN_PREVIEW_RATIO = 20;
export const WORKSPACE_HEADER_HEIGHT = 32;
export const MIN_CHAT_PANEL_PX = 360;
export const MIN_PREVIEW_PANEL_PX = 340;
export const MIN_WORKSPACE_PANEL_PX = 220;

export type LayoutCalcInput = {
  containerWidth: number;
  workspaceSplitRatio: number;
  chatSplitRatio: number;
  workspaceEnabled: boolean;
  isDesktop: boolean;
  isPreviewOpen: boolean;
  rightSiderCollapsed: boolean;
  isMobile: boolean;
};

export type LayoutMetrics = {
  activeWorkspaceRatio: number;
  availableRatioForChatPreview: number;
  dynamicChatMinRatio: number;
  dynamicChatMaxRatio: number;
  chatFlex: number;
  workspaceFlex: number;
  mobileWorkspaceWidthPx: number;
  desktopWorkspaceWidthPx: number;
  workspaceWidthPx: number;
  titleAreaMaxWidth: number;
  mobileWorkspaceHandleRight: number;
  showDesktopWorkspaceSidebar: boolean;
  desktopWorkspaceSidebarWidth: number;
};

/**
 * Compute all derived layout metrics from raw split ratios and panel state.
 * This is a pure function with no side-effects.
 */
export const calcLayoutMetrics = (input: LayoutCalcInput): LayoutMetrics => {
  const {
    containerWidth,
    workspaceSplitRatio,
    chatSplitRatio,
    workspaceEnabled,
    isDesktop,
    isPreviewOpen,
    rightSiderCollapsed,
    isMobile,
  } = input;

  // Active workspace ratio (only when workspace is visible on desktop)
  const activeWorkspaceRatio = workspaceEnabled && isDesktop && !rightSiderCollapsed ? workspaceSplitRatio : 0;
  const availableRatioForChatPreview = Math.max(1, 100 - activeWorkspaceRatio);

  // Pixel-based minimum ratio calculations
  const safeContainerWidth = Math.max(containerWidth || 0, 1);
  const availableWidthForChatPreview = (safeContainerWidth * availableRatioForChatPreview) / 100;
  const minChatRatioByPx = (MIN_CHAT_PANEL_PX / Math.max(availableWidthForChatPreview, 1)) * 100;
  const minPreviewRatioByPx = (MIN_PREVIEW_PANEL_PX / Math.max(availableWidthForChatPreview, 1)) * 100;

  // Dynamic min/max chat ratios
  const dynamicChatMinRatio =
    workspaceEnabled && isDesktop && isPreviewOpen ? Math.max(MIN_CHAT_RATIO, minChatRatioByPx) : MIN_CHAT_RATIO;
  const dynamicChatMaxCandidate =
    workspaceEnabled && isDesktop && isPreviewOpen
      ? Math.min(80, 100 - Math.max(MIN_PREVIEW_RATIO, minPreviewRatioByPx))
      : 80;
  const dynamicChatMaxRatio = Math.max(dynamicChatMinRatio, dynamicChatMaxCandidate);

  // Effective workspace ratio and flex values
  const effectiveWorkspaceRatio = workspaceEnabled && isDesktop && !rightSiderCollapsed ? workspaceSplitRatio : 0;
  const availableChatPreviewRatio = Math.max(0, 100 - effectiveWorkspaceRatio);
  const chatFlex = isDesktop
    ? isPreviewOpen
      ? (availableChatPreviewRatio * chatSplitRatio) / 100
      : 100 - effectiveWorkspaceRatio
    : 100;
  const workspaceFlex = effectiveWorkspaceRatio;

  // Workspace width in pixels
  const viewportWidth = containerWidth || (typeof window === 'undefined' ? 0 : window.innerWidth);
  const mobileViewportWidth = viewportWidth || (typeof window === 'undefined' ? 0 : window.innerWidth);
  const mobileWorkspaceWidthPx = Math.min(
    Math.max(300, Math.round(mobileViewportWidth * 0.84)),
    Math.max(300, Math.min(420, mobileViewportWidth - 20))
  );
  const desktopWorkspaceWidthPx = Math.min(500, Math.max(200, (workspaceSplitRatio / 100) * (viewportWidth || 0)));
  const workspaceWidthPx = workspaceEnabled ? (isMobile ? mobileWorkspaceWidthPx : desktopWorkspaceWidthPx) : 0;

  // Derived display values
  const mobileWorkspaceHandleRight = rightSiderCollapsed ? 0 : Math.max(0, Math.round(workspaceWidthPx) - 14);
  const showDesktopWorkspaceSidebar = workspaceEnabled && isDesktop && !rightSiderCollapsed;
  const desktopWorkspaceSidebarWidth = Math.max(220, Math.round(workspaceWidthPx));
  const titleAreaMaxWidth = Math.max(320, Math.min(820, containerWidth - 520));

  return {
    activeWorkspaceRatio,
    availableRatioForChatPreview,
    dynamicChatMinRatio,
    dynamicChatMaxRatio,
    chatFlex,
    workspaceFlex,
    mobileWorkspaceWidthPx,
    desktopWorkspaceWidthPx,
    workspaceWidthPx,
    titleAreaMaxWidth,
    mobileWorkspaceHandleRight,
    showDesktopWorkspaceSidebar,
    desktopWorkspaceSidebarWidth,
  };
};
