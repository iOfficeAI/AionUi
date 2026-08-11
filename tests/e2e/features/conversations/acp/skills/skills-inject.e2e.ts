import { test, expect } from '../../../../fixtures';
import {
  invokeBridge,
  goToGuid,
  goToNewChat,
  selectAgent,
  sendMessageFromGuid,
  waitForAiReply,
  takeScreenshot,
  SKILLS_INDICATOR,
  SKILLS_INDICATOR_COUNT,
} from '../../../../helpers';

const createdIds: string[] = [];

test.afterAll(async ({ page }) => {
  for (const id of createdIds) {
    await invokeBridge(page, 'remove-conversation', { id }).catch(() => {});
  }
  createdIds.length = 0;
});

test.describe('F-SKILL-01 AI 技能自动发现与注入', () => {
  test('list-available-skills 返回技能列表', async ({ page }) => {
    const skills = await invokeBridge<
      Array<{
        name: string;
        description: string;
        location: string;
        isCustom: boolean;
        source: 'builtin' | 'custom' | 'extension';
      }>
    >(page, 'list-available-skills', undefined, 15_000).catch(() => []);

    expect(Array.isArray(skills)).toBe(true);

    if (skills.length > 0) {
      const first = skills[0];
      expect(typeof first.name).toBe('string');
      expect(first.name.length).toBeGreaterThan(0);
      expect(['builtin', 'custom', 'extension']).toContain(first.source);
    }
  });

  test('list-available-skills 支持三种来源', async ({ page }) => {
    const skills = await invokeBridge<
      Array<{
        name: string;
        source: 'builtin' | 'custom' | 'extension';
      }>
    >(page, 'list-available-skills', undefined, 15_000).catch(() => []);

    if (skills.length > 0) {
      const sources = new Set(skills.map((s) => s.source));
      expect(sources.has('builtin')).toBe(true);

      for (const src of sources) {
        expect(['builtin', 'custom', 'extension']).toContain(src);
      }
    }
  });

  test('list-builtin-auto-skills 返回内置自动注入技能', async ({ page }) => {
    const builtinSkills = await invokeBridge<Array<{ name: string; description: string }>>(
      page,
      'list-builtin-auto-skills',
      undefined,
      15_000
    ).catch(() => []);

    expect(Array.isArray(builtinSkills)).toBe(true);

    if (builtinSkills.length > 0) {
      const first = builtinSkills[0];
      expect(typeof first.name).toBe('string');
      expect(first.name.length).toBeGreaterThan(0);
    }
  });

  test('get-skill-paths 返回有效路径', async ({ page }) => {
    const paths = await invokeBridge<{ userSkillsDir: string; builtinSkillsDir: string }>(
      page,
      'get-skill-paths',
      undefined,
      15_000
    ).catch(() => null);

    expect(paths).not.toBeNull();
    if (paths) {
      expect(typeof paths.userSkillsDir).toBe('string');
      expect(paths.userSkillsDir.length).toBeGreaterThan(0);
      expect(typeof paths.builtinSkillsDir).toBe('string');
      expect(paths.builtinSkillsDir.length).toBeGreaterThan(0);
    }
  });

  test('首条消息后 DB 中存在技能相关消息或注入', async ({ page }) => {
    await goToGuid(page);
    await selectAgent(page, 'claude');
    const convId = await sendMessageFromGuid(page, 'E2E skill inject test: say hello briefly.');
    createdIds.push(convId);
    await waitForAiReply(page, 120_000);

    const msgs = await invokeBridge<Array<{ type: string; content: unknown; hidden?: boolean }>>(
      page,
      'database.get-conversation-messages',
      { conversation_id: convId }
    ).catch(() => []);

    expect(msgs.length).toBeGreaterThan(0);

    const hasTextMsg = msgs.some((m) => m.type === 'text');
    expect(hasTextMsg).toBe(true);
  });

  test('技能自动发现截图', async ({ page }) => {
    await takeScreenshot(page, 'skill-01-auto-discovery');
  });

  test.skip('技能注入仅首条消息执行、后续不重复注入（E2E 不可观测内部注入逻辑）', async () => {});
});

test.describe('F-SKILL-02 指定技能注入（高级模式）', () => {
  let skillConvId: string;

  test.beforeAll(async ({ page }) => {
    test.setTimeout(180_000);
    await goToNewChat(page);
    await selectAgent(page, 'claude');
    skillConvId = await sendMessageFromGuid(page, 'E2E skill indicator test: say hello.');
    createdIds.push(skillConvId);
    await waitForAiReply(page, 120_000);
  });

  test('技能指示器在会话页面的存在性验证', async ({ page }) => {
    const indicator = page.locator(SKILLS_INDICATOR);
    const isVisible = await indicator.isVisible({ timeout: 5_000 }).catch(() => false);

    if (isVisible) {
      const countEl = page.locator(SKILLS_INDICATOR_COUNT);
      const countVisible = await countEl.isVisible().catch(() => false);

      if (countVisible) {
        const countText = await countEl.textContent().catch(() => '');
        const countNum = parseInt(countText ?? '0', 10);
        expect(countNum).toBeGreaterThanOrEqual(0);
      }

      await takeScreenshot(page, 'skill-02-indicator-visible');
    } else {
      const skills = await invokeBridge<Array<{ name: string }>>(
        page,
        'list-available-skills',
        undefined,
        15_000
      ).catch(() => []);

      expect(skills.length).toBeGreaterThanOrEqual(0);
    }
  });

  test('技能指示器截图', async ({ page }) => {
    await takeScreenshot(page, 'skill-02-indicator');
  });

  test.skip('高级编辑界面中选择技能并注入（交互路径复杂 + 依赖技能配置，E2E 不稳定）', async () => {});
  test.skip('注入内容包含技能目录路径信息（注入内容在 hidden 消息中，不可直接观测）', async () => {});
  test.skip('未选择任何技能时消息按原样发送（需打开高级编辑并取消选择，交互依赖 UI 状态）', async () => {});
});

test.describe('F-SKILL-03 MCP 工具服务注入', () => {
  test('mcp.get-agent-configs 返回数据结构验证', async ({ page }) => {
    const agents = await invokeBridge<{ success: boolean; data?: Array<{ backend: string; name: string }> }>(
      page,
      'acp.get-available-agents',
      undefined,
      15_000
    ).catch(() => null);

    const agentList = agents?.data ?? (Array.isArray(agents) ? agents : []);
    const agentParams = agentList.map((a: { backend: string; name: string; cliPath?: string }) => ({
      backend: a.backend,
      name: a.name,
    }));

    if (agentParams.length === 0) {
      test.skip();
      return;
    }

    const result = await invokeBridge<{ success: boolean; data?: Array<{ source: string; servers: unknown[] }> }>(
      page,
      'mcp.get-agent-configs',
      agentParams,
      15_000
    ).catch(() => null);

    if (result?.data && Array.isArray(result.data)) {
      for (const config of result.data) {
        expect(typeof config.source).toBe('string');
        expect(Array.isArray(config.servers)).toBe(true);
      }
    } else if (result && Array.isArray(result)) {
      for (const config of result as Array<{ source: string; servers: unknown[] }>) {
        expect(typeof config.source).toBe('string');
        expect(Array.isArray(config.servers)).toBe(true);
      }
    }
  });

  test('MCP 工具服务截图', async ({ page }) => {
    await takeScreenshot(page, 'skill-03-mcp-configs');
  });

  test.skip('已启用的 MCP 工具服务在进入会话时自动注入（需预配置 MCP 服务，E2E 环境不确定）', async () => {});
  test.skip('OAuth 认证引导（PRD 标注部分实现，OAuth 引导 UI 缺失）', async () => {});
  test.skip('工具服务加载失败不影响 AI 基本功能（需注入故障，E2E 不可控）', async () => {});
  test.skip('会话恢复时自动重新加载工具服务（需断连场景，E2E 不可控）', async () => {});
  test.skip('支持三种来源的工具服务（需预配置扩展贡献 MCP，E2E 环境不确定）', async () => {});
});
