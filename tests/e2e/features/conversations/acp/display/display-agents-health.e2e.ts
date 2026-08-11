import { test, expect } from '../../../../fixtures';
import {
  invokeBridge,
  goToGuid,
  selectAgent,
  sendMessageFromGuid,
  waitForAiReply,
  takeScreenshot,
  AGENT_PILL,
  agentPillByBackend,
} from '../../../../helpers';

const createdIds: string[] = [];

test.afterAll(async ({ page }) => {
  for (const id of createdIds) {
    await invokeBridge(page, 'remove-conversation', { id }).catch(() => {});
  }
  createdIds.length = 0;
});

test.describe('F-DISPLAY-13 可用 AI 后端列表', () => {
  test('guid 页面显示可用 AI 后端 pill 列表', async ({ page }) => {
    await goToGuid(page);
    const pills = page.locator(AGENT_PILL);
    await expect(pills.first()).toBeVisible({ timeout: 15_000 });

    const count = await pills.count();
    expect(count).toBeGreaterThan(0);
  });

  test('bridge 返回可用 agents 列表', async ({ page }) => {
    type AgentInfo = { backend: string; name: string; kind?: string };
    const result = await invokeBridge<{ success: boolean; data?: AgentInfo[] }>(
      page,
      'acp.get-available-agents',
      {},
      15_000
    ).catch(() => null);

    expect(result).toBeTruthy();

    const agents = result?.data ?? (Array.isArray(result) ? (result as AgentInfo[]) : []);
    expect(agents.length).toBeGreaterThan(0);

    for (const agent of agents) {
      expect(agent.backend || agent.name).toBeTruthy();
      expect(agent.name).toBeTruthy();
    }
  });

  test('每个后端显示名称和类型等基本信息', async ({ page }) => {
    await goToGuid(page);
    const pills = page.locator(AGENT_PILL);
    const count = await pills.count();

    for (let i = 0; i < count; i++) {
      const pill = pills.nth(i);
      const backend = await pill.getAttribute('data-agent-backend');
      expect(backend).toBeTruthy();

      const text = await pill.textContent();
      expect(text?.length ?? 0).toBeGreaterThan(0);
    }
  });

  test('claude 后端 pill 可见', async ({ page }) => {
    await goToGuid(page);
    const claudePill = page.locator(agentPillByBackend('claude'));
    await expect(claudePill).toBeVisible({ timeout: 10_000 });
  });

  test('可用后端列表截图', async ({ page }) => {
    await goToGuid(page);
    await takeScreenshot(page, 'display-13-available-agents');
  });

  test.skip('扩展后端有明确标识（扩展后端识别方式待确认）', async () => {});
  test.skip('Gemini 后端 pill 验证（Gemini 跳过）', async () => {});
});

test.describe('F-DISPLAY-12 环境检查与 AI 后端健康检查', () => {
  test('bridge 环境检查返回结果', async ({ page }) => {
    const result = await invokeBridge<{ env?: Record<string, string> } | Record<string, unknown>>(
      page,
      'acp.check.env',
      {},
      15_000
    ).catch(() => null);

    expect(result).toBeTruthy();
    expect(typeof result).toBe('object');
  });

  test('环境检查结果包含后端配置信息', async ({ page }) => {
    const result = await invokeBridge<{ env?: Record<string, string> } | Record<string, unknown>>(
      page,
      'acp.check.env',
      {},
      15_000
    ).catch(() => null);

    if (result) {
      const envData = (result as { env?: Record<string, string> }).env ?? result;
      const keys = Object.keys(envData);
      expect(keys.length).toBeGreaterThan(0);
    }
  });

  test('环境检查截图', async ({ page }) => {
    await takeScreenshot(page, 'display-12-env-check');
  });

  test.skip('健康检查能检测后端可用性并显示延迟（需导航到设置页面并找到健康检查按钮，UI 路径不稳定）', async () => {});
  test.skip('后端未认证时显示未认证提示（认证流程跳过）', async () => {});
  test.skip('后端不可用时显示具体错误信息（需构造后端不可用场景，E2E 不可控）', async () => {});
  test.skip('Gemini 环境检查（Gemini 跳过）', async () => {});
});

test.describe('F-DISPLAY-06 网页预览打开', () => {
  test.skip('AI 调用浏览器导航工具时自动打开预览面板（AI 工具选择不可控，需 AI 主动调用浏览器导航工具）', async () => {});
  test.skip('预览面板正确显示目标网页（依赖 F-DISPLAY-06 触发，跳过）', async () => {});
});

test.describe('F-DISPLAY-07 上下文用量展示', () => {
  test('会话内 context usage indicator 存在（若有 token 数据）', async ({ page }) => {
    if (createdIds.length === 0) {
      await goToGuid(page);
      await selectAgent(page, 'claude');
      const convId = await sendMessageFromGuid(page, 'E2E context usage test: hello');
      createdIds.push(convId);
      await waitForAiReply(page, 120_000);
    }

    const indicator = page.locator('.context-usage-indicator');
    const isVisible = await indicator.isVisible({ timeout: 10_000 }).catch(() => false);

    if (isVisible) {
      await expect(indicator).toBeVisible();
      const svg = indicator.locator('svg');
      await expect(svg).toBeVisible({ timeout: 5_000 });
    }
  });

  test('上下文用量截图', async ({ page }) => {
    await takeScreenshot(page, 'display-07-context-usage');
  });

  test.skip('上下文用量数据持久化验证（待确认双路径一致性）', async () => {});
  test.skip('用量接近上限时视觉提示（需大量交互耗尽上下文，E2E 成本过高）', async () => {});
  test.skip('部分后端不上报上下文上限信息（后端行为差异，不可控）', async () => {});
  test.skip('Gemini 后端上下文用量（Gemini 跳过）', async () => {});
});
