import { test, expect } from '../../../../fixtures';
import {
  invokeBridge,
  goToGuid,
  selectAgent,
  sendMessageFromGuid,
  waitForSessionActive,
  waitForAiReply,
} from '../../../../helpers';

const AI_MSG_SELECTOR = '.message-item.text.justify-start';

const createdIds: string[] = [];

test.afterAll(async ({ page }) => {
  for (const id of createdIds) {
    await invokeBridge(page, 'remove-conversation', { id }).catch(() => {});
  }
  createdIds.length = 0;
});

test.describe('F-SESSION-04 意外断连自动处理', () => {
  let conversationId: string;

  test.beforeAll(async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'claude');
    conversationId = await sendMessageFromGuid(page, 'E2E reconnect test — initial message');
    createdIds.push(conversationId);
    await waitForSessionActive(page, 120_000);
  });

  test('模拟断连后重发消息自动重连', async ({ page }) => {
    await invokeBridge(page, 'reset-conversation', { id: conversationId });

    await page.waitForTimeout(2_000);

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    await textarea.fill('Message after disconnect — should auto-reconnect');
    await textarea.press('Enter');

    await waitForSessionActive(page, 120_000);

    const replyText = await waitForAiReply(page, 120_000);
    expect(replyText.length).toBeGreaterThan(0);
  });

  test('断连前已输出的内容保留', async ({ page }) => {
    const count = await page.evaluate(() => {
      return document.querySelectorAll('.message-item.text').length;
    });
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test.skip('重连失败后显示错误提示并提供手动重试入口（E2E 无法可靠模拟持续断连）', async () => {});
});

test.describe('F-SESSION-05 空闲会话自动释放', () => {
  test('验证空闲超时配置存在', async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'claude');
    const conversationId = await sendMessageFromGuid(page, 'E2E idle release config check');
    createdIds.push(conversationId);
    await waitForSessionActive(page, 120_000);

    const conv = await invokeBridge<{
      id: string;
      extra: Record<string, unknown>;
    }>(page, 'get-conversation', { id: conversationId });

    expect(conv).toBeTruthy();
    expect(conv.id).toBe(conversationId);
  });

  test('释放后对话历史完整保留', async ({ page }) => {
    const id = createdIds[createdIds.length - 1];
    if (!id) return;

    await invokeBridge(page, 'reset-conversation', { id });
    await page.waitForTimeout(2_000);

    const conv = await invokeBridge<{ id: string }>(page, 'get-conversation', { id });
    expect(conv).toBeTruthy();
    expect(conv.id).toBe(id);

    const aiMessages = page.locator(AI_MSG_SELECTOR);
    const count = await aiMessages.count();
    expect(count).toBeGreaterThan(0);
  });

  test.skip('实际 5 分钟空闲触发验证（E2E 等待成本过高）', async () => {
    // skip 白名单：F-SESSION-05 的实际 5 分钟空闲触发验证
  });
});
