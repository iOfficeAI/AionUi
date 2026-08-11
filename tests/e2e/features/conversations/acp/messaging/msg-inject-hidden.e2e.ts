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

test.describe('F-MSG-03 首条消息自动注入 AI 规则', () => {
  let conversationId: string;

  test.beforeAll(async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'claude');
    conversationId = await sendMessageFromGuid(page, 'What capabilities do you have?');
    createdIds.push(conversationId);
    await waitForSessionActive(page, 120_000);
  });

  test('首条消息发送后 AI 能正常回复', async ({ page }) => {
    const replyText = await waitForAiReply(page, 120_000);
    expect(replyText.length).toBeGreaterThan(0);
  });

  test('注入内容对用户不可见（UI 中仅显示用户原始消息）', async ({ page }) => {
    const userMessages = page.locator('.message-item.text.justify-end');
    const firstUserMsg = userMessages.first();
    await expect(firstUserMsg).toBeVisible({ timeout: 10_000 });

    const visibleText = await firstUserMsg.innerText();
    expect(visibleText).toContain('What capabilities do you have?');
    expect(visibleText.length).toBeLessThan(500);
  });

  test('DB 中存储的是原始消息（注入在传输层透明处理）', async ({ page }) => {
    await page.waitForTimeout(2_000);

    const messages = await invokeBridge<{ content?: unknown; position?: string; type?: string }[]>(
      page,
      'database.get-conversation-messages',
      { conversation_id: conversationId }
    );

    const getTextContent = (m: { content?: unknown }): string => {
      if (!m.content) return '';
      if (typeof m.content === 'string') return m.content;
      if (typeof m.content === 'object' && m.content !== null && 'content' in m.content) {
        return String((m.content as Record<string, unknown>).content ?? '');
      }
      return JSON.stringify(m.content);
    };

    const userMsgs = messages.filter((m) => m.position === 'right' && m.type === 'text');
    expect(userMsgs.length).toBeGreaterThanOrEqual(1);

    const firstMsgText = getTextContent(userMsgs[0]);
    expect(firstMsgText).toContain('What capabilities do you have?');
  });

  test('后续消息可正常发送和收到回复', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    await textarea.fill('Tell me a short joke.');
    await textarea.press('Enter');

    const replyText = await waitForAiReply(page, 120_000);
    expect(replyText.length).toBeGreaterThan(0);

    await takeScreenshot(page, 'msg-03-inject-second-msg');
  });

  test.skip('自定义工作区场景下规则注入方式差异（需要预先配置工作区）', async () => {});
  test.skip('无可用规则和技能时消息原样发送（需要清空规则配置）', async () => {});
});

test.describe('F-MSG-04 隐藏消息与静默消息', () => {
  test('hidden 消息在 DB 中存在但 UI 不显示', async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'claude');
    const conversationId = await sendMessageFromGuid(page, 'E2E hidden message test');
    createdIds.push(conversationId);
    await waitForSessionActive(page, 120_000);
    await waitForAiReply(page, 120_000);

    const messages = await invokeBridge<{ hidden?: boolean; position?: string; content?: string }[]>(
      page,
      'database.get-conversation-messages',
      { conversation_id: conversationId }
    );

    const visibleUserMsgs = page.locator('.message-item.text.justify-end');
    const visibleUserCount = await visibleUserMsgs.count();

    const dbUserMsgs = messages.filter((m) => m.position === 'right');

    const hiddenMsgs = messages.filter((m) => m.hidden === true);

    expect(messages.length).toBeGreaterThan(0);
    expect(dbUserMsgs.length).toBeGreaterThanOrEqual(visibleUserCount);

    if (hiddenMsgs.length > 0) {
      const visibleAiMsgs = page.locator(AI_MSG_SELECTOR);
      const visibleAiCount = await visibleAiMsgs.count();
      const dbAiMsgs = messages.filter((m) => m.position === 'left' && !m.hidden);
      expect(visibleAiCount).toBeLessThanOrEqual(dbAiMsgs.length + 1);
    }

    await takeScreenshot(page, 'msg-04-hidden-messages');
  });

  test.skip('静默消息不记录到消息历史（需要内部 API 触发，IPC bridge 不支持直接发送静默消息）', async () => {});
  test.skip('通过定时任务触发隐藏消息（需要配置定时任务，E2E 等待成本高）', async () => {});
});
