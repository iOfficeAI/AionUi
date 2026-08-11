import { test, expect } from '../../../../fixtures';
import {
  invokeBridge,
  goToGuid,
  selectAgent,
  sendMessageFromGuid,
  waitForSessionActive,
  waitForAiReply,
  takeScreenshot,
  MODE_SELECTOR,
  modeMenuItemByValue,
} from '../../../../helpers';

interface ModeResponse {
  success: boolean;
  data?: { mode: string; initialized?: boolean };
}

const createdIds: string[] = [];

test.afterAll(async ({ page }) => {
  for (const id of createdIds) {
    await invokeBridge(page, 'remove-conversation', { id }).catch(() => {});
  }
  createdIds.length = 0;
});

test.describe('F-CONFIG-02 切换会话模式', () => {
  let conversationId: string;

  test.beforeAll(async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'claude');
    conversationId = await sendMessageFromGuid(page, 'E2E config-mode test: Hello');
    createdIds.push(conversationId);
    await waitForSessionActive(page, 120_000);
    await waitForAiReply(page, 120_000);
  });

  test('可以看到当前后端支持的所有模式', async ({ page }) => {
    const modeSelector = page.locator(MODE_SELECTOR);
    const isModeVisible = await modeSelector.isVisible().catch(() => false);

    if (isModeVisible) {
      await modeSelector.click();
      await page.waitForTimeout(500);
      const menuItems = page.locator('[data-mode-value]');
      const count = await menuItems.count();
      expect(count).toBeGreaterThan(0);
      await page.keyboard.press('Escape');
    } else {
      const modeResult = await invokeBridge<ModeResponse>(page, 'acp.get-mode', { conversationId });
      expect(modeResult?.success).toBe(true);
      expect(modeResult?.data?.mode).toBeTruthy();
    }

    await takeScreenshot(page, 'config-02-mode-list');
  });

  test('通过 UI 切换模式后模式控件更新', async ({ page }) => {
    const modeResult = await invokeBridge<ModeResponse>(page, 'acp.get-mode', { conversationId });
    const currentMode = modeResult?.data?.mode;

    const modeSelector = page.locator(MODE_SELECTOR);
    const isModeVisible = await modeSelector.isVisible().catch(() => false);
    if (!isModeVisible) {
      test.skip();
      return;
    }

    await modeSelector.click();
    await page.waitForTimeout(500);

    const menuItems = page.locator('[data-mode-value]');
    const count = await menuItems.count();
    if (count < 2) {
      await page.keyboard.press('Escape');
      test.skip();
      return;
    }

    let targetMode: string | null = null;
    for (let i = 0; i < count; i++) {
      const val = await menuItems.nth(i).getAttribute('data-mode-value');
      if (val && val !== currentMode) {
        targetMode = val;
        break;
      }
    }

    if (!targetMode) {
      await page.keyboard.press('Escape');
      test.skip();
      return;
    }

    await page.locator(modeMenuItemByValue(targetMode)).click();
    await page.waitForTimeout(1_000);

    const afterMode = await invokeBridge<ModeResponse>(page, 'acp.get-mode', { conversationId });
    expect(afterMode?.data?.mode).toBe(targetMode);

    await takeScreenshot(page, 'config-02-mode-switched');
  });

  test('模式选择在会话关闭重开后仍然保持', async ({ page }) => {
    const beforeMode = await invokeBridge<ModeResponse>(page, 'acp.get-mode', { conversationId });
    const modeBeforeNav = beforeMode?.data?.mode;

    await goToGuid(page);
    await page.waitForTimeout(1_000);

    await page.evaluate((id) => {
      window.location.hash = `/conversation/${id}`;
    }, conversationId);
    await page.waitForFunction((id) => window.location.hash.includes(`/conversation/${id}`), conversationId, {
      timeout: 10_000,
    });
    await page.waitForTimeout(3_000);

    const afterMode = await invokeBridge<ModeResponse>(page, 'acp.get-mode', { conversationId });
    expect(afterMode?.data?.mode).toBe(modeBeforeNav);

    await takeScreenshot(page, 'config-02-mode-persisted');
  });

  test.skip('AI 会话尚未初始化时切换模式（竞态时序不可靠）', async () => {});
  test.skip('切换失败时模式保持不变（E2E 无法可靠触发切换失败）', async () => {});
  test.skip('从免确认模式切回普通模式后 AI 操作需要重新确认（需要结合权限模块验证）', async () => {});
});

test.describe('F-CONFIG-05 查看当前模式', () => {
  let conversationId: string;

  test.beforeAll(async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'claude');
    conversationId = await sendMessageFromGuid(page, 'E2E config-05 view mode test');
    createdIds.push(conversationId);
    await waitForSessionActive(page, 120_000);
    await waitForAiReply(page, 120_000);
  });

  test('用户始终能看到当前模式名称', async ({ page }) => {
    const modeResult = await invokeBridge<ModeResponse>(page, 'acp.get-mode', { conversationId });
    expect(modeResult?.success).toBe(true);
    expect(modeResult?.data?.mode).toBeTruthy();
    expect(modeResult!.data!.mode.length).toBeGreaterThan(0);

    const modeSelector = page.locator(MODE_SELECTOR);
    const isModeVisible = await modeSelector.isVisible().catch(() => false);
    if (isModeVisible) {
      const modeText = await modeSelector.textContent();
      expect(modeText).toBeTruthy();
      expect(modeText!.length).toBeGreaterThan(0);
    }

    await takeScreenshot(page, 'config-05-current-mode');
  });

  test.skip('AI 尚未初始化时显示默认模式（需要精确捕捉初始化前状态）', async () => {});
});

test.describe('F-CONFIG-07 免确认模式的自动迁移', () => {
  test.skip('旧版免确认设置自动迁移到新的模式系统（E2E 无法构造旧版配置数据）', async () => {});
  test.skip('用户显式选择新模式后旧设置被清理（E2E 无法构造旧版配置数据）', async () => {});
  test.skip('迁移过程对用户透明（E2E 无法检测迁移内部过程）', async () => {});
});

test.describe('F-CONFIG-08 Codex 后端沙盒安全级别联动', () => {
  test('Codex 会话创建后模式可查', async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'codex');
    const conversationId = await sendMessageFromGuid(page, 'E2E config-08 codex sandbox test');
    createdIds.push(conversationId);
    await waitForSessionActive(page, 120_000);
    await waitForAiReply(page, 120_000);

    const modeResult = await invokeBridge<ModeResponse>(page, 'acp.get-mode', { conversationId });
    expect(modeResult?.success).toBe(true);
    expect(modeResult?.data?.mode).toBeTruthy();

    await takeScreenshot(page, 'config-08-codex-sandbox');
  });

  test.skip('切换模式后沙盒安全级别自动调整（E2E 无法直接检查 Codex sandbox level 内部值）', async () => {});
  test.skip('非 Codex 后端不受沙盒联动影响（Gemini 跳过，其余后端无沙盒概念）', async () => {});
});
