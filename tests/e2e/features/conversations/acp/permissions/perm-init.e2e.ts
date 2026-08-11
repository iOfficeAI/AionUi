import { test, expect } from '../../../../fixtures';
import {
  invokeBridge,
  goToGuid,
  selectAgent,
  sendMessageFromGuid,
  waitForSessionActive,
  waitForAiReply,
  takeScreenshot,
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

const createdIds: string[] = [];

test.afterAll(async ({ page }) => {
  for (const id of createdIds) {
    await invokeBridge(page, 'remove-conversation', { id }).catch(() => {});
  }
  createdIds.length = 0;
});

test.describe('F-PERM-04 查看待确认操作列表', () => {
  test('进入会话时无待确认操作则列表为空', async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'claude');
    const conversationId = await sendMessageFromGuid(page, 'E2E perm-04 empty list test: Hello');
    createdIds.push(conversationId);
    await waitForSessionActive(page, 120_000);
    await waitForAiReply(page, 120_000);

    const confirmList = await invokeBridge<IConfirmationItem[]>(page, 'confirmation.list', {
      conversation_id: conversationId,
    });
    expect(Array.isArray(confirmList)).toBe(true);
    expect(confirmList!.length).toBe(0);

    // No confirmation card should be visible
    const cardVisible = await page
      .locator('.bg-dialog-fill-0.rd-20px.max-w-800px')
      .first()
      .isVisible()
      .catch(() => false);
    expect(cardVisible).toBe(false);

    await takeScreenshot(page, 'perm-04-empty-list');
  });

  test('触发工具调用后 confirmation.list 返回待确认项', async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'claude');
    const conversationId = await sendMessageFromGuid(
      page,
      'Please create file /tmp/e2e-perm04-pending.txt with content "pending test". Do it directly without asking.'
    );
    createdIds.push(conversationId);
    await waitForSessionActive(page, 120_000);

    // Wait for either a confirmation or reply
    const cardOrReply = await Promise.race([
      page
        .locator('.bg-dialog-fill-0.rd-20px.max-w-800px')
        .first()
        .waitFor({ state: 'visible', timeout: 60_000 })
        .then(() => 'card' as const),
      waitForAiReply(page, 60_000).then(() => 'reply' as const),
    ]);

    if (cardOrReply === 'card') {
      // While card is visible, confirmation.list should have items
      const confirmList = await invokeBridge<IConfirmationItem[]>(page, 'confirmation.list', {
        conversation_id: conversationId,
      });
      expect(Array.isArray(confirmList)).toBe(true);
      expect(confirmList!.length).toBeGreaterThan(0);

      // Each item should have required fields
      const item = confirmList![0];
      expect(item.id).toBeTruthy();
      expect(item.callId).toBeTruthy();
      expect(item.options.length).toBeGreaterThan(0);

      await takeScreenshot(page, 'perm-04-pending-list');

      // Now confirm it — click first option
      const card = page.locator('.bg-dialog-fill-0.rd-20px.max-w-800px').first();
      await card.locator('.cursor-pointer.mt-10px').first().click();
      await expect(card).toBeHidden({ timeout: 10_000 });

      // After confirmation, list should be empty
      const afterList = await invokeBridge<IConfirmationItem[]>(page, 'confirmation.list', {
        conversation_id: conversationId,
      });
      expect(afterList?.length ?? 0).toBe(0);

      await waitForAiReply(page, 120_000);
    } else {
      // AI replied directly — verify list API is functional and empty
      const confirmList = await invokeBridge<IConfirmationItem[]>(page, 'confirmation.list', {
        conversation_id: conversationId,
      });
      expect(Array.isArray(confirmList)).toBe(true);
      expect(confirmList!.length).toBe(0);
    }
  });

  test.skip('会话未初始化时返回空列表（需精确捕捉初始化前状态）', async () => {});
});

test.describe('F-PERM-06 会话创建时的模式与权限初始化', () => {
  test('新建会话后模式可查且有明确值', async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'claude');
    const conversationId = await sendMessageFromGuid(page, 'E2E perm-06 default mode test');
    createdIds.push(conversationId);
    await waitForSessionActive(page, 120_000);
    await waitForAiReply(page, 120_000);

    const modeResult = await invokeBridge<ModeResponse>(page, 'acp.get-mode', { conversationId });
    expect(modeResult?.success).toBe(true);
    expect(modeResult?.data?.mode).toBeTruthy();
    expect(modeResult!.data!.mode.length).toBeGreaterThan(0);

    await takeScreenshot(page, 'perm-06-default-mode');
  });

  test('引导页选择免确认模式后新会话立即生效', async ({ page }) => {
    // Use the guid page flow: select agent → pick bypassPermissions mode → send message
    await goToGuid(page);
    await selectAgent(page, 'claude');

    // Check if mode selector is available on guid page
    const modeSelector = page.locator('[data-testid="mode-selector"]');
    const isModeVisible = await modeSelector.isVisible().catch(() => false);

    if (!isModeVisible) {
      test.skip(undefined, 'MODE_SELECTOR not visible on guid page — cannot test mode init from guid');
      return;
    }

    // Select bypassPermissions mode before creating the conversation
    await modeSelector.click();
    await page.waitForTimeout(500);

    const yoloItem = page.locator('[data-mode-value="bypassPermissions"]');
    const hasYolo = await yoloItem.isVisible().catch(() => false);
    if (!hasYolo) {
      await page.keyboard.press('Escape');
      test.skip(undefined, 'bypassPermissions mode not available on guid page');
      return;
    }
    await yoloItem.click();
    await page.waitForTimeout(500);

    const conversationId = await sendMessageFromGuid(page, 'E2E perm-06 yolo init test');
    createdIds.push(conversationId);
    await waitForSessionActive(page, 120_000);
    await waitForAiReply(page, 120_000);

    // Verify the mode is bypassPermissions
    const modeResult = await invokeBridge<ModeResponse>(page, 'acp.get-mode', { conversationId });
    expect(modeResult?.success).toBe(true);
    expect(modeResult?.data?.mode).toBe('bypassPermissions');

    await takeScreenshot(page, 'perm-06-session-mode-init');
  });

  test.skip('引导页选择的模式覆盖全局设置（E2E 无法稳定模拟全局设置初始化顺序）', async () => {});
  test.skip('全局免确认设置在新会话中自动继承（E2E 无法稳定模拟全局设置状态）', async () => {});
  test.skip('Gemini 会话创建时的模式初始化差异（Gemini 跳过）', async () => {});
});
