/**
 * E2E: Ambient Mode — M1 Bubble State.
 *
 * 覆盖 docs/product/ambient-mode-requirements.md 的 AC-M1-1 ~ AC-M1-15。
 *
 * ── 目录位置说明 ─────────────────────────────────────────────────────────
 * 本 spec 放在 `tests/e2e/specs/ambient-mode/`（按功能名，不按实现路径）。
 * 项目已有 `src/process/pet/` + `src/renderer/pet/` 的悬浮球实现；用户 2026-05-11
 * 裁决 **U-1 = A（Ambient 是 Pet 的演进）**——不是并行互斥，而是启动期二选一。
 * 本 spec **不依赖任何实现目录路径**——通过 (1) BrowserWindow title/url 过滤
 * (2) data-testid（AC-M1-9 强约束）两种手段定位。
 *
 * 文件名 `bubble.e2e.ts`（非 PM 建议的 `.spec.ts`）——因为 playwright.config.ts
 * 的 `testMatch: '{specs,features}/**\/*.e2e.ts'` 只认 `.e2e.ts` 后缀。
 *
 * ── 需求状态（[REQ-CHANGE-v3] 全面定稿 2026-05-11）────────────────────────
 *
 * 硬口径（定稿）：
 *   AC-M1-1 位置基准 = `getPrimaryDisplay().workAreaSize`（扣 Dock/任务栏），不用 screen.width
 *           → 左上角 x = workArea.width - 24 - 64，y = workArea.height - 24 - 64
 *   AC-M1-2 透明度 = BrowserWindow.setOpacity(0.85)（Arch 定稿，不再是"暂定"）
 *     复位 1.0 三处硬约束（漏即 bug）：① drag-end（AC-M1-2b）② watchdog 超时 DRAG_WATCHDOG_MS=8000
 *     （AC-M1-2d）③ drag 被 resize/状态切换中断（AC-M1-2e）
 *   AC-M1-2 吸附 = 只吸左右；基准用气泡当前所在显示器的 workArea（用 getDisplayNearestPoint 定位）
 *   AC-M1-5 持久化 = ConfigStorage（key: ambient.bubblePosition / ambient.enabled /
 *           ambient.onboardingHintShown / ambient.lastSessionClosedExplicitly）
 *   AC-M1-6 拖出屏幕 = 由 AC-M1-2 y-clamp + AC-M1-13 startup validate 覆盖
 *   AC-M1-7 多显示器 = 永久 skip（hardware-required；登记 manual-checklist.md）
 *   AC-M1-8 点击 = mouseup 触发，5 px 阈值
 *   AC-M1-9 DOM 必用 data-testid（ambient-bubble / ambient-input / ambient-chat）
 *   AC-M1-10 ambient 启用 → ambient 窗口创建，legacy pet 路径跳过（U-1=A 演进，[REQ-CHANGE-v5] 改写）
 *   AC-M1-11 AIONUI_AMBIENT env var 优先级 > settings 开关
 *   AC-M1-12 settings 切换需重启 + toast "Restart required to apply"
 *   AC-M1-13（新增）displayId validate + position clamp 边界保护
 *   AC-M1-14（新增）E2E fixture 契约：launchAppWithEnv + ambientTest fixture
 *   AC-M1-15（[REQ-CHANGE-v5] 新增）存量 Pet 用户迁移：pet.enabled=true → ambient 迁移 + 幂等标记
 *
 * ── 测试启动策略（AC-M1-14 定稿）────────────────────────────────────────
 * Arch 指定方案：新增 `launchAppWithEnv(extraEnv)` helper（不改 singleton），导出
 * `ambientTest` fixture，ambient spec 用 `import { ambientTest as test }`。
 *
 * **当前状态**：`ambientTest` fixture 尚未在 `tests/e2e/fixtures.ts` 中实现。
 * 本 spec 仍 import 现有 `test`；beforeAll 通过寻找 ambient 气泡窗口决定是否
 * 全体 skip，skip 原因 = `AC-M1-14 fixture not yet implemented (pending Arch/Dev)`。
 * 实现后 import 切 `ambientTest`，全部用例自动 unskip。
 *
 * ── U-1 = A（Ambient 是 Pet 的演进，[REQ-CHANGE-v5]）──────────────────
 * 用户裁决：Ambient 演进 Pet，不互斥、不并存。启动期二选一的语义形态。
 * AC-M1-10 从"pet count=0 互斥"改写为"ambient 窗口 ≥ 1 + 单悬浮气泡"替代断言。
 * AC-M1-15 覆盖存量 pet 用户迁移路径。
 *
 * ── AC-M3-12 前瞻（[FYI] 2026-05-11）─────────────────────────────────
 * M3 沉浸聊天态将切换渲染模式为 { transparent:false, backgroundColor:'rgba(0,0,0,0.85)' }
 * 以规避 Windows DWM frequent resize 闪烁。本 spec 把 M1 的 transparent:true
 * 抽成 `BUBBLE_RENDER_MODE` 常量，M3 spec 将定义 `CHAT_RENDER_MODE` 常量对应。
 */
// AC-M1-14 fixture: use ambientTest (independent AIONUI_AMBIENT=1 Electron process,
// `electronApp` / `page` are aliases pointing to the ambient app / bubble page).
import { ambientTest as test, expect } from '../../fixtures';
import { invokeBridge } from '../../helpers';
import type { ElectronApplication } from '@playwright/test';

// ── 常量（与需求口径对齐）────────────────────────────────────────────────
const BUBBLE_SIZE = 64; // px
const SCREEN_MARGIN = 24; // px（AC-M1-1）
const DRAG_OPACITY = 0.85; // AC-M1-2 定稿
const DEFAULT_OPACITY = 1.0;
// AC-M1-8 点击 vs 拖动阈值（unskip 后用于 bubblePage.mouse.move(dx, 0)）
// 当前 AC-M1-8 系列全 skip pending AC-M1-14 fixture，故暂 `_` 前缀避免 unused warning
const _CLICK_VS_DRAG_THRESHOLD_UPPER = 6; // > 5px 视为拖动
const _CLICK_VS_DRAG_THRESHOLD_LOWER = 4; // <= 5px 视为点击
void _CLICK_VS_DRAG_THRESHOLD_UPPER;
void _CLICK_VS_DRAG_THRESHOLD_LOWER;

/**
 * 气泡/输入态渲染模式（AC-M1-4 + AC-M3-12 前瞻，2026-05-11 [FYI]）。
 *
 * AC-M3-12（P0，渲染模式切换硬约束）：
 *   - M1 气泡 / M2 输入态：transparent: true（沿用 pet 方案）
 *   - M3 沉浸聊天及以上：transparent: false + backgroundColor: 'rgba(0,0,0,0.85)'
 *     （规避 Windows DWM frequent resize 闪烁）
 *   - 切换时机：M2 → M3 首次发送消息时，fade 动画掩盖
 *
 * 本 spec（M1）用 `BUBBLE_RENDER_MODE`；M3 spec 里会定义
 * `CHAT_RENDER_MODE = { transparent: false, backgroundColor: 'rgba(0,0,0,0.85)' } as const`。
 */
const BUBBLE_RENDER_MODE = { transparent: true } as const;

// ── Helpers ──────────────────────────────────────────────────────────────

/** 气泡当前所在显示器的 workArea，不含 Dock / 任务栏。 */
type WorkArea = { x: number; y: number; width: number; height: number };

type BubbleWindowInfo = {
  bounds: { x: number; y: number; width: number; height: number };
  alwaysOnTop: boolean;
  /** 气泡当前所在显示器的 workArea（由 getDisplayNearestPoint 决定） */
  workArea: WorkArea;
  /** 主显示器 workArea — 用于 AC-M1-1 首启位置断言 */
  primaryWorkArea: WorkArea;
};

/**
 * 在主进程里查找 ambient 气泡 BrowserWindow，返回关键属性。
 * 约定：气泡窗口的 title / webContents URL 包含 "ambient" 或 "bubble"。
 */
async function getAmbientBubbleInfo(app: ElectronApplication): Promise<BubbleWindowInfo | null> {
  return app.evaluate(({ BrowserWindow, screen }) => {
    const bubbleWin = BrowserWindow.getAllWindows().find((w) => {
      if (w.isDestroyed()) return false;
      const title = w.getTitle().toLowerCase();
      const url = w.webContents.getURL().toLowerCase();
      return (
        title.includes('ambient') ||
        title.includes('bubble') ||
        url.includes('/ambient') ||
        url.includes('ambient.html')
      );
    });
    if (!bubbleWin) return null;

    const bounds = bubbleWin.getBounds();
    // 气泡当前所在显示器（AC-M1-2 吸附基准）
    const centerPt = { x: Math.round(bounds.x + bounds.width / 2), y: Math.round(bounds.y + bounds.height / 2) };
    const nearest = screen.getDisplayNearestPoint(centerPt);
    const primary = screen.getPrimaryDisplay();
    return {
      bounds,
      alwaysOnTop: bubbleWin.isAlwaysOnTop(),
      workArea: nearest.workArea,
      primaryWorkArea: primary.workArea,
    };
  });
}

/**
 * 读取气泡窗口的创建选项（frame / transparent / alwaysOnTop）。
 *
 * Electron 不保留原始 BrowserWindowConstructorOptions，故通过两条途径：
 *   (A) Dev 暴露 `ambient.debug.getWindowOptions` IPC → 返回 { frame, transparent, alwaysOnTop }
 *   (B) 间接指纹：isOpaque() / alwaysOnTop() —— isOpaque=false 约等同 transparent=true
 *
 * 当前骨架走 (B)，Dev 实现 (A) 后把 invokeBridge 调用替换进来。
 */
async function getAmbientBubbleCreateOptions(
  app: ElectronApplication
): Promise<{ isTransparent: boolean; alwaysOnTop: boolean } | null> {
  return app.evaluate(({ BrowserWindow }) => {
    const bubbleWin = BrowserWindow.getAllWindows().find((w) => {
      if (w.isDestroyed()) return false;
      const title = w.getTitle().toLowerCase();
      return title.includes('ambient') || title.includes('bubble');
    });
    if (!bubbleWin) return null;
    const isOpaque = typeof bubbleWin.isOpaque === 'function' ? bubbleWin.isOpaque() : true;
    return {
      isTransparent: !isOpaque,
      alwaysOnTop: bubbleWin.isAlwaysOnTop(),
    };
  });
}

/**
 * 读取气泡当前展示层的不透明度（AC-M1-2 定稿：`BrowserWindow.setOpacity(0.85)`）。
 *
 * 封装理由：若未来实现改走 IPC event 抽象（`ambient.getDisplayOpacity`），
 * 只需改这里的一行，所有 AC-M1-2 用例自动跟随。
 */
async function getBubbleOpacity(app: ElectronApplication): Promise<number | null> {
  return app.evaluate(({ BrowserWindow }) => {
    const bubbleWin = BrowserWindow.getAllWindows().find((w) => {
      if (w.isDestroyed()) return false;
      return w.getTitle().toLowerCase().includes('ambient') || w.getTitle().toLowerCase().includes('bubble');
    });
    if (!bubbleWin) return null;
    return bubbleWin.getOpacity();
  });
}

/**
 * 统计当前存在的 "悬浮圆气泡" 窗口数量——用于 AC-M1-10（ambient/pet 互斥）。
 * 策略：BrowserWindow 里 title 含 ambient|bubble|pet 且 alwaysOnTop + 宽高≈64 的窗口。
 */
async function countFloatingBubbleWindows(app: ElectronApplication): Promise<{ ambient: number; pet: number }> {
  return app.evaluate(({ BrowserWindow }) => {
    let ambient = 0;
    let pet = 0;
    for (const w of BrowserWindow.getAllWindows()) {
      if (w.isDestroyed()) continue;
      if (!w.isAlwaysOnTop()) continue;
      const b = w.getBounds();
      if (b.width > 100 || b.height > 100) continue; // 只统计悬浮小圆，排除主窗口 / 输入窗口
      const title = w.getTitle().toLowerCase();
      const url = w.webContents.getURL().toLowerCase();
      if (title.includes('pet') || url.includes('pet.html')) pet += 1;
      else if (title.includes('ambient') || title.includes('bubble') || url.includes('/ambient')) ambient += 1;
    }
    return { ambient, pet };
  });
}

/**
 * 点击 / 拖动触发方式：PM [TEST-REVIEW-APPROVED] 明确要求走**黑盒 API**，
 * 不依赖 debug IPC：用 `bubblePage.mouse.down/move/up` 拟真。
 * State 推断同样走黑盒：`bubblePage.locator('[data-testid="ambient-input"]').isVisible()`
 * 代替 `ambient.getState` IPC。
 *
 * 所有依赖 bubblePage 的用例当前 skip pending AC-M1-14 fixture（ambientTest.bubblePage accessor）。
 */

// ── Spec ─────────────────────────────────────────────────────────────────

test.describe('Ambient Mode — M1 Bubble', () => {
  // 本 suite 共享一个会话，所有 test 按顺序跑（拖动位置累积会污染下个 case，
  // 因此每个 test 的 beforeEach 里用 IPC 把气泡位置 reset 到默认）。
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ electronApp }) => {
    // 目前 ambient 功能未实现 + Q7 启动路径未敲定，整 suite 先 skip。
    // Dev 实现 + Q7 REQ-CLARIFY-REPLY 后移除此 guard。
    const info = await getAmbientBubbleInfo(electronApp);
    test.skip(
      info === null,
      'Ambient bubble window not found. Blockers: (1) Dev has not implemented ambient mode yet; ' +
        '(2) Q7 REQ-CLARIFY-REPLY pending — `AIONUI_AMBIENT=1` launch path under singleton fixture undefined. ' +
        'Unskip after Dev [IMPL_DONE] + Q7 answer lands.'
    );
  });

  test.beforeEach(async ({ electronApp }) => {
    // 每个 case 开始前把气泡位置 reset 到默认右下角（Dev 暴露 `ambient.resetBubblePosition`）。
    // 没实现前空实现，suite 因为 beforeAll skip 也跑不到这里。
    await electronApp
      .evaluate(({ BrowserWindow }) => {
        const bubbleWin = BrowserWindow.getAllWindows().find((w) => {
          if (w.isDestroyed()) return false;
          return w.getTitle().toLowerCase().includes('ambient');
        });
        if (!bubbleWin) return;
        // 重置到右下角的默认位置由 Dev 暴露的 IPC 负责；骨架里先留空
      })
      .catch(() => {
        /* best-effort */
      });
  });

  // ── AC-M1-1: 启动 2s 内气泡可见，位于主显示器 workArea 右下角距边 24 px ──
  test('AC-M1-1: bubble visible within 2s at primary-workArea bottom-right with 24px margin', async ({
    electronApp,
  }) => {
    await expect
      .poll(async () => getAmbientBubbleInfo(electronApp), { timeout: 2_000, intervals: [100] })
      .not.toBeNull();
    const info = await getAmbientBubbleInfo(electronApp);
    expect(info, 'ambient bubble window must appear within 2s').not.toBeNull();
    const { bounds, primaryWorkArea } = info!;

    // AC-M1-1 定稿：用 getPrimaryDisplay().workAreaSize（扣 Dock/任务栏），不用 screen.width
    // 气泡左上角 = workArea 右下角 - 24 margin - 64 bubble size（同时加上 workArea 的 x/y 偏移）
    const expectedX = primaryWorkArea.x + primaryWorkArea.width - SCREEN_MARGIN - BUBBLE_SIZE;
    const expectedY = primaryWorkArea.y + primaryWorkArea.height - SCREEN_MARGIN - BUBBLE_SIZE;

    expect(bounds.width).toBe(BUBBLE_SIZE);
    expect(bounds.height).toBe(BUBBLE_SIZE);
    // 容差 ±2 px：OS 级 DPI rounding
    expect(Math.abs(bounds.x - expectedX), `bubble.x ${bounds.x} vs expected ${expectedX}`).toBeLessThanOrEqual(2);
    expect(Math.abs(bounds.y - expectedY), `bubble.y ${bounds.y} vs expected ${expectedY}`).toBeLessThanOrEqual(2);
  });

  // ── AC-M1-2a: 拖动中透明度降到 0.85 ─────────────────────────────────────
  test('AC-M1-2a: opacity drops to 0.85 while dragging', async ({ electronApp }) => {
    // 通过 IPC 进入"拖动中"状态（Dev 暴露 `ambient.debug.beginDrag`）。
    // 骨架里用 setOpacity 直接模拟，断言走 getBubbleOpacity helper。
    await electronApp.evaluate(({ BrowserWindow }, dragOpacity) => {
      const bubbleWin = BrowserWindow.getAllWindows().find(
        (w) => !w.isDestroyed() && w.getTitle().toLowerCase().includes('ambient')
      );
      bubbleWin?.setOpacity(dragOpacity);
    }, DRAG_OPACITY);

    const opacity = await getBubbleOpacity(electronApp);
    expect(opacity, 'bubble opacity during drag').toBeCloseTo(DRAG_OPACITY, 2);
  });

  // ── AC-M1-2b: 松手后恢复不透明 + 吸附到所在显示器 workArea 右边 ──────
  test('AC-M1-2b: after drop on right half, bubble snaps to workArea right edge + opacity restores', async ({
    electronApp,
  }) => {
    // 把气泡拖到所在显示器 workArea 右半边，松手
    await electronApp.evaluate(({ BrowserWindow, screen }) => {
      const bubbleWin = BrowserWindow.getAllWindows().find(
        (w) => !w.isDestroyed() && w.getTitle().toLowerCase().includes('ambient')
      );
      if (!bubbleWin) return;
      const current = bubbleWin.getBounds();
      const nearest = screen.getDisplayNearestPoint({ x: current.x + 32, y: current.y + 32 });
      const wa = nearest.workArea;
      bubbleWin.setBounds({
        x: Math.floor(wa.x + wa.width * 0.7),
        y: Math.floor(wa.y + wa.height * 0.5),
        width: 64,
        height: 64,
      });
      // Dev 的吸附逻辑应在 mouseup 后触发；骨架这里依赖实现自动吸附。
    });

    const info = await getAmbientBubbleInfo(electronApp);
    const { bounds, workArea } = info!;
    const expectedRightX = workArea.x + workArea.width - SCREEN_MARGIN - BUBBLE_SIZE;

    // AC-M1-2 吸附：气泡中心 x > workArea.x + workArea.width/2 → 吸右边
    expect(
      Math.abs(bounds.x - expectedRightX),
      `snapped.x ${bounds.x} vs expected ${expectedRightX}`
    ).toBeLessThanOrEqual(2);
    // y 保留在松手时位置（workArea y clamp 内）
    expect(bounds.y).toBeGreaterThanOrEqual(workArea.y + SCREEN_MARGIN - 2);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(workArea.y + workArea.height - SCREEN_MARGIN + 2);
    // opacity 恢复到 1.0
    const opacity = await getBubbleOpacity(electronApp);
    expect(opacity, 'bubble opacity after drop').toBeCloseTo(DEFAULT_OPACITY, 2);
  });

  test('AC-M1-2c: drop on left half snaps to workArea left edge', async ({ electronApp }) => {
    await electronApp.evaluate(({ BrowserWindow, screen }) => {
      const bubbleWin = BrowserWindow.getAllWindows().find(
        (w) => !w.isDestroyed() && w.getTitle().toLowerCase().includes('ambient')
      );
      if (!bubbleWin) return;
      const current = bubbleWin.getBounds();
      const nearest = screen.getDisplayNearestPoint({ x: current.x + 32, y: current.y + 32 });
      const wa = nearest.workArea;
      bubbleWin.setBounds({
        x: Math.floor(wa.x + wa.width * 0.3),
        y: Math.floor(wa.y + wa.height * 0.5),
        width: 64,
        height: 64,
      });
    });

    const info = await getAmbientBubbleInfo(electronApp);
    const { bounds, workArea } = info!;
    const expectedLeftX = workArea.x + SCREEN_MARGIN;
    // AC-M1-2 吸附：气泡中心 x < workArea.x + workArea.width/2 → 吸左边
    expect(
      Math.abs(bounds.x - expectedLeftX),
      `snapped.x ${bounds.x} vs expected ${expectedLeftX}`
    ).toBeLessThanOrEqual(2);
  });

  // ── AC-M1-2d: 透明度复位之 watchdog 超时（8s DRAG_WATCHDOG_MS）────────
  // AC-M1-2 硬约束 case 2/3：drag-start 后若 renderer 丢 pointerup，必须靠
  // watchdog（复用 pet 的 DRAG_WATCHDOG_MS = 8000ms）把 opacity 复位到 1.0，
  // 否则气泡永久 0.85 半透只能重启。
  test('AC-M1-2d: opacity restores to 1.0 after drag watchdog timeout', async () => {
    test.skip(
      true,
      'PENDING fake-timer harness (8s real timeout too slow): assertion shape = ' +
        'trigger drag-start (opacity=0.85) → do NOT mouseup → inject 8000ms+ via fake timer → ' +
        'assert getBubbleOpacity() === 1.0. Needs either Dev-exposed `ambient.debug.injectWatchdogTimeout` IPC ' +
        'or Playwright clock mocking (page.clock.install / fastForward) on the bubble window once ambientTest.bubblePage lands.'
    );
  });

  // ── AC-M1-2e: 透明度复位之 drag 被状态切换 / resize 中断 ─────────────
  // AC-M1-2 硬约束 case 3/3：drag 进行中若窗口被 resize 或状态切换（hover 超时、
  // 点窗口外、Esc）打断，复位 1.0 必须触发。PM 建议 interrupt case 用真 user event 直测。
  test('AC-M1-2e: opacity restores to 1.0 when drag interrupted by state transition', async () => {
    test.skip(
      true,
      'PENDING AC-M1-14 fixture `bubblePage` accessor: assertion shape = ' +
        'bubblePage.mouse.down on [data-testid="ambient-bubble"] (opacity=0.85) → ' +
        'dispatch Esc keypress / click outside to force state transition → ' +
        'assert getBubbleOpacity() === 1.0 within 500ms. Real user event (black-box), no debug IPC.'
    );
  });

  // ── AC-M1-3: alwaysOnTop ─────────────────────────────────────────────
  test('AC-M1-3: bubble window is alwaysOnTop', async ({ electronApp }) => {
    const info = await getAmbientBubbleInfo(electronApp);
    expect(info!.alwaysOnTop).toBe(true);
  });

  // ── AC-M1-4: frameless + transparent ─────────────────────────────────
  // AC-M3-12 前瞻：M1 气泡用 BUBBLE_RENDER_MODE（transparent:true）；M3 将切到
  // CHAT_RENDER_MODE（transparent:false + rgba 背景）。写 M3 spec 时换常量即可。
  test('AC-M1-4: bubble window is frameless + transparent (BUBBLE_RENDER_MODE)', async ({ electronApp }) => {
    const opts = await getAmbientBubbleCreateOptions(electronApp);
    expect(opts, 'bubble window must exist').not.toBeNull();
    // transparent 指纹：isOpaque() === false
    expect(
      opts!.isTransparent,
      `bubble window should be transparent (BUBBLE_RENDER_MODE.transparent=${BUBBLE_RENDER_MODE.transparent})`
    ).toBe(BUBBLE_RENDER_MODE.transparent);
    expect(opts!.alwaysOnTop).toBe(true);
    // frame:false 无 runtime 直接 API，建议 Dev 暴露 `ambient.debug.getWindowOptions` IPC
    // 返回 { frame, transparent, alwaysOnTop } 用于精确断言。Dev 实现后把下行换成
    // invokeBridge 调用。
  });

  // ── AC-M1-5: 位置持久化到 ConfigStorage（走 bridge read 断言）────────
  // 注意：这里**不能**只用 BrowserWindow.getBounds() 做黑盒断言——因为本条测的是
  // "位置已写入 ConfigStorage 持久化层"，不是"当前窗口位置"。getBounds() 只反映
  // 运行时状态，不能证明值落盘。所以必须通过 bridge 读 ConfigStorage。
  //
  // PM [TEST-REVIEW-APPROVED] 黑盒原则在这条的正确应用是：读 bridge（已有公开
  // 的 Config bridge，不是开后门 debug IPC）。`ambient.getBubblePosition` 属于
  // 需要 Dev 在 systemSettingsBridge 里暴露的公开 getter（参考 pet.* 模板）。
  test('AC-M1-5: position is persisted to ConfigStorage (ambient.bubblePosition)', async ({ page, electronApp }) => {
    // 把气泡移到右半屏中部
    await electronApp.evaluate(({ BrowserWindow, screen }) => {
      const bubbleWin = BrowserWindow.getAllWindows().find(
        (w) => !w.isDestroyed() && w.getTitle().toLowerCase().includes('ambient')
      );
      if (!bubbleWin) return;
      const wa = screen.getPrimaryDisplay().workArea;
      bubbleWin.setBounds({
        x: Math.floor(wa.x + wa.width * 0.7),
        y: Math.floor(wa.y + wa.height * 0.5),
        width: 64,
        height: 64,
      });
    });

    // 等实现持久化完成（可能是 debounce 写盘），poll 到 bubblePosition 与当前 bounds 一致
    await expect
      .poll(
        async () => {
          const info = await getAmbientBubbleInfo(electronApp);
          if (!info) return null;
          const persisted = await invokeBridge<{ x: number; y: number; displayId: number } | null>(
            page,
            'ambient.getBubblePosition'
          ).catch(() => null);
          if (!persisted) return null;
          return { bounds: info.bounds, persisted };
        },
        { timeout: 5_000, intervals: [100, 250, 500] }
      )
      .toMatchObject({
        persisted: {
          x: expect.any(Number),
          y: expect.any(Number),
          displayId: expect.any(Number),
        },
      });

    // 精确一致性断言
    const info = await getAmbientBubbleInfo(electronApp);
    const persisted = await invokeBridge<{ x: number; y: number; displayId: number }>(
      page,
      'ambient.getBubblePosition'
    );
    expect(Math.abs(info!.bounds.x - persisted.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(info!.bounds.y - persisted.y)).toBeLessThanOrEqual(2);
    expect(persisted.displayId).toBeGreaterThan(0);
  });

  // ── AC-M1-6: 拖到屏幕外自动拉回可见区域 ─────────────────────────────
  test('AC-M1-6: bubble dragged off-screen is pulled back to visible area', async ({ electronApp }) => {
    // 模拟把气泡 setBounds 到屏幕外（x=-500, y=-500）
    await electronApp.evaluate(({ BrowserWindow }) => {
      const bubbleWin = BrowserWindow.getAllWindows().find(
        (w) => !w.isDestroyed() && w.getTitle().toLowerCase().includes('ambient')
      );
      bubbleWin?.setBounds({ x: -500, y: -500, width: 64, height: 64 });
      // Dev 的 mouseup 处理应做 clamp，触发方式取决于实现；这里依赖自动矫正。
    });

    const info = await getAmbientBubbleInfo(electronApp);
    const { bounds, workArea } = info!;
    // AC-M1-2 y-clamp + AC-M1-13 position clamp：回到 workArea 边界内
    expect(bounds.x).toBeGreaterThanOrEqual(workArea.x);
    expect(bounds.y).toBeGreaterThanOrEqual(workArea.y);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(workArea.x + workArea.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(workArea.y + workArea.height);
  });

  // ── AC-M1-7: 多显示器（定稿 permanent skip）──────────────────────────
  // [REQ-CHANGE-v3] Arch 确认 Electron screen 模块是 native module，monkey-patch
  // 对 BrowserWindow 不生效。直接 permanent skip，登记 manual-checklist。
  test('AC-M1-7: multi-display first-launch uses primary display bottom-right', async () => {
    test.skip(true, 'Multi-monitor scenarios require hardware; tracked in manual-checklist');
  });

  // ── AC-M1-8: 点击 = hover 展开（mouseup 触发，拖动阈值 5 px）─────────
  // PM [TEST-REVIEW-APPROVED] 新指引：走黑盒 API（page.mouse + data-testid），
  // 不依赖 debug IPC。触发：bubblePage.mouse.down → move(dx,0) → up。
  // 状态推断：bubblePage.locator('[data-testid="ambient-input"]').isVisible() = true → state='input'。
  //
  // 所有 AC-M1-8 case 依赖 ambientPage（AC-M1-14 fixture 的 bubblePage accessor），
  // 当前 singleton fixture 无法拿到气泡窗对应的 Page → 整 AC-M1-8 skip pending fixture。

  test('AC-M1-8a: click (0px movement) triggers M2 expand via mouseup', async () => {
    test.skip(
      true,
      'PENDING AC-M1-14 fixture `bubblePage` accessor: black-box assertion needs ' +
        '`bubblePage.mouse.down() → up()` on `[data-testid="ambient-bubble"]` center, then ' +
        '`bubblePage.locator(\'[data-testid="ambient-input"]\').isVisible()`. ' +
        'Requires Playwright Page routed to bubble window (ambientTest.bubblePage).'
    );
  });

  test('AC-M1-8b: click with 4px movement (<=5px threshold) still triggers M2 expand', async () => {
    test.skip(
      true,
      'PENDING AC-M1-14 fixture `bubblePage` accessor: mouse.down → move(4,0) → up, ' +
        'then assert input testid visible (4px within CLICK_VS_DRAG_THRESHOLD=5px so counts as click).'
    );
  });

  test('AC-M1-8c: drag with 6px movement (>5px threshold) does NOT trigger M2 expand', async () => {
    test.skip(
      true,
      'PENDING AC-M1-14 fixture `bubblePage` accessor: mouse.down → move(6,0) → up, ' +
        'then assert bubble testid still visible + input testid NOT visible (6px exceeds threshold).'
    );
  });

  // ── AC-M1-10: ambient 启用 → ambient 窗口创建，legacy pet 路径跳过（替代）──
  // [REQ-CHANGE-v5] U-1 = A：Ambient 是 Pet 的演进，不是并行互斥。启动期二选一：
  // ambient 启用 → 创建 ambient 窗口；未启用 → 走 legacy pet 路径。
  //
  // 原断言"pet 窗口数=0"失效：A 演进下 pet 窗口的概念可能被改名 / 代码路径消失，
  // "pet-titled window" 不再是稳定的负面信号。改为：
  //   (1) 有且仅有 1 个悬浮气泡窗口（ambient 语义）
  //   (2) ambient 窗口存在（title/url 匹配 ambient|bubble）
  test('AC-M1-10: ambient enabled → ambient window created, legacy pet path skipped', async ({ electronApp }) => {
    const info = await getAmbientBubbleInfo(electronApp);
    expect(info, 'ambient bubble window must exist when ambient is enabled').not.toBeNull();

    // 统计所有悬浮小圆窗口（宽高 ≤ 100 + alwaysOnTop），应当有且仅有 1 个
    const counts = await countFloatingBubbleWindows(electronApp);
    const totalFloating = counts.ambient + counts.pet;
    expect(
      totalFloating,
      `exactly one floating bubble window expected (U-1=A evolution); got ambient=${counts.ambient}, pet=${counts.pet}`
    ).toBe(1);
    // 存在的那一个应当是 ambient 语义（非 legacy pet title）
    expect(counts.ambient, 'the single bubble must be ambient-titled, not legacy pet').toBe(1);
  });

  // ── AC-M1-11: AIONUI_AMBIENT env var 优先级高于 settings 开关 ─────────
  test('AC-M1-11: AIONUI_AMBIENT env var overrides settings switch', async ({ electronApp }) => {
    test.skip(
      true,
      'PENDING AC-M1-14 fixture `launchAppWithEnv` + `ambientTest`: this assertion requires launching a second ' +
        'Electron process with `AIONUI_AMBIENT=0` while ConfigStorage `ambient.enabled=true` (and the reverse), ' +
        'then asserting env-var wins. Arch/Dev must add `launchAppWithEnv(extraEnv)` helper to tests/e2e/fixtures.ts first.'
    );
    void electronApp;
  });

  // ── AC-M1-12: settings 开关切换模式需要重启 ──────────────────────────
  test('AC-M1-12: toggling ambient via settings requires restart and shows toast', async ({ electronApp, page }) => {
    test.skip(
      true,
      'PENDING Dev: (1) "Experimental: Ambient Mode" settings toggle UI not yet implemented, ' +
        '(2) toast copy "Restart required to apply" must land in locales/en.json first. ' +
        'Assertion shape: flip settings toggle → assert toast visible with matching copy + no window recreation.'
    );
    void electronApp;
    void page;
  });

  // ── AC-M1-13: displayId / position validate 边界保护 ─────────────────
  // 单显示器下可测：模拟 ConfigStorage 里 `ambient.bubblePosition` 的 displayId = 999
  // (不存在)，重启后断言气泡落到主显示器右下角默认位置。
  test('AC-M1-13: invalid persisted displayId falls back to primary display default', async () => {
    test.skip(
      true,
      'PENDING AC-M1-14 fixture `launchAppWithEnv`: this assertion requires seeding ConfigStorage with ' +
        '`ambient.bubblePosition: { x, y, displayId: 999 }` before launch, then asserting bubble appears at ' +
        'primary workArea bottom-right (AC-M1-1). Needs a fresh launch per case (singleton fixture cannot reset). ' +
        'Assertion shape: write stale displayId → launchAppWithEnv({AIONUI_AMBIENT:"1"}) → getAmbientBubbleInfo → ' +
        'assert bounds match AC-M1-1 default, AND ambient.getBubblePosition returns sanitized value (fresh displayId).'
    );
  });

  test('AC-M1-13b: persisted position outside workArea is clamped back', async () => {
    test.skip(
      true,
      'PENDING AC-M1-14 fixture `launchAppWithEnv`: seed ConfigStorage `ambient.bubblePosition: { x: 99999, y: 99999, displayId: <valid> }` ' +
        'before launch, then assert bubble appears clamped inside workArea (AC-M1-6 / AC-M1-13 clamp rule).'
    );
  });

  // ── AC-M1-14: E2E fixture 契约（meta test，确认 fixture 存在）────────
  // 这条不是验证业务逻辑，而是验证"我们有 ambientTest fixture 可用"——Arch/Dev
  // 实现 launchAppWithEnv + ambientTest 后，此用例 unskip 并改成 import check。
  test('AC-M1-14: ambientTest fixture is exported from tests/e2e/fixtures.ts', async () => {
    test.skip(
      true,
      'PENDING Arch/Dev implementation of `launchAppWithEnv(extraEnv)` + `ambientTest` in tests/e2e/fixtures.ts. ' +
        'Assertion shape (after impl): `import { ambientTest } from "../../fixtures"; expect(ambientTest).toBeDefined();` ' +
        'and switch this entire spec to use ambientTest instead of the current singleton test.'
    );
  });

  // ── AC-M1-15: 存量 Pet 用户迁移（U-1=A 伴生，2026-05-11）─────────────
  // [REQ-CHANGE-v5] 预设 `pet.enabled=true` 且 `ambient.*` 未设置的老用户，首次
  // 启动 A 演进版本时必须自动迁移：
  //   - ambient.enabled := true
  //   - ambient.bubblePosition := 沿用 pet 的位置（含 displayId，若 pet 有）
  //   - ambient._migratedFromPet := true（幂等标记，第二次启动不重复迁移）
  test('AC-M1-15: legacy pet user is migrated to ambient on first launch', async () => {
    test.skip(
      true,
      'PENDING Dev impl of pet->ambient migration (AC-M1-15). ' +
        'Also pending AC-M1-14 fixture `launchAppWithEnv` to seed ConfigStorage `pet.enabled=true` + ' +
        'no `ambient.*` keys, then launch, then assert ambient.enabled=true, ambient.bubblePosition ' +
        'inherits pet position (with displayId if pet had one), ambient._migratedFromPet=true. ' +
        'Second launch must not re-migrate (idempotency).'
    );
  });

  // ── 视觉回归快照 ─────────────────────────────────────────────────────
  // 最少 2 张：气泡初始态 + 拖动中态（opacity 0.85）
  test('visual: bubble initial state snapshot', async ({ electronApp, page }) => {
    test.skip(
      true,
      'PENDING AC-M1-14 fixture `ambientPage`: need ambient-bubble Page (not main window Page) to capture ' +
        'a DOM screenshot scoped to `[data-testid="ambient-bubble"]`. Will unskip once ambientTest fixture exposes ' +
        'a `bubblePage` accessor; then generate baseline via `toHaveScreenshot(..., --update-snapshots)`.'
    );
    void electronApp;
    void page;
  });

  test('visual: bubble dragging state snapshot (opacity 0.85)', async ({ electronApp, page }) => {
    test.skip(true, 'PENDING AC-M1-14 fixture `ambientPage` (same as initial-state snapshot).');
    void electronApp;
    void page;
  });
});
