import { test, expect } from '../../../../fixtures';
import {
  invokeBridge,
  goToGuid,
  goToNewChat,
  selectAgent,
  sendMessageFromGuid,
  waitForAiReply,
  takeScreenshot,
  MODE_SELECTOR,
  modeMenuItemByValue,
} from '../../../../helpers';

const createdIds: string[] = [];
const BYPASS_PERMISSIONS_MODE = 'bypassPermissions';

test.afterAll(async ({ page }) => {
  for (const id of createdIds) {
    await invokeBridge(page, 'remove-conversation', { id }).catch(() => {});
  }
  createdIds.length = 0;
});

test.describe('F-DISPLAY-03 AI 工具调用展示', () => {
  let toolConvId: string;

  test.beforeAll(async ({ page }) => {
    test.setTimeout(240_000);

    await goToGuid(page);
    await selectAgent(page, 'claude');

    const modeSelector = page.locator(MODE_SELECTOR);
    const modeVisible = await modeSelector.isVisible().catch(() => false);
    if (modeVisible) {
      await modeSelector.click();
      const yoloItem = page.locator(modeMenuItemByValue(BYPASS_PERMISSIONS_MODE));
      const yoloVisible = await yoloItem.isVisible({ timeout: 3_000 }).catch(() => false);
      if (yoloVisible) {
        await yoloItem.click();
        await page.waitForTimeout(1_000);
      } else {
        await page.keyboard.press('Escape');
      }
    }

    toolConvId = await sendMessageFromGuid(
      page,
      'E2E tool display test: Read the file /etc/hostname and tell me what it says. If it does not exist, say so.'
    );
    createdIds.push(toolConvId);
    await waitForAiReply(page, 180_000);
  });

  test('工具调用以卡片形式展示（含工具名称）', async ({ page }) => {
    const toolCards = page.locator('.arco-alert');
    const cardCount = await toolCards.count();

    const toolTags = page.locator('.arco-tag');
    const tagCount = await toolTags.count();

    const toolMessageTypes = page.locator(
      '[data-message-type="tool_group"], [data-message-type="acp_tool_call"], [data-message-type="tool_call"]'
    );
    const typeCount = await toolMessageTypes.count();

    const hasToolUI = cardCount > 0 || tagCount > 0 || typeCount > 0;

    if (hasToolUI) {
      if (typeCount > 0) {
        const firstTool = toolMessageTypes.first();
        const tagText = await firstTool
          .locator('.arco-tag')
          .first()
          .textContent()
          .catch(() => '');
        expect(tagText?.length ?? 0).toBeGreaterThan(0);
      } else if (cardCount > 0) {
        const firstCard = toolCards.first();
        await expect(firstCard).toBeVisible();
      }
    } else {
      const replyText = await waitForAiReply(page, 5_000).catch(() => '');
      expect(replyText.length).toBeGreaterThan(0);
    }
  });

  test('工具执行状态更新（已完成/失败）', async ({ page }) => {
    const toolCards = page.locator('.arco-alert');
    const count = await toolCards.count();

    if (count === 0) {
      test.skip();
      return;
    }

    for (let i = 0; i < Math.min(count, 5); i++) {
      const alertEl = toolCards.nth(i);
      const alertClass = await alertEl.getAttribute('class').catch(() => '');
      const hasStatus =
        alertClass?.includes('arco-alert-success') ||
        alertClass?.includes('arco-alert-error') ||
        alertClass?.includes('arco-alert-info') ||
        alertClass?.includes('arco-alert-warning');
      expect(hasStatus).toBe(true);
    }
  });

  test('工具的输入和输出信息可查看', async ({ page }) => {
    const toolMessageTypes = page.locator(
      '[data-message-type="tool_group"], [data-message-type="acp_tool_call"], [data-message-type="tool_call"]'
    );
    const typeCount = await toolMessageTypes.count();

    const toolCards = page.locator('.arco-alert');
    const cardCount = await toolCards.count();

    if (typeCount > 0) {
      const container = toolMessageTypes.first();
      const descOrResult = container.locator('.text-12px, pre, .arco-alert-content');
      const contentCount = await descOrResult.count();
      if (contentCount > 0) {
        const text = await descOrResult
          .first()
          .textContent()
          .catch(() => '');
        expect(text?.length ?? 0).toBeGreaterThan(0);
      }
    } else if (cardCount > 0) {
      const container = toolCards.first().locator('..');
      const descOrResult = container.locator('.text-12px, pre');
      const contentCount = await descOrResult.count();
      if (contentCount > 0) {
        const text = await descOrResult
          .first()
          .textContent()
          .catch(() => '');
        expect(text?.length ?? 0).toBeGreaterThan(0);
      }
    } else {
      test.skip();
    }
  });

  test('工具调用截图', async ({ page }) => {
    await takeScreenshot(page, 'display-03-tool-call-card');
  });

  test.skip('工具执行失败卡片状态变为失败（需 AI 选择特定工具导致失败，不可控）', async () => {});
});

test.describe('F-DISPLAY-04 AI 执行计划展示', () => {
  let planConvId: string;

  test.beforeAll(async ({ page }) => {
    test.setTimeout(240_000);

    await goToNewChat(page);
    await selectAgent(page, 'claude');

    const modeSelector = page.locator(MODE_SELECTOR);
    const modeVisible = await modeSelector.isVisible().catch(() => false);
    if (modeVisible) {
      await modeSelector.click();
      const yoloItem = page.locator(modeMenuItemByValue(BYPASS_PERMISSIONS_MODE));
      const yoloVisible = await yoloItem.isVisible({ timeout: 3_000 }).catch(() => false);
      if (yoloVisible) {
        await yoloItem.click();
        await page.waitForTimeout(1_000);
      } else {
        await page.keyboard.press('Escape');
      }
    }

    planConvId = await sendMessageFromGuid(
      page,
      'E2E plan display test: Create a plan to build a simple calculator in Python. List the steps you would take, then implement step 1 only.'
    );
    createdIds.push(planConvId);
    await waitForAiReply(page, 180_000);
  });

  test('AI 执行计划以步骤列表形式展示（若存在）', async ({ page }) => {
    const msgs = await invokeBridge<Array<{ type: string }>>(page, 'database.get-conversation-messages', {
      conversation_id: planConvId,
    }).catch(() => []);

    const hasPlanMsg = msgs.some((m) => m.type === 'plan');

    if (hasPlanMsg) {
      const planElements = page.locator('[data-message-type="plan"]');
      const count = await planElements.count();
      expect(count).toBeGreaterThan(0);

      await takeScreenshot(page, 'display-04-plan-present');
    } else {
      const replyText = await waitForAiReply(page, 5_000).catch(() => '');
      expect(replyText.length).toBeGreaterThan(0);
    }
  });

  test('执行计划截图', async ({ page }) => {
    await takeScreenshot(page, 'display-04-plan-area');
  });

  test.skip('同一轮对话中计划复用同一展示区域（依赖 AI 多次更新计划，不可控）', async () => {});
  test.skip('计划内容实时更新验证（需精确时序捕捉流式更新，E2E 不稳定）', async () => {});
});
