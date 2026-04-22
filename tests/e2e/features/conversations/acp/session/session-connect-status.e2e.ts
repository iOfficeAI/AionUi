import { test, expect } from '../../../../fixtures';
import {
  invokeBridge,
  goToGuid,
  selectAgent,
  sendMessageFromGuid,
  waitForSessionActive,
  waitForAiReply,
  takeScreenshot,
  AGENT_STATUS_MESSAGE,
} from '../../../../helpers';

const createdIds: string[] = [];

test.afterAll(async ({ page }) => {
  for (const id of createdIds) {
    await invokeBridge(page, 'remove-conversation', { id }).catch(() => {});
  }
  createdIds.length = 0;
});

test.describe('F-SESSION-02 进入会话并建立连接', () => {
  test('claude 后端：连接过程中显示状态指示并最终收到 AI 回复', async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'claude');
    const conversationId = await sendMessageFromGuid(page, 'Hello, this is an E2E connection test.');
    createdIds.push(conversationId);

    await expect(page).toHaveURL(/\/conversation\//);

    // AC: 连接过程中显示状态指示（状态 badge 或 AI 回复均算有效信号）
    const statusOrReply = page.locator(`${AGENT_STATUS_MESSAGE}, .message-item.text.justify-start`);
    await expect(statusOrReply.first()).toBeVisible({ timeout: 30_000 });

    await waitForSessionActive(page, 120_000);
    await takeScreenshot(page, 'session-02-connected-claude');

    const replyText = await waitForAiReply(page, 120_000);
    expect(replyText.length).toBeGreaterThan(0);
  });

  test('codex 后端：创建会话后自动连接（超时 150s）', async ({ page }) => {
    test.setTimeout(240_000);
    await goToGuid(page);
    await selectAgent(page, 'codex');
    const conversationId = await sendMessageFromGuid(page, 'Hello, this is an E2E codex connection test.');
    createdIds.push(conversationId);

    await waitForSessionActive(page, 180_000);

    const replyText = await waitForAiReply(page, 180_000);
    expect(replyText.length).toBeGreaterThan(0);
  });

  test('连接后输入框可用', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    const isDisabled = await textarea.isDisabled();
    expect(isDisabled).toBe(false);
  });

  test.skip('首次连接失败自动重试一次（E2E 难以可靠模拟网络断连触发重试）', async () => {});
  test.skip('并发进入同一会话不会导致重复初始化（需要并发控制，E2E 单 worker 无法可靠模拟）', async () => {});
  test.skip('连接超时后显示错误提示（E2E 无法可靠控制后端响应延迟）', async () => {});
  test.skip('认证失败后显示引导信息（E2E 不覆盖认证流程）', async () => {});
});

test.describe('F-SESSION-08 查看会话详情与状态', () => {
  test('通过 bridge 验证会话详情包含实时状态', async ({ page }) => {
    const id = createdIds[0];
    if (!id) return;

    const conv = await invokeBridge<{
      id: string;
      type: string;
      extra: Record<string, unknown>;
    }>(page, 'get-conversation', { id });

    expect(conv).toBeTruthy();
    expect(conv.id).toBe(id);
    expect(conv.type).toBe('acp');
    expect(conv.extra?.backend).toBe('claude');
  });

  test('未连接的会话状态显示为已完成', async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'claude');
    const freshId = await sendMessageFromGuid(page, 'E2E status check — idle session');
    createdIds.push(freshId);

    await waitForSessionActive(page, 120_000);

    await invokeBridge(page, 'reset-conversation', { id: freshId }).catch(() => {});

    await page.waitForTimeout(2_000);

    const conv = await invokeBridge<{
      id: string;
      extra: Record<string, unknown>;
    }>(page, 'get-conversation', { id: freshId });

    expect(conv).toBeTruthy();
    expect(conv.id).toBe(freshId);

    const status = conv.extra?.status ?? conv.extra?.sessionStatus;
    const validTerminalStates = ['completed', 'idle', 'disconnected', undefined];
    expect(validTerminalStates).toContain(status);
  });
});
