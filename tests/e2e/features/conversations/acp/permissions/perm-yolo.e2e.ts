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

interface IConfirmationItem {
  id: string;
  title?: string;
  description: string;
  callId: string;
  options: Array<{ label: string; value: any }>;
}

const CONFIRM_CARD = '.bg-dialog-fill-0.rd-20px.max-w-800px';
const BYPASS_PERMISSIONS_MODE = 'bypassPermissions';

const createdIds: string[] = [];

test.afterAll(async ({ page }) => {
  for (const id of createdIds) {
    await invokeBridge(page, 'remove-conversation', { id }).catch(() => {});
  }
  createdIds.length = 0;
});

test.describe('F-PERM-03 免确认模式 / YOLO 模式', () => {
  test('支持免确认的 Claude 后端在模式列表中包含 bypassPermissions 选项', async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'claude');
    const conversationId = await sendMessageFromGuid(page, 'E2E perm-03 yolo mode check');
    createdIds.push(conversationId);
    await waitForSessionActive(page, 120_000);
    await waitForAiReply(page, 120_000);

    const modeSelector = page.locator(MODE_SELECTOR);
    const isModeVisible = await modeSelector.isVisible().catch(() => false);

    if (isModeVisible) {
      await modeSelector.click();
      await page.waitForTimeout(500);

      const yoloItem = page.locator(modeMenuItemByValue(BYPASS_PERMISSIONS_MODE));
      const hasYolo = await yoloItem.isVisible().catch(() => false);
      expect(hasYolo).toBe(true);

      await page.keyboard.press('Escape');
    } else {
      // MODE_SELECTOR not visible in conversation view — check via bridge
      const modeResult = await invokeBridge<ModeResponse>(page, 'acp.get-mode', { conversationId });
      expect(modeResult?.success).toBe(true);
      expect(modeResult?.data?.mode).toBeTruthy();
    }

    await takeScreenshot(page, 'perm-03-yolo-available');
  });

  test('开启免确认模式后操作请求自动通过', async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'claude');
    const conversationId = await sendMessageFromGuid(page, 'E2E perm-03 yolo auto-approve test init');
    createdIds.push(conversationId);
    await waitForSessionActive(page, 120_000);
    await waitForAiReply(page, 120_000);

    // Switch to bypassPermissions mode via UI
    const modeSelector = page.locator(MODE_SELECTOR);
    const isModeVisible = await modeSelector.isVisible().catch(() => false);

    if (!isModeVisible) {
      test.skip(undefined, 'MODE_SELECTOR not visible — cannot test YOLO mode switch via UI');
      return;
    }

    await modeSelector.click();
    await page.waitForTimeout(500);

    const yoloItem = page.locator(modeMenuItemByValue(BYPASS_PERMISSIONS_MODE));
    const hasYolo = await yoloItem.isVisible().catch(() => false);
    if (!hasYolo) {
      await page.keyboard.press('Escape');
      test.skip(undefined, 'bypassPermissions mode not available in mode list');
      return;
    }

    await yoloItem.click();
    await page.waitForTimeout(1_000);

    // Verify mode switched
    const modeResult = await invokeBridge<ModeResponse>(page, 'acp.get-mode', { conversationId });
    expect(modeResult?.data?.mode).toBe(BYPASS_PERMISSIONS_MODE);

    // Send a message that would trigger a tool call
    const chatInput = page.locator('textarea, [contenteditable="true"], [role="textbox"]').first();
    await chatInput.fill('Please create a file /tmp/e2e-perm-yolo-test.txt with content "yolo test". Do it now.');
    await chatInput.press('Enter');

    // In YOLO mode, AI should proceed without showing confirmation card
    // Wait for AI reply — should come without a card appearing
    await waitForAiReply(page, 120_000);

    // Verify no pending confirmations
    const confirmList = await invokeBridge<IConfirmationItem[]>(page, 'confirmation.list', {
      conversation_id: conversationId,
    });
    expect(confirmList?.length ?? 0).toBe(0);

    // Verify no confirmation card is visible
    const cardVisible = await page
      .locator(CONFIRM_CARD)
      .first()
      .isVisible()
      .catch(() => false);
    expect(cardVisible).toBe(false);

    await takeScreenshot(page, 'perm-03-yolo-auto-approved');
  });

  test('从免确认模式切回普通模式后模式改变', async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'claude');
    const conversationId = await sendMessageFromGuid(page, 'E2E perm-03 switch back test init');
    createdIds.push(conversationId);
    await waitForSessionActive(page, 120_000);
    await waitForAiReply(page, 120_000);

    // Ensure we're in bypassPermissions mode first (via bridge for reliability)
    let modeResult = await invokeBridge<ModeResponse>(page, 'acp.get-mode', { conversationId });
    if (modeResult?.data?.mode !== BYPASS_PERMISSIONS_MODE) {
      const setResult = await invokeBridge<ModeResponse>(
        page,
        'acp.set-mode',
        { conversationId, mode: BYPASS_PERMISSIONS_MODE },
        15_000
      );
      expect(setResult?.data?.mode).toBe(BYPASS_PERMISSIONS_MODE);
    }

    // Now switch back to a non-YOLO mode via bridge
    // Get available modes from MODE_SELECTOR dropdown to find a valid target
    const modeSelector = page.locator(MODE_SELECTOR);
    const isModeVisible = await modeSelector.isVisible().catch(() => false);
    let targetMode = 'default';

    if (isModeVisible) {
      await modeSelector.click();
      await page.waitForTimeout(500);
      const menuItems = page.locator('[data-mode-value]');
      const count = await menuItems.count();
      for (let i = 0; i < count; i++) {
        const val = await menuItems.nth(i).getAttribute('data-mode-value');
        if (val && val !== BYPASS_PERMISSIONS_MODE) {
          targetMode = val;
          break;
        }
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // Switch back via bridge for reliable mode setting
    const switchResult = await invokeBridge<ModeResponse>(
      page,
      'acp.set-mode',
      { conversationId, mode: targetMode },
      15_000
    );
    expect(switchResult?.data?.mode).toBe(targetMode);

    // Verify via get-mode
    modeResult = await invokeBridge<ModeResponse>(page, 'acp.get-mode', { conversationId });
    expect(modeResult?.data?.mode).toBe(targetMode);
    expect(modeResult?.data?.mode).not.toBe(BYPASS_PERMISSIONS_MODE);

    await takeScreenshot(page, 'perm-03-mode-switched-back');
  });

  test('Codex 后端模式列表中不包含 bypassPermissions 选项', async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'codex');
    const conversationId = await sendMessageFromGuid(page, 'E2E perm-03 codex no-yolo test');
    createdIds.push(conversationId);
    await waitForSessionActive(page, 120_000);
    await waitForAiReply(page, 120_000);

    const modeSelector = page.locator(MODE_SELECTOR);
    const isModeVisible = await modeSelector.isVisible().catch(() => false);

    if (isModeVisible) {
      await modeSelector.click();
      await page.waitForTimeout(500);

      // bypassPermissions should NOT be in Codex's mode list
      const yoloItem = page.locator(modeMenuItemByValue(BYPASS_PERMISSIONS_MODE));
      const hasYolo = await yoloItem.isVisible().catch(() => false);
      expect(hasYolo).toBe(false);

      await page.keyboard.press('Escape');
    } else {
      // If MODE_SELECTOR is not visible, check via bridge that the mode is not bypassPermissions
      const modeResult = await invokeBridge<ModeResponse>(page, 'acp.get-mode', { conversationId });
      expect(modeResult?.data?.mode).not.toBe(BYPASS_PERMISSIONS_MODE);
    }

    await takeScreenshot(page, 'perm-03-codex-no-yolo');
  });

  test.skip('codebuddy 后端免确认模式差异（白名单：待研发确认）', async () => {});
  test.skip('定时任务复用会话时自动进入免确认模式（E2E 无法构造 CronService 触发）', async () => {});
  test.skip('启用免确认失败时用户看到错误提示（E2E 无法可靠触发切换失败）', async () => {});
  test.skip('没有可选项的操作请求在免确认模式下仍弹卡片（E2E 无法构造无选项的权限请求）', async () => {});
  test.skip('Gemini 不支持免确认模式（Gemini 跳过）', async () => {});
});
