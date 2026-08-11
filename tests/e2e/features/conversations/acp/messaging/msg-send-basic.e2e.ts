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

const USER_MSG_SELECTOR = '.message-item.text.justify-end';
const AI_MSG_SELECTOR = '.message-item.text.justify-start';

const createdIds: string[] = [];

test.afterAll(async ({ page }) => {
  for (const id of createdIds) {
    await invokeBridge(page, 'remove-conversation', { id }).catch(() => {});
  }
  createdIds.length = 0;
});

test.describe('F-MSG-01 发送文本消息', () => {
  let conversationId: string;

  test.beforeAll(async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'claude');
    conversationId = await sendMessageFromGuid(page, 'E2E msg-send test: Hello AI');
    createdIds.push(conversationId);
    await waitForSessionActive(page, 120_000);
  });

  test('发送后用户消息立即显示在对话区域', async ({ page }) => {
    const userMessages = page.locator(USER_MSG_SELECTOR);
    await expect(userMessages.first()).toBeVisible({ timeout: 10_000 });
    const count = await userMessages.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('发送后收到 AI 流式回复', async ({ page }) => {
    const replyText = await waitForAiReply(page, 120_000);
    expect(replyText.length).toBeGreaterThan(0);
    await takeScreenshot(page, 'msg-01-ai-reply');
  });

  test('发送后会话出现在侧边栏列表', async ({ page }) => {
    const row = page.locator(`#c-${conversationId}`);
    await expect(row).toBeVisible({ timeout: 10_000 });
  });

  test('空消息不发送', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    const msgCountBefore = await page.locator(USER_MSG_SELECTOR).count();

    await textarea.fill('');
    await textarea.press('Enter');
    await page.waitForTimeout(1_000);

    const msgCountAfter = await page.locator(USER_MSG_SELECTOR).count();
    expect(msgCountAfter).toBe(msgCountBefore);
  });

  test('AI 回复完成后输入框可用且可继续发消息', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    expect(await textarea.isDisabled()).toBe(false);

    await textarea.fill('Follow-up message for F-MSG-01');
    await textarea.press('Enter');

    const replyText = await waitForAiReply(page, 120_000);
    expect(replyText.length).toBeGreaterThan(0);
  });

  test('通过 bridge 验证消息已持久化到数据库', async ({ page }) => {
    await page.waitForTimeout(2_000);

    const messages = await invokeBridge<{ content?: unknown; position?: string; type?: string }[]>(
      page,
      'database.get-conversation-messages',
      { conversation_id: conversationId }
    );
    expect(messages.length).toBeGreaterThanOrEqual(1);

    const userMsgs = messages.filter((m) => m.position === 'right');
    expect(userMsgs.length).toBeGreaterThanOrEqual(1);

    await takeScreenshot(page, 'msg-01-db-verified');
  });

  test.skip('多条队列消息合并发出（部分实现，待完整功能上线后补充）', async () => {});
  test.skip('AI 连接失败时显示错误提示（E2E 无法可靠模拟后端连接失败）', async () => {});
  test.skip('会话不存在时提示会话未找到（防御性边界）', async () => {});
});
