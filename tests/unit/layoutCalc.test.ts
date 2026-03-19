import { describe, it, expect } from 'vitest';
import {
  calcLayoutMetrics,
  MIN_CHAT_RATIO,
  MIN_WORKSPACE_RATIO,
  MIN_PREVIEW_RATIO,
  MIN_CHAT_PANEL_PX,
  MIN_PREVIEW_PANEL_PX,
  MIN_WORKSPACE_PANEL_PX,
  type LayoutCalcInput,
  type LayoutMetrics,
} from '@renderer/pages/conversation/utils/layoutCalc';

// Helper to build a complete LayoutCalcInput with sensible defaults
const makeInput = (overrides: Partial<LayoutCalcInput> = {}): LayoutCalcInput => ({
  containerWidth: 1440,
  workspaceSplitRatio: 30,
  chatSplitRatio: 60,
  workspaceEnabled: true,
  isDesktop: true,
  isPreviewOpen: true,
  rightSiderCollapsed: false,
  isMobile: false,
  ...overrides,
});

// Validate that every numeric field is a finite number and not NaN
const assertAllMetricsValid = (m: LayoutMetrics) => {
  const numericKeys: (keyof LayoutMetrics)[] = [
    'activeWorkspaceRatio',
    'availableRatioForChatPreview',
    'dynamicChatMinRatio',
    'dynamicChatMaxRatio',
    'chatFlex',
    'workspaceFlex',
    'mobileWorkspaceWidthPx',
    'desktopWorkspaceWidthPx',
    'workspaceWidthPx',
    'titleAreaMaxWidth',
    'mobileWorkspaceHandleRight',
    'desktopWorkspaceSidebarWidth',
  ];
  for (const key of numericKeys) {
    const val = m[key];
    expect(val, `${key} should be a number`).toBeTypeOf('number');
    expect(Number.isNaN(val), `${key} should not be NaN`).toBe(false);
    expect(Number.isFinite(val), `${key} should be finite`).toBe(true);
  }
  expect(m.showDesktopWorkspaceSidebar).toBeTypeOf('boolean');
};

describe('calcLayoutMetrics', () => {
  describe('constants sanity check', () => {
    it('should export expected constant values', () => {
      expect(MIN_CHAT_RATIO).toBe(25);
      expect(MIN_WORKSPACE_RATIO).toBe(12);
      expect(MIN_PREVIEW_RATIO).toBe(20);
      expect(MIN_CHAT_PANEL_PX).toBe(360);
      expect(MIN_PREVIEW_PANEL_PX).toBe(340);
      expect(MIN_WORKSPACE_PANEL_PX).toBe(220);
    });
  });

  describe('normal desktop layout with workspace and preview open', () => {
    const input = makeInput();
    const m = calcLayoutMetrics(input);

    it('should return valid metrics', () => {
      assertAllMetricsValid(m);
    });

    it('should set activeWorkspaceRatio to workspaceSplitRatio', () => {
      expect(m.activeWorkspaceRatio).toBe(30);
    });

    it('should compute availableRatioForChatPreview as 100 - workspace ratio', () => {
      expect(m.availableRatioForChatPreview).toBe(70);
    });

    it('should set workspaceFlex equal to workspaceSplitRatio', () => {
      expect(m.workspaceFlex).toBe(30);
    });

    it('should compute chatFlex from available ratio and chatSplitRatio', () => {
      // chatFlex = availableChatPreviewRatio * chatSplitRatio / 100 = 70 * 60 / 100 = 42
      expect(m.chatFlex).toBe(42);
    });

    it('should show desktop workspace sidebar', () => {
      expect(m.showDesktopWorkspaceSidebar).toBe(true);
    });

    it('should have dynamicChatMinRatio >= MIN_CHAT_RATIO', () => {
      expect(m.dynamicChatMinRatio).toBeGreaterThanOrEqual(MIN_CHAT_RATIO);
    });

    it('should have dynamicChatMaxRatio >= dynamicChatMinRatio', () => {
      expect(m.dynamicChatMaxRatio).toBeGreaterThanOrEqual(m.dynamicChatMinRatio);
    });

    it('should have non-negative chatFlex and workspaceFlex', () => {
      expect(m.chatFlex).toBeGreaterThanOrEqual(0);
      expect(m.workspaceFlex).toBeGreaterThanOrEqual(0);
    });
  });

  describe('desktop with workspace collapsed (rightSiderCollapsed=true)', () => {
    const input = makeInput({ rightSiderCollapsed: true });
    const m = calcLayoutMetrics(input);

    it('should set activeWorkspaceRatio to 0', () => {
      expect(m.activeWorkspaceRatio).toBe(0);
    });

    it('should set availableRatioForChatPreview to 100', () => {
      expect(m.availableRatioForChatPreview).toBe(100);
    });

    it('should set workspaceFlex to 0', () => {
      expect(m.workspaceFlex).toBe(0);
    });

    it('should not show desktop workspace sidebar', () => {
      expect(m.showDesktopWorkspaceSidebar).toBe(false);
    });

    it('should set mobileWorkspaceHandleRight to 0 when collapsed', () => {
      expect(m.mobileWorkspaceHandleRight).toBe(0);
    });
  });

  describe('desktop with preview closed', () => {
    const input = makeInput({ isPreviewOpen: false });
    const m = calcLayoutMetrics(input);

    it('should allocate all non-workspace space to chatFlex', () => {
      // chatFlex = 100 - effectiveWorkspaceRatio = 100 - 30 = 70
      expect(m.chatFlex).toBe(70);
    });

    it('should use MIN_CHAT_RATIO for dynamicChatMinRatio when preview is closed', () => {
      expect(m.dynamicChatMinRatio).toBe(MIN_CHAT_RATIO);
    });

    it('should set dynamicChatMaxRatio to 80 (or at least >= dynamicChatMinRatio)', () => {
      expect(m.dynamicChatMaxRatio).toBe(80);
    });
  });

  describe('mobile layout (isMobile=true)', () => {
    const input = makeInput({ isMobile: true, isDesktop: false });
    const m = calcLayoutMetrics(input);

    it('should return valid metrics', () => {
      assertAllMetricsValid(m);
    });

    it('should set chatFlex to 100 on mobile', () => {
      expect(m.chatFlex).toBe(100);
    });

    it('should set activeWorkspaceRatio to 0 (not desktop)', () => {
      expect(m.activeWorkspaceRatio).toBe(0);
    });

    it('should set workspaceFlex to 0', () => {
      expect(m.workspaceFlex).toBe(0);
    });

    it('should not show desktop workspace sidebar', () => {
      expect(m.showDesktopWorkspaceSidebar).toBe(false);
    });

    it('should compute mobileWorkspaceWidthPx >= 300', () => {
      expect(m.mobileWorkspaceWidthPx).toBeGreaterThanOrEqual(300);
    });

    it('should use mobile workspace width when workspace is enabled', () => {
      expect(m.workspaceWidthPx).toBe(m.mobileWorkspaceWidthPx);
    });
  });

  describe('edge case: very small containerWidth (400px)', () => {
    const input = makeInput({ containerWidth: 400 });
    const m = calcLayoutMetrics(input);

    it('should return valid metrics without NaN', () => {
      assertAllMetricsValid(m);
    });

    it('should have non-negative chatFlex', () => {
      expect(m.chatFlex).toBeGreaterThanOrEqual(0);
    });

    it('should have dynamicChatMaxRatio >= dynamicChatMinRatio', () => {
      expect(m.dynamicChatMaxRatio).toBeGreaterThanOrEqual(m.dynamicChatMinRatio);
    });

    it('should clamp desktopWorkspaceWidthPx between 200 and 500', () => {
      expect(m.desktopWorkspaceWidthPx).toBeGreaterThanOrEqual(200);
      expect(m.desktopWorkspaceWidthPx).toBeLessThanOrEqual(500);
    });
  });

  describe('edge case: very large containerWidth (2560px)', () => {
    const input = makeInput({ containerWidth: 2560 });
    const m = calcLayoutMetrics(input);

    it('should return valid metrics without NaN', () => {
      assertAllMetricsValid(m);
    });

    it('should cap desktopWorkspaceWidthPx at 500', () => {
      expect(m.desktopWorkspaceWidthPx).toBeLessThanOrEqual(500);
    });

    it('should compute reasonable titleAreaMaxWidth', () => {
      // titleAreaMaxWidth = max(320, min(820, 2560 - 520)) = max(320, min(820, 2040)) = 820
      expect(m.titleAreaMaxWidth).toBe(820);
    });

    it('should have dynamicChatMinRatio close to MIN_CHAT_RATIO for wide screens', () => {
      // With lots of space, pixel-based min ratio should be small
      expect(m.dynamicChatMinRatio).toBe(MIN_CHAT_RATIO);
    });
  });

  describe('edge case: workspace and preview both open with minimal space', () => {
    // Large workspace ratio leaving little room for chat + preview
    const input = makeInput({
      containerWidth: 800,
      workspaceSplitRatio: 60,
      chatSplitRatio: 50,
    });
    const m = calcLayoutMetrics(input);

    it('should return valid metrics', () => {
      assertAllMetricsValid(m);
    });

    it('should have availableRatioForChatPreview = 40', () => {
      expect(m.availableRatioForChatPreview).toBe(40);
    });

    it('should ensure dynamicChatMaxRatio >= dynamicChatMinRatio even with tight space', () => {
      expect(m.dynamicChatMaxRatio).toBeGreaterThanOrEqual(m.dynamicChatMinRatio);
    });

    it('should have non-negative flex values', () => {
      expect(m.chatFlex).toBeGreaterThanOrEqual(0);
      expect(m.workspaceFlex).toBeGreaterThanOrEqual(0);
    });
  });

  describe('workspace disabled', () => {
    const input = makeInput({ workspaceEnabled: false });
    const m = calcLayoutMetrics(input);

    it('should set activeWorkspaceRatio to 0', () => {
      expect(m.activeWorkspaceRatio).toBe(0);
    });

    it('should set workspaceWidthPx to 0', () => {
      expect(m.workspaceWidthPx).toBe(0);
    });

    it('should not show desktop workspace sidebar', () => {
      expect(m.showDesktopWorkspaceSidebar).toBe(false);
    });
  });

  describe('parameterized: containerWidth variations', () => {
    it.each([
      { containerWidth: 0, label: 'zero' },
      { containerWidth: 1, label: 'minimal (1px)' },
      { containerWidth: 400, label: 'small (400px)' },
      { containerWidth: 1024, label: 'medium (1024px)' },
      { containerWidth: 1440, label: 'standard (1440px)' },
      { containerWidth: 1920, label: 'full HD (1920px)' },
      { containerWidth: 2560, label: 'wide (2560px)' },
      { containerWidth: 3840, label: 'ultra-wide (3840px)' },
    ])('should produce valid metrics for $label width', ({ containerWidth }) => {
      const m = calcLayoutMetrics(makeInput({ containerWidth }));
      assertAllMetricsValid(m);
      expect(m.chatFlex).toBeGreaterThanOrEqual(0);
      expect(m.workspaceFlex).toBeGreaterThanOrEqual(0);
      expect(m.dynamicChatMaxRatio).toBeGreaterThanOrEqual(m.dynamicChatMinRatio);
    });
  });

  describe('parameterized: layout combinations', () => {
    it.each([
      {
        isDesktop: true,
        isMobile: false,
        workspaceEnabled: true,
        rightSiderCollapsed: false,
        isPreviewOpen: true,
        label: 'desktop+workspace+preview',
      },
      {
        isDesktop: true,
        isMobile: false,
        workspaceEnabled: true,
        rightSiderCollapsed: true,
        isPreviewOpen: true,
        label: 'desktop+workspace collapsed+preview',
      },
      {
        isDesktop: true,
        isMobile: false,
        workspaceEnabled: true,
        rightSiderCollapsed: false,
        isPreviewOpen: false,
        label: 'desktop+workspace+no preview',
      },
      {
        isDesktop: true,
        isMobile: false,
        workspaceEnabled: false,
        rightSiderCollapsed: false,
        isPreviewOpen: true,
        label: 'desktop+no workspace+preview',
      },
      {
        isDesktop: true,
        isMobile: false,
        workspaceEnabled: false,
        rightSiderCollapsed: false,
        isPreviewOpen: false,
        label: 'desktop+no workspace+no preview',
      },
      {
        isDesktop: false,
        isMobile: true,
        workspaceEnabled: true,
        rightSiderCollapsed: false,
        isPreviewOpen: true,
        label: 'mobile+workspace+preview',
      },
      {
        isDesktop: false,
        isMobile: true,
        workspaceEnabled: false,
        rightSiderCollapsed: false,
        isPreviewOpen: false,
        label: 'mobile+no workspace+no preview',
      },
    ])('should produce valid metrics for $label', (combo) => {
      const m = calcLayoutMetrics(makeInput(combo));
      assertAllMetricsValid(m);
      expect(m.chatFlex).toBeGreaterThanOrEqual(0);
      expect(m.workspaceFlex).toBeGreaterThanOrEqual(0);
      expect(m.dynamicChatMaxRatio).toBeGreaterThanOrEqual(m.dynamicChatMinRatio);
    });
  });
});
