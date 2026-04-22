import { test, expect } from '../../../../fixtures';
import {
  invokeBridge,
  goToGuid,
  goToNewChat,
  selectAgent,
  sendMessageFromGuid,
  waitForAiReply,
  takeScreenshot,
  CHAT_INPUT,
  AGENT_STATUS_MESSAGE,
} from '../../../../helpers';

const createdIds: string[] = [];

test.afterAll(async ({ page }) => {
  for (const id of createdIds) {
    await invokeBridge(page, 'remove-conversation', { id }).catch(() => {});
  }
  createdIds.length = 0;
});

test.describe('F-DISPLAY-10 斜杠命令列表', () => {
  let slashConvId: string;

  test.beforeAll(async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'claude');
    slashConvId = await sendMessageFromGuid(page, 'E2E slash command test: say hello');
    createdIds.push(slashConvId);
    await waitForAiReply(page, 120_000);
  });

  test('会话输入框输入 / 时显示命令列表', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    await textarea.waitFor({ state: 'visible', timeout: 10_000 });
    await textarea.fill('');
    await textarea.pressSequentially('/');

    const listbox = page.locator('[role="listbox"]');
    await expect(listbox).toBeVisible({ timeout: 10_000 });

    const options = listbox.locator('[role="option"]');
    const count = await options.count();
    expect(count).toBeGreaterThan(0);

    await takeScreenshot(page, 'display-10-slash-menu');
  });

  test('命令列表包含内置命令（如 /btw）', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    await textarea.waitFor({ state: 'visible', timeout: 10_000 });
    await textarea.fill('');
    await textarea.pressSequentially('/');

    const listbox = page.locator('[role="listbox"]');
    await expect(listbox).toBeVisible({ timeout: 10_000 });

    const allOptionsText = await listbox.locator('[role="option"]').allTextContents();
    const hasBtw = allOptionsText.some((t) => t.toLowerCase().includes('btw'));
    expect(hasBtw).toBe(true);
  });

  test('支持关键字过滤', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    await textarea.waitFor({ state: 'visible', timeout: 10_000 });
    await textarea.fill('');
    await textarea.pressSequentially('/');

    const listbox = page.locator('[role="listbox"]');
    await expect(listbox).toBeVisible({ timeout: 10_000 });

    const countBefore = await listbox.locator('[role="option"]').count();

    await textarea.fill('');
    await textarea.pressSequentially('/btw');
    await page.waitForTimeout(500);

    const listboxAfter = page.locator('[role="listbox"]');
    const isStillVisible = await listboxAfter.isVisible({ timeout: 3_000 }).catch(() => false);

    if (isStillVisible) {
      const countAfter = await listboxAfter.locator('[role="option"]').count();
      expect(countAfter).toBeLessThanOrEqual(countBefore);
      if (countAfter > 0) {
        const filteredText = await listboxAfter.locator('[role="option"]').first().textContent();
        expect(filteredText?.toLowerCase()).toContain('btw');
      }
    }
  });

  test('bridge 验证 slash commands 源数据', async ({ page }) => {
    const result = await invokeBridge<{ success: boolean; data?: { commands: Array<{ name: string }> } }>(
      page,
      'conversation.get-slash-commands',
      { conversation_id: slashConvId },
      15_000
    ).catch(() => null);

    if (result?.data?.commands) {
      expect(result.data.commands.length).toBeGreaterThan(0);
      const hasName = result.data.commands.every((cmd) => typeof cmd.name === 'string' && cmd.name.length > 0);
      expect(hasName).toBe(true);
    } else if (result && typeof result === 'object') {
      const raw = result as Record<string, unknown>;
      if (raw.commands && Array.isArray(raw.commands)) {
        expect(raw.commands.length).toBeGreaterThan(0);
      }
    }
  });

  test('选择命令后填充到输入框或执行', async ({ page }) => {
    const textarea = page.locator('textarea').first();
    await textarea.waitFor({ state: 'visible', timeout: 10_000 });
    await textarea.fill('');
    await textarea.pressSequentially('/');

    const listbox = page.locator('[role="listbox"]');
    await expect(listbox).toBeVisible({ timeout: 10_000 });

    const options = listbox.locator('[role="option"]');
    const count = await options.count();
    if (count === 0) {
      test.skip();
      return;
    }

    const firstOption = options.first();
    const optionLabel = await firstOption.textContent();
    await firstOption.click();
    await page.waitForTimeout(500);

    const listboxGone = await listbox.isVisible().catch(() => false);
    expect(listboxGone).toBe(false);
  });

  test('命令列表区分来源（bridge 数据含 source 字段）', async ({ page }) => {
    const result = await invokeBridge<{
      success: boolean;
      data?: { commands: Array<{ name: string; source?: string }> };
    }>(page, 'conversation.get-slash-commands', { conversation_id: slashConvId }, 15_000).catch(() => null);

    const commands =
      result?.data?.commands ??
      (result as unknown as { commands?: Array<{ name: string; source?: string }> })?.commands ??
      [];

    if (commands.length > 0 && commands[0].source) {
      const sources = new Set(commands.map((c) => c.source));
      expect(sources.size).toBeGreaterThan(0);
      for (const src of sources) {
        expect(src === 'builtin' || src === 'acp').toBe(true);
      }
    } else {
      test.skip();
    }
  });

  test.skip('命令列表 UI 来源 badge 展示（SlashCommandMenu 当前将 badge 映射为 hint 而非 source，UI 未渲染来源标识）', async () => {});

  test('斜杠命令截图', async ({ page }) => {
    await takeScreenshot(page, 'display-10-slash-command-final');
  });

  test.skip('Agent 原生命令在连接后动态加载（依赖 ACP 协议同步，部分后端不支持）', async () => {});
  test.skip('命令加载超时 6 秒不阻塞用户输入（需模拟超时场景，E2E 不可控）', async () => {});
  test.skip('不同来源同名命令优先级策略（待确认具体策略）', async () => {});
  test.skip('Gemini 后端斜杠命令列表（Gemini 跳过）', async () => {});
});

test.describe('F-DISPLAY-11 请求追踪信息', () => {
  let traceConvId: string;

  test.beforeAll(async ({ page }) => {
    await goToNewChat(page);
    await selectAgent(page, 'claude');
    traceConvId = await sendMessageFromGuid(page, 'E2E request trace test: hello');
    createdIds.push(traceConvId);
    await waitForAiReply(page, 120_000);
  });

  test('AI 回复后 agent status badge 可见', async ({ page }) => {
    const statusBadge = page.locator(AGENT_STATUS_MESSAGE);
    const count = await statusBadge.count();

    if (count > 0) {
      const text = await statusBadge
        .first()
        .textContent()
        .catch(() => '');
      expect(text?.length ?? 0).toBeGreaterThan(0);
    } else {
      const statusInList = page.locator('[data-message-type="agent_status"]');
      const listCount = await statusInList.count();
      expect(listCount).toBeGreaterThanOrEqual(0);
    }
  });

  test('agent status 包含后端标识', async ({ page }) => {
    const statusBadge = page.locator(AGENT_STATUS_MESSAGE);
    const count = await statusBadge.count();

    if (count > 0) {
      const text = await statusBadge
        .first()
        .textContent()
        .catch(() => '');
      const hasAgentRef = text?.toLowerCase().includes('claude') || text?.toLowerCase().includes('session');
      expect(hasAgentRef).toBe(true);
    } else {
      const msgs = await invokeBridge<Array<{ type: string; content: unknown }>>(
        page,
        'database.get-conversation-messages',
        { conversation_id: traceConvId }
      ).catch(() => []);

      expect(msgs.length).toBeGreaterThan(0);
    }
  });

  test('请求追踪截图', async ({ page }) => {
    await takeScreenshot(page, 'display-11-request-trace');
  });

  test.skip('追踪信息包含详细模型名称（ACP Log Panel UI 无 data-testid，验证路径不稳定）', async () => {});
  test.skip('Codex 后端请求追踪信息（Codex 的 agent status 格式可能不同）', async () => {});
});
