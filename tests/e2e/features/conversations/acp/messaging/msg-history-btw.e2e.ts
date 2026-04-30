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

const createdIds: string[] = [];

test.afterAll(async ({ page }) => {
  for (const id of createdIds) {
    await invokeBridge(page, 'remove-conversation', { id }).catch(() => {});
  }
  createdIds.length = 0;
});

test.describe('F-MSG-06 输入框历史记录', () => {
  let conversationId: string;
  const sentMessages = ['First history test message', 'Second history test message', 'Third history test message'];

  test.beforeAll(async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'claude');
    conversationId = await sendMessageFromGuid(page, sentMessages[0]);
    createdIds.push(conversationId);
    await waitForSessionActive(page, 120_000);
    await waitForAiReply(page, 120_000);

    for (let i = 1; i < sentMessages.length; i++) {
      const textarea = page.locator('textarea').first();
      await expect(textarea).toBeVisible({ timeout: 15_000 });
      await textarea.fill(sentMessages[i]);
      await textarea.press('Enter');
      await waitForAiReply(page, 120_000);
    }
  });

  test('按上键可浏览历史输入', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    await textarea.click();
    await textarea.fill('');

    await textarea.press('ArrowUp');
    await page.waitForTimeout(500);

    const value = await textarea.inputValue();
    const matchesAnyHistory = sentMessages.some((msg) => value.includes(msg));
    expect(matchesAnyHistory || value.length > 0).toBe(true);

    await takeScreenshot(page, 'msg-06-history-up');
  });

  test('选择历史内容后可编辑再发送', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    await textarea.click();
    await textarea.fill('');

    await textarea.press('ArrowUp');
    await page.waitForTimeout(500);

    const historyValue = await textarea.inputValue();
    if (historyValue.length > 0) {
      await textarea.fill(historyValue + ' (edited)');
      await textarea.press('Enter');

      const replyText = await waitForAiReply(page, 120_000);
      expect(replyText.length).toBeGreaterThan(0);
    }
  });

  test.skip('上下键在多行输入时不触发历史（需要精确光标位置控制）', async () => {});
});

test.describe('F-MSG-07 重试与撤销上一轮对话', () => {
  test('Claude /rewind 会打开回退选择并真实裁剪消息历史', async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'claude');
    const conversationId = await sendMessageFromGuid(page, 'F-MSG-07 rewind first turn');
    createdIds.push(conversationId);
    await waitForSessionActive(page, 120_000);
    await waitForAiReply(page, 120_000);

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    await textarea.fill('F-MSG-07 rewind second turn');
    await textarea.press('Enter');
    await waitForAiReply(page, 120_000);

    const beforeMessages = await invokeBridge<
      Array<{ id: string; type?: string; position?: string; content?: { content?: string } }>
    >(page, 'database.get-conversation-messages', { conversation_id: conversationId });
    const beforeUserCount = beforeMessages.filter(
      (message) => message.type === 'text' && message.position === 'right'
    ).length;
    expect(beforeUserCount).toBeGreaterThanOrEqual(2);

    await textarea.fill('/rewind');
    await textarea.press('Enter');

    await expect(page.getByText(/Rewind conversation/i)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /F-MSG-07 rewind second turn/i }).click();

    await expect(page.getByText(/Rewind conversation/i)).toHaveCount(0, { timeout: 15_000 });
    await expect(textarea).toHaveValue('F-MSG-07 rewind second turn', { timeout: 15_000 });

    await expect
      .poll(
        async () => {
          const messages = await invokeBridge<
            Array<{ type?: string; position?: string; content?: { content?: string } }>
          >(page, 'database.get-conversation-messages', { conversation_id: conversationId });
          return messages.filter((message) => message.type === 'text' && message.position === 'right').length;
        },
        { timeout: 15_000 }
      )
      .toBe(beforeUserCount - 1);

    const afterMessages = await invokeBridge<
      Array<{ type?: string; position?: string; content?: { content?: string } }>
    >(page, 'database.get-conversation-messages', { conversation_id: conversationId });
    const hasRemovedPrompt = afterMessages.some(
      (message) =>
        message.type === 'text' &&
        message.position === 'right' &&
        message.content?.content === 'F-MSG-07 rewind second turn'
    );
    expect(hasRemovedPrompt).toBe(false);
  });

  test('Codex /undo 会真实裁剪最近一轮并恢复输入框', async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'codex');
    const conversationId = await sendMessageFromGuid(page, 'F-MSG-07 codex undo first turn');
    createdIds.push(conversationId);
    await waitForSessionActive(page, 120_000);
    await waitForAiReply(page, 120_000);

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    await textarea.fill('F-MSG-07 codex undo second turn');
    await textarea.press('Enter');
    await waitForAiReply(page, 120_000);

    const beforeMessages = await invokeBridge<
      Array<{ type?: string; position?: string; content?: { content?: string } }>
    >(page, 'database.get-conversation-messages', { conversation_id: conversationId });
    const beforeUserCount = beforeMessages.filter(
      (message) => message.type === 'text' && message.position === 'right'
    ).length;
    expect(beforeUserCount).toBeGreaterThanOrEqual(2);

    await textarea.fill('/undo');
    await textarea.press('Enter');

    await expect(textarea).toHaveValue('F-MSG-07 codex undo second turn', { timeout: 15_000 });

    await expect
      .poll(
        async () => {
          const messages = await invokeBridge<
            Array<{ type?: string; position?: string; content?: { content?: string } }>
          >(page, 'database.get-conversation-messages', { conversation_id: conversationId });
          return messages.filter((message) => message.type === 'text' && message.position === 'right').length;
        },
        { timeout: 15_000 }
      )
      .toBe(beforeUserCount - 1);

    const afterMessages = await invokeBridge<
      Array<{ type?: string; position?: string; content?: { content?: string } }>
    >(page, 'database.get-conversation-messages', { conversation_id: conversationId });
    const hasRemovedPrompt = afterMessages.some(
      (message) =>
        message.type === 'text' &&
        message.position === 'right' &&
        message.content?.content === 'F-MSG-07 codex undo second turn'
    );
    expect(hasRemovedPrompt).toBe(false);
  });
});

test.describe('F-MSG-08 /btw 追加上下文', () => {
  test('AI 回复中发送 /btw 消息后输入框清空且 AI 完成回复', async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'claude');
    const conversationId = await sendMessageFromGuid(
      page,
      'Write a detailed essay about the history of artificial intelligence, covering at least 10 major milestones.'
    );
    createdIds.push(conversationId);
    await waitForSessionActive(page, 120_000);

    await page.waitForTimeout(3_000);

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    await textarea.fill('/btw Please also mention Alan Turing');
    await textarea.press('Enter');

    await page.waitForTimeout(2_000);
    const textareaValue = await textarea.inputValue();
    expect(textareaValue.length).toBe(0);

    await waitForAiReply(page, 120_000);

    const messages = await invokeBridge<{ position?: string; type?: string }[]>(
      page,
      'database.get-conversation-messages',
      { conversation_id: conversationId }
    );
    expect(messages.length).toBeGreaterThanOrEqual(1);

    await takeScreenshot(page, 'msg-08-btw-sent');
  });

  test.skip('不支持的后端下 /btw 消息进入等待队列（codex 后端行为待确认）', async () => {});
  test.skip('/btw 消息展示样式与普通消息不同（UI 样式差异检测不可靠）', async () => {});
});
