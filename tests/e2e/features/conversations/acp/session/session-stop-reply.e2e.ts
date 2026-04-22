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

const AI_MSG_SELECTOR = '.message-item.text.justify-start';

const createdIds: string[] = [];

test.afterAll(async ({ page }) => {
  for (const id of createdIds) {
    await invokeBridge(page, 'remove-conversation', { id }).catch(() => {});
  }
  createdIds.length = 0;
});

test.describe('F-SESSION-03 停止当前 AI 回复', () => {
  let conversationId: string;

  test.beforeAll(async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'claude');
    conversationId = await sendMessageFromGuid(
      page,
      'Write a very long essay about the history of computing, covering at least 20 major milestones in detail.'
    );
    createdIds.push(conversationId);
  });

  test('AI 回复过程中显示停止按钮并可点击', async ({ page }) => {
    const stopButton = page.locator('button[class*="stop"], [data-testid="stop-button"], [aria-label*="stop" i]');
    await expect(stopButton.first()).toBeVisible({ timeout: 30_000 });
    await stopButton.first().click();

    await page.waitForTimeout(2_000);

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    const isDisabled = await textarea.isDisabled();
    expect(isDisabled).toBe(false);
  });

  test.skip('会话未初始化时点击停止不崩溃（E2E 难以精确复现时序）', async () => {});

  test('停止后已输出的部分回复保留且可继续发消息', async ({ page }) => {
    const messages = await page.evaluate(() => {
      const items = document.querySelectorAll('.message-item.text');
      return items.length;
    });
    expect(messages).toBeGreaterThan(0);

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    await textarea.fill('Follow-up after stop');
    await textarea.press('Enter');

    await waitForAiReply(page, 120_000);

    const updatedCount = await page.evaluate(() => {
      const items = document.querySelectorAll('.message-item.text.justify-start');
      return items.length;
    });
    expect(updatedCount).toBeGreaterThanOrEqual(1);
  });
});

test.describe('F-SESSION-10 AI 回复完成处理', () => {
  test('AI 完成回复后界面恢复可输入状态', async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'claude');
    const conversationId = await sendMessageFromGuid(page, 'Say hello in one sentence.');
    createdIds.push(conversationId);

    const replyText = await waitForAiReply(page, 120_000);
    expect(replyText.length).toBeGreaterThan(0);

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    const isDisabled = await textarea.isDisabled();
    expect(isDisabled).toBe(false);

    await takeScreenshot(page, 'session-10-reply-complete');
  });

  test.skip('turn 完成边界（待确认）', async () => {});
});
