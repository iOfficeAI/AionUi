import { test, expect } from '../../../../fixtures';
import {
  invokeBridge,
  goToGuid,
  selectAgent,
  sendMessageFromGuid,
  waitForAiReply,
  takeScreenshot,
  AGENT_STATUS_MESSAGE,
} from '../../../../helpers';

const AI_MSG_SELECTOR = '.message-item.text.justify-start';
const createdIds: string[] = [];

test.afterAll(async ({ page }) => {
  for (const id of createdIds) {
    await invokeBridge(page, 'remove-conversation', { id }).catch(() => {});
  }
  createdIds.length = 0;
});

test.describe('F-RELIABILITY-01 连接超时自动处理', () => {
  let connConvId: string;

  test.beforeAll(async ({ page }) => {
    test.setTimeout(180_000);
    await goToGuid(page);
    await selectAgent(page, 'claude');
    connConvId = await sendMessageFromGuid(page, 'E2E reliability connection test: say hello briefly.');
    createdIds.push(connConvId);
    await waitForAiReply(page, 120_000);
  });

  test('正常连接成功后 agent_status 非 error（基线验证）', async ({ page }) => {
    const msgs = await invokeBridge<Array<{ type: string; content: unknown }>>(
      page,
      'database.get-conversation-messages',
      { conversation_id: connConvId }
    ).catch(() => []);

    const statusMsgs = msgs.filter((m) => m.type === 'agent_status');

    if (statusMsgs.length > 0) {
      const lastStatus = statusMsgs[statusMsgs.length - 1];
      const content = lastStatus.content as { status?: string };
      expect(content.status).not.toBe('error');
    }

    const aiMsgs = page.locator(AI_MSG_SELECTOR);
    const count = await aiMsgs.count();
    expect(count).toBeGreaterThan(0);
  });

  test('发送新消息触发重连验证（UI 不卡死 + 可继续交互）', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    await textarea.waitFor({ state: 'visible', timeout: 10_000 });
    const isDisabled = await textarea.isDisabled();
    expect(isDisabled).toBe(false);

    await textarea.fill('Follow-up message after connection established');
    await textarea.press('Enter');

    const replyText = await waitForAiReply(page, 120_000);
    expect(replyText.length).toBeGreaterThan(0);
  });

  test('连接超时截图', async ({ page }) => {
    await takeScreenshot(page, 'reliability-01-connection-baseline');
  });

  test.skip('连接超时后显示明确错误提示（需注入网络故障，E2E 不可控）', async () => {});
  test.skip('首次连接失败自动重试一次（需注入网络故障，E2E 不可控）', async () => {});
  test.skip('不同后端连接等待时间差异验证（需模拟慢连接，E2E 不可控）', async () => {});
});

test.describe('F-RELIABILITY-02 AI 回复超时自动处理', () => {
  let timeoutConvId: string;

  test.beforeAll(async ({ page }) => {
    test.setTimeout(240_000);
    await goToGuid(page);
    await selectAgent(page, 'claude');
    timeoutConvId = await sendMessageFromGuid(
      page,
      'Write a very long essay about the history of computing, covering at least 20 major milestones in detail.'
    );
    createdIds.push(timeoutConvId);
  });

  test('正常 AI 响应不触发超时（基线验证）', async ({ page }) => {
    const replyText = await waitForAiReply(page, 180_000);
    expect(replyText.length).toBeGreaterThan(0);

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    const isDisabled = await textarea.isDisabled();
    expect(isDisabled).toBe(false);
  });

  test('停止 AI 回复后用户可重新发送消息', async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'claude');
    const stopConvId = await sendMessageFromGuid(
      page,
      'Write an extremely detailed analysis of every Shakespeare play ever written, with full plot summaries.'
    );
    createdIds.push(stopConvId);

    const stopButton = page.locator('button[class*="stop"], [data-testid="stop-button"], [aria-label*="stop" i]');
    const stopVisible = await stopButton
      .first()
      .isVisible({ timeout: 30_000 })
      .catch(() => false);

    if (stopVisible) {
      await stopButton.first().click();
      await page.waitForTimeout(2_000);
    } else {
      await waitForAiReply(page, 120_000);
    }

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    const isDisabled = await textarea.isDisabled();
    expect(isDisabled).toBe(false);

    await textarea.fill('Can you respond after stop?');
    await textarea.press('Enter');

    const replyText = await waitForAiReply(page, 120_000);
    expect(replyText.length).toBeGreaterThan(0);
  });

  test('AI 回复超时截图', async ({ page }) => {
    await takeScreenshot(page, 'reliability-02-timeout-baseline');
  });

  test.skip('AI 无响应超过配置时间后自动取消并提示（需 AI 不响应，E2E 不可控）', async () => {});
  test.skip('工具调用和权限审批期间不触发超时（需精确时序控制，E2E 不稳定）', async () => {});
  test.skip('AI 有持续输出时不触发超时（需控制输出节奏，E2E 不可控）', async () => {});
});
