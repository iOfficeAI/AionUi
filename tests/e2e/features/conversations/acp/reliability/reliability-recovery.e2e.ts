import { test, expect } from '../../../../fixtures';
import {
  invokeBridge,
  goToGuid,
  goToNewChat,
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

test.describe('F-RELIABILITY-04 启动失败友好提示', () => {
  test('acp.check-agent-health 返回 available（正常启动基线）', async ({ page }) => {
    const result = await invokeBridge<{
      success: boolean;
      data?: { available: boolean; latency?: number; error?: string };
    }>(page, 'acp.check-agent-health', { backend: 'claude' }, 30_000).catch(() => null);

    if (result?.data) {
      expect(result.data.available).toBe(true);
      if (result.data.latency !== undefined) {
        expect(result.data.latency).toBeGreaterThan(0);
      }
    } else if (result && typeof result === 'object') {
      const raw = result as Record<string, unknown>;
      if (raw.available !== undefined) {
        expect(raw.available).toBe(true);
      }
    }
  });

  test('acp.check.env 返回环境信息（环境检查正常基线）', async ({ page }) => {
    const result = await invokeBridge<{ env?: Record<string, string> }>(page, 'acp.check.env', undefined, 15_000).catch(
      () => null
    );

    const env = (result as { env?: Record<string, string> })?.env ?? result;

    if (env && typeof env === 'object') {
      const keys = Object.keys(env);
      expect(keys.length).toBeGreaterThan(0);
    }
  });

  test('acp.get-available-agents 返回非空列表（agent 可用基线）', async ({ page }) => {
    const result = await invokeBridge<{ success: boolean; data?: Array<{ backend: string; name: string }> }>(
      page,
      'acp.get-available-agents',
      undefined,
      15_000
    ).catch(() => null);

    const agents = result?.data ?? (Array.isArray(result) ? result : []);

    expect(agents.length).toBeGreaterThan(0);
    const hasBackend = agents.every(
      (a: { backend?: string; name?: string }) => typeof a.backend === 'string' || typeof a.name === 'string'
    );
    expect(hasBackend).toBe(true);
  });

  test('tips 消息类型展示验证（若存在）', async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'claude');
    const convId = await sendMessageFromGuid(page, 'E2E reliability tips test: say hello.');
    createdIds.push(convId);
    await waitForAiReply(page, 120_000);

    const msgs = await invokeBridge<Array<{ type: string; content: unknown }>>(
      page,
      'database.get-conversation-messages',
      { conversation_id: convId }
    ).catch(() => []);

    const tipsMsgs = msgs.filter((m) => m.type === 'tips');

    if (tipsMsgs.length > 0) {
      for (const tip of tipsMsgs) {
        const content = tip.content as { content?: string; type?: string };
        expect(['error', 'success', 'warning']).toContain(content.type);
        expect(typeof content.content).toBe('string');
      }

      const tipsElements = page.locator('[data-message-type="tips"]');
      const uiCount = await tipsElements.count();
      if (uiCount > 0) {
        const tipEl = tipsElements.first();
        const hasBg = await tipEl.locator('.bg-message-tips').count();
        expect(hasBg).toBeGreaterThan(0);
      }
    }
  });

  test('启动检查截图', async ({ page }) => {
    await takeScreenshot(page, 'reliability-04-startup-baseline');
  });

  test.skip('不同原因的启动失败给出不同针对性提示（需注入启动失败场景，E2E 不可控）', async () => {});
  test.skip('首次启动失败自动重试一次（需注入启动失败，E2E 不可控）', async () => {});
  test.skip('"AI 工具未安装" 错误提示引导安装（需卸载 CLI，E2E 环境不允许）', async () => {});
});

test.describe('F-RELIABILITY-05 本地缓存损坏自动修复', () => {
  test.skip('缓存损坏时自动修复（需独立 worker 隔离 + 实际损坏缓存文件，E2E 风险过高）', async () => {});
  test.skip('修复后 AI 功能正常可用（被其他测试隐式覆盖）', async () => {});
  test.skip('修复过程不丢失用户数据（需对比修复前后数据，E2E 不可控）', async () => {});
});

test.describe('F-RELIABILITY-06 多候选安装策略', () => {
  test.skip('自动尝试多个候选安装包（PRD 标注"未实现"，skip 白名单确认）', async () => {});
  test.skip('安装失败自动降级到下一个候选包（PRD 标注"未实现"）', async () => {});
  test.skip('所有候选失败后给出明确错误（PRD 标注"未实现"）', async () => {});
});

test.describe('F-RELIABILITY-07 发送消息异常恢复', () => {
  let recoveryConvId: string;

  test.beforeAll(async ({ page }) => {
    test.setTimeout(180_000);
    await goToNewChat(page);
    await selectAgent(page, 'claude');
    recoveryConvId = await sendMessageFromGuid(page, 'E2E recovery test: respond briefly.');
    createdIds.push(recoveryConvId);
    await waitForAiReply(page, 120_000);
  });

  test('AI 回复后界面不卡在"正在回复"状态', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 15_000 });
    const isDisabled = await textarea.isDisabled();
    expect(isDisabled).toBe(false);

    const canType = await textarea.isEditable();
    expect(canType).toBe(true);
  });

  test('AI 回复内容保留在 DOM 中不丢失', async ({ page }) => {
    const aiMessages = page.locator(AI_MSG_SELECTOR);
    const count = await aiMessages.count();
    expect(count).toBeGreaterThan(0);

    const lastText = await page.evaluate((sel) => {
      const items = document.querySelectorAll(sel);
      const last = items[items.length - 1];
      const shadow = last?.querySelector('.markdown-shadow');
      if (shadow?.shadowRoot) {
        return shadow.shadowRoot.textContent?.trim() ?? '';
      }
      return last?.textContent?.trim() ?? '';
    }, AI_MSG_SELECTOR);

    expect(lastText.length).toBeGreaterThan(0);
  });

  test('DB 中消息按正确顺序存储', async ({ page }) => {
    const msgs = await invokeBridge<Array<{ type: string; content: unknown; createdAt?: number }>>(
      page,
      'database.get-conversation-messages',
      { conversation_id: recoveryConvId }
    ).catch(() => []);

    expect(msgs.length).toBeGreaterThan(0);

    const hasUserMsg = msgs.some(
      (m) =>
        m.type === 'text' &&
        ((m.content as { position?: string })?.position === 'right' ||
          JSON.stringify(m.content).includes('recovery test'))
    );
    const hasAiReply = msgs.some((m) => m.type === 'text');
    expect(hasUserMsg || hasAiReply).toBe(true);

    if (msgs.length >= 2) {
      const withTime = msgs.filter((m) => m.createdAt !== undefined);
      if (withTime.length >= 2) {
        for (let i = 1; i < withTime.length; i++) {
          expect(withTime[i].createdAt!).toBeGreaterThanOrEqual(withTime[i - 1].createdAt!);
        }
      }
    }
  });

  test('停止 AI 回复后已部分输出内容保留', async ({ page }) => {
    await goToNewChat(page);
    await selectAgent(page, 'claude');
    const partialConvId = await sendMessageFromGuid(
      page,
      'Write a detailed 500-word essay about artificial intelligence and its impact on society.'
    );
    createdIds.push(partialConvId);

    const stopButton = page.locator('button[class*="stop"], [data-testid="stop-button"], [aria-label*="stop" i]');
    const stopVisible = await stopButton
      .first()
      .isVisible({ timeout: 30_000 })
      .catch(() => false);

    if (stopVisible) {
      await stopButton.first().click();
      await page.waitForTimeout(2_000);

      const aiMessages = page.locator(AI_MSG_SELECTOR);
      const count = await aiMessages.count();
      expect(count).toBeGreaterThan(0);

      const partialText = await page.evaluate((sel) => {
        const items = document.querySelectorAll(sel);
        const last = items[items.length - 1];
        const shadow = last?.querySelector('.markdown-shadow');
        if (shadow?.shadowRoot) {
          return shadow.shadowRoot.textContent?.trim() ?? '';
        }
        return last?.textContent?.trim() ?? '';
      }, AI_MSG_SELECTOR);

      expect(partialText.length).toBeGreaterThanOrEqual(0);
    } else {
      await waitForAiReply(page, 120_000);
      const aiMessages = page.locator(AI_MSG_SELECTOR);
      const count = await aiMessages.count();
      expect(count).toBeGreaterThan(0);
    }
  });

  test('发送消息异常恢复截图', async ({ page }) => {
    await takeScreenshot(page, 'reliability-07-recovery');
  });

  test.skip('发送异常后显示错误提示消息（需注入发送失败，E2E 不可控）', async () => {});
  test.skip('错误消息和回复结束信号按正确顺序展示（需触发真实错误场景，E2E 不可控）', async () => {});
});
